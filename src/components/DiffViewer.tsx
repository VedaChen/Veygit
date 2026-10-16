import { useEffect, useRef, useState } from 'react';
import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener';
import { languageFor, monaco } from '../monaco-setup';
import { useStore } from '../store';
import type { DiffContent } from '../types';
import { absolutePath, copyText, splitPath } from '../util';
import { Menu } from './Menu';
import type { MenuEntry } from './Menu';

/** 编辑器创建时读取当前生效的主题（后续运行时切换由 App 的全局 setTheme 处理） */
function currentMonacoTheme(): string {
  return document.documentElement.dataset.theme === 'light' ? 'git-panel-light' : 'git-panel-dark';
}

export function DiffViewer() {
  const repo = useStore((s) => s.repos.find((r) => r.info.root === s.activeRoot));
  const selection = useStore((s) => s.selection);
  const diff = useStore((s) => s.diff);
  const patch = useStore((s) => s.patch);

  if (!repo) {
    return <EmptyState icon="codicon-folder-opened" text="打开存储库以开始使用" />;
  }
  if (!selection || selection.repo !== repo.info.root) {
    return <EmptyState icon="codicon-diff" text="选择一处更改以查看差异" />;
  }

  if (selection.kind === 'commit') {
    // 提交中的单个文件：与未提交更改一样使用双栏 diff（内容由 store 的 selectCommitFile 加载到全局 diff）
    if (selection.file) {
      if (diff === null) {
        return <EmptyState icon="codicon-loading spinning" text="加载差异中..." />;
      }
      if (diff.kind === 'binary') {
        return <EmptyState icon="codicon-file-binary" text="二进制文件，无法预览差异" />;
      }
      if (diff.kind === 'tooLarge') {
        return <EmptyState icon="codicon-warning" text="文件过大，无法预览差异" />;
      }
      return (
        <DiffView
          root={repo.info.root}
          path={selection.file}
          rightLabel={selection.hash.slice(0, 7)}
          diff={diff}
        />
      );
    }
    // 无 file：保持整个提交的 patch 视图
    if (patch === null) {
      return <EmptyState icon="codicon-loading spinning" text="加载提交中..." />;
    }
    return (
      <PatchView title={`提交 ${selection.subject}`} icon="codicon-git-commit" patch={patch} />
    );
  }

  if (!diff) {
    return <EmptyState icon="codicon-loading spinning" text="加载差异中..." />;
  }
  if (diff.kind === 'binary') {
    return <EmptyState icon="codicon-file-binary" text="二进制文件，无法预览差异" />;
  }
  if (diff.kind === 'tooLarge') {
    return <EmptyState icon="codicon-warning" text="文件过大，无法预览差异" />;
  }
  return (
    <DiffView
      root={repo.info.root}
      path={selection.path}
      rightLabel={selection.staged ? '索引' : '工作树'}
      diff={diff}
    />
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="empty-state">
      <i className={`codicon ${icon}`} />
      <span>{text}</span>
    </div>
  );
}

/** 图标按钮 className：切换类按钮开启时加 active（加深背景） */
function iconBtnClass(active: boolean): string {
  return active ? 'icon-btn small active' : 'icon-btn small';
}

