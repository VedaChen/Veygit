import { useCallback } from 'react';
import { useStore } from '../store';

export function CommitBox() {
  const message = useStore((s) => s.message);
  const amend = useStore((s) => s.amend);
  const busy = useStore((s) => s.busy);
  const status = useStore((s) => s.status);
  const setMessage = useStore((s) => s.setMessage);
  const setAmend = useStore((s) => s.setAmend);
  const commit = useStore((s) => s.commit);

  const stagedCount = status?.indexChanges.length ?? 0;
  const hasStaged = stagedCount > 0 || (status?.mergeChanges.length ?? 0) > 0;

  const submit = useCallback(() => {
    if (!busy && message.trim() && hasStaged) {
      void commit();
    }
  }, [busy, message, hasStaged, commit]);

  return (
    <div className="commit-box">
      <textarea
        className="commit-input"
        placeholder="消息 (Ctrl+Enter 提交)"
        value={message}
        spellCheck={false}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="commit-actions">
        <label className="amend-toggle" title="修改上一次提交">
          <input
            type="checkbox"
            checked={amend}
            onChange={(e) => setAmend(e.target.checked)}
          />
          Amend
        </label>
        <button
          className="commit-btn"
          disabled={busy || !message.trim() || !hasStaged}
          onClick={submit}
          title={hasStaged ? '提交 (Ctrl+Enter)' : '没有已暂存的更改'}
        >
          <i className="codicon codicon-check" />
          Commit
          {stagedCount > 0 && <span className="commit-count">{stagedCount}</span>}
        </button>
      </div>
    </div>
  );
}
