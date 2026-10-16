import { useEffect, useRef } from 'react';
import { languageFor, monaco } from '../monaco-setup';
import { useStore } from '../store';
import type { DiffContent } from '../types';

export function DiffViewer() {
  const repo = useStore((s) => s.repo);
  const selection = useStore((s) => s.selection);
  const diff = useStore((s) => s.diff);
  const patch = useStore((s) => s.patch);

  if (!repo) {
    return <EmptyState icon="codicon-folder-opened" text="打开一个 Git 仓库开始" />;
  }
  if (!selection) {
    return <EmptyState icon="codicon-git-commit" text="选择一处更改以查看差异" />;
  }

  if (selection.kind === 'commit') {
    if (patch === null) {
      return <EmptyState icon="codicon-loading spinning" text="加载提交中..." />;
    }
    return <PatchView patch={patch} />;
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
  return <DiffView path={selection.path} staged={selection.staged} diff={diff} />;
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
  staged,
  diff,
}: {
  path: string;
  staged: boolean;
  diff: DiffContent;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);

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
    const lang = languageFor(path);
    const original = monaco.editor.createModel(diff.original, lang);
    const modified = monaco.editor.createModel(diff.modified, lang);
    editor.setModel({ original, modified });
    return () => {
      editor.setModel(null);
      original.dispose();
      modified.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diff, path]);

  return (
    <div className="diff-view">
      <div className="diff-title" title={path}>
        <span>{path}</span>
        <span className="diff-badge">{staged ? 'Index ↔ HEAD' : 'Working Tree ↔ Index'}</span>
      </div>
      <div className="diff-editor" ref={containerRef} />
    </div>
  );
}

function PatchView({ patch }: { patch: string }) {
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
      editor.setModel(null);
      model.dispose();
    };
  }, [patch]);

  return (
    <div className="diff-view">
      <div className="diff-title">
        <span>提交内容</span>
      </div>
      <div className="diff-editor" ref={containerRef} />
    </div>
  );
}
