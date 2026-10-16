import { useStore } from '../store';
import { formatRelativeTime } from '../util';

export function HistoryList() {
  const commits = useStore((s) => s.commits);
  const selection = useStore((s) => s.selection);
  const selectCommit = useStore((s) => s.selectCommit);
  const loading = useStore((s) => s.historyLoading);

  if (loading && commits.length === 0) {
    return (
      <div className="empty-hint">
        <i className="codicon codicon-loading spinning" /> 加载中...
      </div>
    );
  }
  if (commits.length === 0) {
    return <div className="empty-hint">没有提交历史</div>;
  }

  return (
    <div className="history-list">
      {commits.map((c) => {
        const selected = selection?.kind === 'commit' && selection.hash === c.hash;
        return (
          <div
            key={c.hash}
            className={`commit-item${selected ? ' selected' : ''}`}
            onClick={() => void selectCommit(c.hash)}
            title={c.subject}
          >
            <div className="commit-subject">{c.subject}</div>
            <div className="commit-meta">
              <span className="commit-author">{c.author}</span>
              <span>{formatRelativeTime(c.timestamp)}</span>
              <span className="commit-hash">{c.shortHash}</span>
            </div>
            {c.refs.length > 0 && (
              <div className="commit-refs">
                {c.refs.map((r) => (
                  <span key={r} className="commit-ref">
                    {r}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
