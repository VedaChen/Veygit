import { useEffect, useRef } from 'react';
import { languageFor, monaco } from '../monaco-setup';
import { useStore } from '../store';
import type { DiffContent } from '../types';
import { splitPath } from '../util';

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

function DiffView({
  path,
  rightLabel,
  diff,
}: {
  path: string;
  rightLabel: string;
  diff: DiffContent;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);

  const closeSelection = useStore((s) => s.clearSelection);
  const { name } = splitPath(path);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const editor = monaco.editor.createDiffEditor(el, {
      theme: currentMonacoTheme(),
      readOnly: true,
      originalEditable: false,
      automaticLayout: true,
      renderSideBySide: true,
      minimap: { enabled: false },
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
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const lang = languageFor(path);
    const original = monaco.editor.createModel(diff.original, lang);
    const modified = monaco.editor.createModel(diff.modified, lang);
    editor.setModel({ original, modified });
    return () => {
      // 组件卸载时清理顺序为「先 dispose editor（创建 effect 先注册先清理）再执行这里」，
      // 对已释放的 editor 调用 setModel 会抛 "InstantiationService has been disposed"，忽略即可
      try {
        editor.setModel(null);
      } catch {
        // editor 已被释放
      }
      original.dispose();
      modified.dispose();
    };
  }, [diff, path]);

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
      </div>
      <div className="diff-editor" ref={containerRef} />
    </div>
  );
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
