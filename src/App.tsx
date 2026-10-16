import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useStore } from './store';
import { Toolbar } from './components/Toolbar';
import { CommitBox } from './components/CommitBox';
import { ChangesList } from './components/ChangesList';
import { HistoryList } from './components/HistoryList';
import { DiffViewer } from './components/DiffViewer';
import { StatusBar } from './components/StatusBar';

export default function App() {
  const repo = useStore((s) => s.repo);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);

  // 文件监听（Rust 侧 notify）推送的仓库变化事件
  useEffect(() => {
    const unlisten = listen('repo-changed', () => {
      void useStore.getState().refresh();
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div className="app">
      <Toolbar />
      <div className="body">
        <aside className="sidebar">
          <div className="tabs">
            <button
              className={`tab${view === 'changes' ? ' active' : ''}`}
              onClick={() => setView('changes')}
            >
              <i className="codicon codicon-source-control" /> 更改
            </button>
            <button
              className={`tab${view === 'history' ? ' active' : ''}`}
              onClick={() => setView('history')}
            >
              <i className="codicon codicon-history" /> 历史
            </button>
          </div>
          {!repo ? (
            <div className="empty-hint column">
              <span>尚未打开仓库</span>
              <button
                className="toolbar-btn"
                onClick={() => void useStore.getState().openRepository()}
              >
                <i className="codicon codicon-folder-opened" /> 打开仓库
              </button>
            </div>
          ) : view === 'changes' ? (
            <>
              <CommitBox />
              <div className="scroll-area">
                <ChangesList />
              </div>
            </>
          ) : (
            <div className="scroll-area">
              <HistoryList />
            </div>
          )}
        </aside>
        <main className="main">
          <DiffViewer />
        </main>
      </div>
      <StatusBar />
    </div>
  );
}
