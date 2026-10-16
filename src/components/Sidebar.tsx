import { useStore } from '../store';
import { RepositoriesSection } from './RepositoriesSection';
import { ChangesSection } from './ChangesSection';
import { GraphSection } from './GraphSection';

export function Sidebar() {
  const activeRoot = useStore((s) => s.activeRoot);
  const refreshAll = useStore((s) => s.refreshAll);
  const openRepository = useStore((s) => s.openRepository);
  const busy = useStore((s) => s.busy);
  const sidebarWidth = useStore((s) => s.sidebarWidth);

  return (
    <aside className="sidebar" style={{ width: sidebarWidth }}>
      <div className="sidebar-header">
        <div className="sidebar-header-title">
          <img className="sidebar-logo" src="/logo.png" alt="Git Panel" />
          <span className="sidebar-title">源代码管理</span>
        </div>
        <div className="sidebar-header-actions">
          <button
            className="icon-btn small"
            title="全部刷新"
            onClick={() => void refreshAll()}
            disabled={busy}
          >
            <i className={`codicon codicon-refresh${busy ? ' spinning' : ''}`} />
          </button>
          <button
            className="icon-btn small"
            title="打开存储库"
            onClick={() => void openRepository()}
            disabled={busy}
          >
            <i className="codicon codicon-add" />
          </button>
        </div>
      </div>
      <div className="sidebar-scroll">
        <RepositoriesSection />
        {activeRoot && <ChangesSection />}
        {activeRoot && <GraphSection />}
      </div>
    </aside>
  );
}
