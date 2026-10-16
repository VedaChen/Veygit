import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useStore } from './store';
import { monaco } from './monaco-setup';
import { Sidebar } from './components/Sidebar';
import { DiffViewer } from './components/DiffViewer';
import { StatusBar } from './components/StatusBar';
import { BranchPicker } from './components/BranchPicker';
import { SettingsPanel } from './components/SettingsPanel';
import { PromptHost } from './components/PromptHost';
import { GitHubSignInDialog } from './components/GitHubSignInDialog';
import { OutputPanel } from './components/OutputPanel';
import { TitleBar } from './components/TitleBar';
import { registerZoomShortcuts } from './zoom';

export default function App() {
  const appearance = useStore((s) => s.appearance);

  useEffect(() => {
    void useStore.getState().init();

    // 全局缩放快捷键（Ctrl+= / Ctrl+- / Ctrl+0，capture 阶段优先于 Monaco）
    const unregisterZoom = registerZoomShortcuts();

    // 文件监听（Rust 侧 notify）推送的仓库变化事件，payload = 仓库根路径
    const unlisten = listen<string>('repo-changed', (e) => {
      void useStore.getState().refresh(e.payload);
    });
    return () => {
      unregisterZoom();
      void unlisten.then((fn) => fn());
    };
  }, []);

  // 应用主题（含"自动"模式跟随系统实时变化）
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (): void => {
      const mode = appearance === 'auto' ? (media.matches ? 'dark' : 'light') : appearance;
      document.documentElement.dataset.theme = mode;
      monaco.editor.setTheme(mode === 'light' ? 'git-panel-light' : 'git-panel-dark');
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [appearance]);

  return (
    <div className="app">
      <TitleBar />
      <div className="body">
        <Sidebar />
        <div
          className="sash"
          title="拖动调整侧栏宽度"
          onPointerDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = useStore.getState().sidebarWidth;
            const onMove = (ev: PointerEvent): void => {
              useStore.getState().setSidebarWidth(startWidth + ev.clientX - startX);
            };
            const onUp = (): void => {
              window.removeEventListener('pointermove', onMove);
              window.removeEventListener('pointerup', onUp);
              document.body.style.cursor = '';
              document.body.style.userSelect = '';
            };
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
          }}
        />
        <main className="main">
          <DiffViewer />
        </main>
      </div>
      <StatusBar />
      <BranchPicker />
      <SettingsPanel />
      <PromptHost />
      <GitHubSignInDialog />
      <OutputPanel />
    </div>
  );
}
