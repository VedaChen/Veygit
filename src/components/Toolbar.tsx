import { useStore } from '../store';
import { BranchMenu } from './BranchMenu';

export function Toolbar() {
  const repo = useStore((s) => s.repo);
  const status = useStore((s) => s.status);
  const busy = useStore((s) => s.busy);
  const openRepository = useStore((s) => s.openRepository);
  const refresh = useStore((s) => s.refresh);
  const sync = useStore((s) => s.sync);

  return (
    <header className="toolbar">
      <button
        className="toolbar-btn"
        onClick={() => void openRepository()}
        disabled={busy}
        title="打开仓库"
      >
        <i className="codicon codicon-folder-opened" />
        <span>{repo ? repo.name : '打开仓库'}</span>
      </button>
      {repo && (
        <span className="toolbar-path" title={repo.root}>
          {repo.root}
        </span>
      )}

      <div className="toolbar-spacer" />

      {status && (
        <>
          <BranchMenu />
          <span className="sync-state">
            {status.ahead > 0 && (
              <span title={`${status.ahead} commits ahead`}>
                <i className="codicon codicon-arrow-up" />
                {status.ahead}
              </span>
            )}
            {status.behind > 0 && (
              <span title={`${status.behind} commits behind`}>
                <i className="codicon codicon-arrow-down" />
                {status.behind}
              </span>
            )}
          </span>
          <button
            className="icon-btn"
            title="Fetch"
            onClick={() => void sync('fetch')}
            disabled={busy}
          >
            <i className="codicon codicon-cloud-download" />
          </button>
          <button
            className="icon-btn"
            title="Pull"
            onClick={() => void sync('pull')}
            disabled={busy}
          >
            <i className="codicon codicon-arrow-down" />
          </button>
          <button
            className="icon-btn"
            title="Push"
            onClick={() => void sync('push')}
            disabled={busy}
          >
            <i className="codicon codicon-arrow-up" />
          </button>
        </>
      )}
      <button
        className="icon-btn"
        title="刷新"
        onClick={() => void refresh()}
        disabled={!repo}
      >
        <i className={`codicon codicon-refresh${busy ? ' spinning' : ''}`} />
      </button>
    </header>
  );
}