function DiffView({
  root,
  path,
  rightLabel,
  diff,
}: {
  /** 仓库根（绝对路径），用于“打开文件 / 在资源管理器中显示” */
  root: string;
  path: string;
  rightLabel: string;
  diff: DiffContent;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  /** 当前变更块索引（-1 = 尚未导航，首次导航从首/尾变更块开始） */
  const changeIndexRef = useRef(-1);
  /** 当前变更块的整行高亮装饰（每次导航整体替换） */
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);

  // 编辑器操作工具栏的状态：单栏预览 / 空白字符 / Minimap / 内联视图
  const [preview, setPreview] = useState(false);
  const [showWhitespace, setShowWhitespace] = useState(false);
  const [showMinimap, setShowMinimap] = useState(false);
  const [sideBySide, setSideBySide] = useState(true);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  const closeSelection = useStore((s) => s.clearSelection);
  const { name } = splitPath(path);
  /** 文件的系统绝对路径（打开文件 / 复制路径 / 资源管理器定位共用） */
  const absolute = absolutePath(root, path);

  // 显示选项快照：切换预览导致 diff 编辑器重建时，用于恢复当前选项
  const displayOptionsRef = useRef({ showWhitespace, showMinimap, sideBySide });
  displayOptionsRef.current = { showWhitespace, showMinimap, sideBySide };

  useEffect(() => {
    if (preview) {
      // 预览模式：diff 编辑器不创建（由 FilePreview 替代渲染）
      return;
    }
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const opts = displayOptionsRef.current;
    const editor = monaco.editor.createDiffEditor(el, {
      theme: currentMonacoTheme(),
      readOnly: true,
      originalEditable: false,
      automaticLayout: true,
      renderSideBySide: opts.sideBySide,
      minimap: { enabled: opts.showMinimap },
      renderWhitespace: opts.showWhitespace ? 'all' : 'none',
      scrollBeyondLastLine: false,
      renderOverviewRuler: false,
      fontSize: 12,
      wordWrap: 'off',
      diffAlgorithm: 'advanced',
    });
    editorRef.current = editor;
    return () => {
      editor.dispose();
      editorRef.current = null;
      changeIndexRef.current = -1; // 编辑器重建后变更块索引失效
      decorationsRef.current = null;
    };
  }, [preview]);

  useEffect(() => {
    if (preview) {
      return;
    }
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const lang = languageFor(path);
    const original = monaco.editor.createModel(diff.original, lang);
    const modified = monaco.editor.createModel(diff.modified, lang);
    editor.setModel({ original, modified });
    changeIndexRef.current = -1; // 换了文件内容：变更块导航从头开始
    return () => {
      // 切换预览/组件卸载时清理顺序为「先 dispose editor（创建 effect 先注册先清理）再执行这里」，
      // 对已释放的 editor 调用 setModel 会抛 "InstantiationService has been disposed"，忽略即可
      try {
        editor.setModel(null);
      } catch {
        // editor 已被释放
      }
      original.dispose();
      modified.dispose();
    };
  }, [diff, path, preview]);

  /** 打开文件：用系统默认程序打开工作区中的该文件 */
  const openFile = (): void => {
    void openPath(absolute);
  };

  /** 跳到上一个（dir=-1）/下一个（dir=1）变更块（首尾循环） */
  const goToChange = (dir: 1 | -1): void => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const changes = editor.getLineChanges();
    if (!changes || changes.length === 0) {
      return;
    }
    const n = changes.length;
    if (changeIndexRef.current === -1) {
      // 首次导航：向后从第 1 块开始（对齐 VS Code），向前从最后一块开始
      changeIndexRef.current = dir === 1 ? 0 : n - 1;
    } else {
      changeIndexRef.current = (changeIndexRef.current + dir + n) % n;
    }
    const line = changes[changeIndexRef.current].modifiedStartLineNumber;
    editor.revealLineInCenter(line);
    // 给当前变更块加一整行浅色高亮（每次导航替换上一个）
    if (!decorationsRef.current) {
      decorationsRef.current = editor.createDecorationsCollection([]);
    }
    decorationsRef.current.set([
      {
        range: new monaco.Range(line, 1, line, 1),
        options: { isWholeLine: true, className: 'current-change-line' },
      },
    ]);
  };

  /** 切换空白字符显示（对应 editor.renderWhitespace） */
  const toggleWhitespace = (): void => {
    const next = !showWhitespace;
    setShowWhitespace(next);
    editorRef.current?.updateOptions({ renderWhitespace: next ? 'all' : 'none' });
  };

  /** 切换 Minimap 显示 */
  const toggleMinimap = (): void => {
    const next = !showMinimap;
    setShowMinimap(next);
    editorRef.current?.updateOptions({ minimap: { enabled: next } });
  };

  /** 切换内联视图（并排 ↔ 内联） */
  const toggleSideBySide = (): void => {
    const next = !sideBySide;
    setSideBySide(next);
    editorRef.current?.updateOptions({ renderSideBySide: next });
  };

  /** 切换单栏文件预览（显示当前修改后的内容） */
  const togglePreview = (): void => {
    setPreview(!preview);
  };

  const menuEntries: MenuEntry[] = [
    {
      label: sideBySide ? '切换内联视图' : '切换并排视图',
      onSelect: toggleSideBySide,
    },
    { label: '显示空白字符', checked: showWhitespace, onSelect: toggleWhitespace },
    { label: '显示 Minimap', checked: showMinimap, onSelect: toggleMinimap },
    { separator: true },
    { label: '复制相对路径', onSelect: () => void copyText(path) },
    { label: '复制绝对路径', onSelect: () => void copyText(absolute) },
    { label: '在资源管理器中显示', onSelect: () => void revealItemInDir(absolute) },
  ];

  return (
    <div className="diff-view">
      <div className="tab-bar">
        <div className="tab active" title={path}>
          <i className="codicon codicon-file" />
          <span className="tab-name">{`${name} (${rightLabel})`}</span>
          <button className="tab-close" title="关闭" onClick={() => closeSelection()}>
            <i className="codicon codicon-close" />
          </button>
        </div>
        {/* 编辑器操作工具栏（对照 VS Code diff 编辑器右上角）；图标按钮用原生 title 提示（tab-bar overflow: hidden 会裁掉气泡） */}
        <div className="editor-actions">
          <button className="icon-btn small" title="打开文件" onClick={openFile}>
            <i className="codicon codicon-go-to-file" />
          </button>
          <button className={iconBtnClass(preview)} title="打开侧边预览" onClick={togglePreview}>
            <i className="codicon codicon-open-preview" />
          </button>
          <button className="icon-btn small" title="上一个更改" onClick={() => goToChange(-1)}>
            <i className="codicon codicon-arrow-up" />
          </button>
          <button className="icon-btn small" title="下一个更改" onClick={() => goToChange(1)}>
            <i className="codicon codicon-arrow-down" />
          </button>
          <button
            className={iconBtnClass(showWhitespace)}
            title="切换空白字符显示"
            onClick={toggleWhitespace}
          >
            <i className="codicon codicon-whitespace" />
          </button>
          <button
            className={iconBtnClass(showMinimap)}
            title="切换 Minimap"
            onClick={toggleMinimap}
          >
            <i className="codicon codicon-map" />
          </button>
          <button
            className={iconBtnClass(sideBySide)}
            title="切换内联视图"
            onClick={toggleSideBySide}
          >
            <i className="codicon codicon-split-horizontal" />
          </button>
          <button
            className="icon-btn small"
            title="更多操作"
            onClick={(e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              setMenuPos({ x: r.left, y: r.bottom + 4 });
            }}
          >
            <i className="codicon codicon-ellipsis" />
          </button>
        </div>
      </div>
      {preview ? (
        <FilePreview path={path} content={diff.modified} />
      ) : (
        <div className="diff-editor" ref={containerRef} />
      )}
      {menuPos && (
        <Menu entries={menuEntries} x={menuPos.x} y={menuPos.y} onClose={() => setMenuPos(null)} />
      )}
    </div>
  );
}

