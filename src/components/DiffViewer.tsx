import { useEffect, useRef } from 'react';
import { languageFor, monaco } from '../monaco-setup';
import { useStore, type Selection } from '../store';
import type { DiffContent, FileChange, RepositoryStatus } from '../types';
import { splitPath } from '../util';

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
    if (patch === null) {
      return <EmptyState icon="codicon-loading spinning" text="加载提交中..." />;
    }
    return <PatchView title={`${selection.subject}`} patch={patch} />;
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
  return <DiffView selection={selection} diff={diff} status={repo.status} head={repo.status?.head ?? null} />;
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="empty-state">
      <i className={`codicon ${icon}`} />
      <span>{text}</span>
    </div>
  );
}

function findChange(status: RepositoryStatus | null, sel: Selection): FileChange | undefined {
  if (!status || !sel || sel.kind !== 'change') {
    return undefined;
  }
  const all = [
    ...status.mergeChanges,
    ...status.indexChanges,
    ...status.workingTreeChanges,
    ...status.untrackedChanges,
  ];
  return all.find((c) => c.path === sel.path && c.staged === sel.staged);
}

function DiffView({
  selection,
  diff,
  status,
  head,
}: {
  selection: Extract<Selection, { kind: 'change' }>;
  diff: DiffContent;
  status: RepositoryStatus | null;
  head: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);

  const { name } = splitPath(selection.path);
  const change = findChange(status, selection);
  const isUntracked = change?.status === '?';
  const headShort = head ? head.slice(0, 7) : 'HEAD';

  const leftRef = selection.staged ? headShort : isUntracked ? '空' : '索引';
  const rightRef = selection.staged ? '索引' : '工作区';

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const editor = monaco.editor.createDiffEditor(el, {
      theme: 'git-panel-dark',
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
    const lang = languageFor(selection.path);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diff, selection.path]);

  return (
    <div className="diff-view">
      <div className="diff-title" title={selection.path}>
        <i className="codicon codicon-file" />
        <span className="diff-file-name">{name}</span>
        <span className="diff-badge">{leftRef}</span>
        <span className="diff-arrow">↔</span>
        <span className="diff-badge">{rightRef}</span>
        <span className="diff-full-path">{selection.path}</span>
      </div>
      <div className="diff-editor" ref={containerRef} />
    </div>
  );
}

function PatchView({ title, patch }: { title: string; patch: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const editor = monaco.editor.create(el, {
      theme: 'git-panel-dark',
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
      <div className="diff-title" title={title}>
        <i className="codicon codicon-git-commit" />
        <span className="diff-file-name">提交 {title}</span>
      </div>
      <div className="diff-editor" ref={containerRef} />
    </div>
  );
}
