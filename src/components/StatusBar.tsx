import { useStore } from '../store';

export function StatusBar() {
  const notice = useStore((s) => s.notice);
  const repo = useStore((s) => s.repos.find((r) => r.info.root === s.activeRoot));
  const clearNotice = useStore((s) => s.clearNotice);
  const status = repo?.status;

  const totalChanges = status
    ? status.mergeChanges.length +
      status.indexChanges.length +
      status.workingTreeChanges.length +
      status.untrackedChanges.length
    : 0;

  return (
    <footer className="statusbar">
      <div className="status-message" onClick={clearNotice} title={notice?.text ?? ''}>
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
      {repo && <span className="status-item">{repo.info.name}</span>}
      {status?.branch && (
        <span className="status-item">
          <i className="codicon codicon-git-branch" /> {status.branch}
        </span>
      )}
      {repo && status && <span className="status-item">{totalChanges} 个更改</span>}
      {repo && <span className="status-item">{repo.info.gitVersion}</span>}
    </footer>
  );
}
