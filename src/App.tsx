import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useStore } from './store';
import { Sidebar } from './components/Sidebar';
import { DiffViewer } from './components/DiffViewer';
import { StatusBar } from './components/StatusBar';
import { BranchPicker } from './components/BranchPicker';

export default function App() {
  useEffect(() => {
    void useStore.getState().init();

    // 文件监听（Rust 侧 notify）推送的仓库变化事件，payload = 仓库根路径
    const unlisten = listen<string>('repo-changed', (e) => {
      void useStore.getState().refresh(e.payload);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div className="app">
      <div className="body">
        <Sidebar />
        <main className="main">
          <DiffViewer />
        </main>
      </div>
      <StatusBar />
      <BranchPicker />
    </div>
  );
}
