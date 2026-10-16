import { useState } from 'react';
import { useStore } from '../store';
import type { RepoState } from '../store';

export function CommitBox({ repo }: { repo: RepoState }) {
  const busy = useStore((s) => s.busy);
  const setMessage = useStore((s) => s.setMessage);
  const setAmend = useStore((s) => s.setAmend);
  const commit = useStore((s) => s.commit);
  const [moreOpen, setMoreOpen] = useState(false);

  const root = repo.info.root;
  const status = repo.status;

  const stagedCount = status?.indexChanges.length ?? 0;
  const mergeCount = status?.mergeChanges.length ?? 0;
  const hasStaged = stagedCount > 0 || mergeCount > 0;
  const branch = status?.branch;

  const placeholder = branch
    ? `消息 (Ctrl+Enter 在“${branch}”提交)`
    : '消息 (Ctrl+Enter 提交)';

  const submit = (): void => {
    if (!busy && repo.message.trim() && hasStaged) {
      void commit(root);
    }
  };

  return (
    <div className="commit-box">
      <textarea
        className="commit-input"
        placeholder={placeholder}
        value={repo.message}
        spellCheck={false}
        onChange={(e) => setMessage(root, e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="commit-actions">
        <button
          className="commit-btn"
          disabled={busy || !repo.message.trim() || !hasStaged}
          title={hasStaged ? '提交 (Ctrl+Enter)' : '没有已暂存的更改'}
          onClick={submit}
        >
          <i className="codicon codicon-check" />
          <span>提交</span>
        </button>
        <div className="menu-anchor">
          <button
            className="icon-btn"
            title="更多提交选项"
            onClick={() => setMoreOpen(!moreOpen)}
          >
            <i className="codicon codicon-ellipsis" />
          </button>
          {moreOpen && (
            <div className="menu right" onMouseLeave={() => setMoreOpen(false)}>
              <label className="menu-item check">
                <input
                  type="checkbox"
                  checked={repo.amend}
                  onChange={(e) => setAmend(root, e.target.checked)}
                />
                修正上次提交
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