/** 单栏只读预览（“打开侧边预览”模式）：显示当前修改后的内容 */
function FilePreview({ path, content }: { path: string; content: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const editor = monaco.editor.create(el, {
      theme: currentMonacoTheme(),
      readOnly: true,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 12,
      wordWrap: 'off',
    });
    editorRef.current = editor;
    return () => {
      editor.dispose();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const model = monaco.editor.createModel(content, languageFor(path));
    editor.setModel(model);
    return () => {
      // 同 PatchView：editor 可能已被卸载流程先释放
      try {
        editor.setModel(null);
      } catch {
        // editor 已被释放
      }
      model.dispose();
    };
  }, [content, path]);

  return <div className="diff-editor" ref={containerRef} />;
}

function PatchView({
  title,
  icon = 'codicon-git-commit',
  patch,
}: {
  title: string;
  /** 标签图标（整个提交用 git-commit，单文件用 file） */
  icon?: string;
  patch: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const closeSelection = useStore((s) => s.clearSelection);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const editor = monaco.editor.create(el, {
      theme: currentMonacoTheme(),
      readOnly: true,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 12,
      wordWrap: 'off',
    });
    editorRef.current = editor;
    return () => {
      editor.dispose();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const model = monaco.editor.createModel(patch, 'diff');
    editor.setModel(model);
    return () => {
      // 同 DiffView：editor 可能已被卸载流程先释放
      try {
        editor.setModel(null);
      } catch {
        // editor 已被释放
      }
      model.dispose();
    };
  }, [patch]);

  return (
    <div className="diff-view">
      <div className="tab-bar">
        <div className="tab active" title={title}>
          <i className={`codicon ${icon}`} />
          <span className="tab-name">{title}</span>
          <button className="tab-close" title="关闭" onClick={() => closeSelection()}>
            <i className="codicon codicon-close" />
          </button>
        </div>
      </div>
      <div className="diff-editor" ref={containerRef} />
    </div>
  );
}
