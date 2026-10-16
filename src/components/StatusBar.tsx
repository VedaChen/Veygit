import { useStore } from '../store';

export function StatusBar() {
  const notice = useStore((s) => s.notice);
  const repo = useStore((s) => s.repo);
  const status = useStore((s) => s.status);
  const clearNotice = useStore((s) => s.clearNotice);

  const totalChanges = status
    ? status.mergeChanges.length +
      status.indexChanges.length +
      status.workingTreeChanges.length +
      status.untrackedChanges.length
    : 0;

  return (
    <footer className="statusbar">
      <div
        className="status-message"
        onClick={clearNotice}
        title={notice?.text ?? ''}
      >
        {notice && (
          <span className={`notice notice-${notice.level}`}>
            <i
              className={`codicon ${
                notice.level === 'error'
                  ? 'codicon-error'
                  : notice.level === 'success'
                    ? 'codicon-check'
                    : 'codicon-info'
              }`}
            />
            {notice.text.split('\n')[0]}
          </span>
        )}
      </div>
      <div className="status-spacer" />
      {status?.branch && (
        <span className="status-item">
          <i className="codicon codicon-git-branch" /> {status.branch}
        </span>
      )}
      {repo && <span className="status-item">{totalChanges} changes</span>}
      {repo && <span className="status-item">{repo.gitVersion}</span>}
    </footer>
  );
}
