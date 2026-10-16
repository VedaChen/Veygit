import { getCurrentWindow } from '@tauri-apps/api/window';

/** 自绘标题栏（窗口无原生边框，由本组件负责拖动与窗口控制） */
export function TitleBar() {
  const win = getCurrentWindow();
  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-title" data-tauri-drag-region>
        <img className="titlebar-logo" src="/logo.png" alt="Veygit" />
        <span>Veygit</span>
      </div>
      <div className="titlebar-controls">
        <button className="titlebar-btn" title="最小化" onClick={() => void win.minimize()}>
          <i className="codicon codicon-chrome-minimize" />
        </button>
        <button className="titlebar-btn" title="最大化" onClick={() => void win.toggleMaximize()}>
          <i className="codicon codicon-chrome-maximize" />
        </button>
        <button className="titlebar-btn close" title="关闭" onClick={() => void win.close()}>
          <i className="codicon codicon-chrome-close" />
        </button>
      </div>
    </div>
  );
}
