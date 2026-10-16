/**
 * 界面缩放（对照 VS Code 的 View: Zoom In / Zoom Out / Reset Zoom）
 * 快捷键：Ctrl+= 放大、Ctrl+- 缩小、Ctrl+0 重置；另支持 Ctrl+滚轮。
 * 实现：Chromium 的 CSS zoom（每级 1.2 倍，与 VS Code 的 zoom level 一致），持久化到 localStorage。
 */

const ZOOM_KEY = 'vscode-git-panel.zoomLevel';
const MIN_LEVEL = -3;
const MAX_LEVEL = 8;

let zoomLevel = loadZoomLevel();

function loadZoomLevel(): number {
  try {
    const raw = Number(localStorage.getItem(ZOOM_KEY));
    return Number.isFinite(raw)
      ? Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(raw)))
      : 0;
  } catch {
    return 0;
  }
}

function save(): void {
  try {
    localStorage.setItem(ZOOM_KEY, String(zoomLevel));
  } catch {
    // ignore
  }
}

/** 应用当前缩放（渲染前调用可避免闪屏） */
export function applyZoom(): void {
  document.documentElement.style.zoom = String(Math.pow(1.2, zoomLevel));
}

/** 缩放一级（dir: 1 放大 / -1 缩小） */
export function zoomBy(dir: number): void {
  const next = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, zoomLevel + dir));
  if (next === zoomLevel) {
    return;
  }
  zoomLevel = next;
  applyZoom();
  save();
}

/** 重置为 100% */
export function resetZoom(): void {
  zoomLevel = 0;
  applyZoom();
  save();
}

/** 注册全局缩放快捷键（capture 阶段，优先于 Monaco 与 WebView 内置行为）；返回解绑函数 */
export function registerZoomShortcuts(): () => void {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) {
      return;
    }
    if (e.key === '=' || e.key === '+') {
      e.preventDefault();
      e.stopPropagation();
      zoomBy(1);
    } else if (e.key === '-') {
      e.preventDefault();
      e.stopPropagation();
      zoomBy(-1);
    } else if (e.key === '0') {
      e.preventDefault();
      e.stopPropagation();
      resetZoom();
    }
  };
  const onWheel = (e: WheelEvent): void => {
    if (!(e.ctrlKey || e.metaKey)) {
      return;
    }
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1 : -1);
  };
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('wheel', onWheel, { capture: true, passive: false });
  return () => {
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions);
  };
}
