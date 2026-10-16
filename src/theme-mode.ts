import type { AppearanceMode } from './store';

/** 解析当前应生效的主题（auto 跟随系统） */
export function resolveTheme(mode: AppearanceMode): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') {
    return mode;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** 从 localStorage 读取外观模式（与 store 的 loadAppearance 保持一致；供 main.tsx 渲染前使用） */
export function loadStoredAppearance(): AppearanceMode {
  try {
    const raw = localStorage.getItem('vscode-git-panel.appearance');
    return raw === 'light' || raw === 'dark' ? raw : 'auto';
  } catch {
    return 'auto';
  }
}
