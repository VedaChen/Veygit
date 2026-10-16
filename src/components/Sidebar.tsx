import { useStore } from '../store';
import { RepositoriesSection } from './RepositoriesSection';
import { ChangesSection } from './ChangesSection';
import { GraphSection } from './GraphSection';

export function Sidebar() {
  const activeRoot = useStore((s) => s.activeRoot);
  const sidebarWidth = useStore((s) => s.sidebarWidth);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);

  return (
    <aside className="sidebar" style={{ width: sidebarWidth }}>
      <div className="sidebar-header">
        <div className="sidebar-header-title">
          <img className="sidebar-logo" src="/logo.png" alt="Veygit" />
          <span className="sidebar-title">Veygit</span>
        </div>
        <div className="sidebar-header-actions">
          <button
            className="icon-btn small"
            title="设置"
            onClick={() => setSettingsOpen(true)}
          >
            <i className="codicon codicon-settings-gear" />
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
