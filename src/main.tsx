import React from 'react';
import ReactDOM from 'react-dom/client';
import '@vscode/codicons/dist/codicon.css';
import './theme.css';
import './seti-icons.css';
import './styles.css';
import './monaco-setup';
import App from './App';
import { loadStoredAppearance, resolveTheme } from './theme-mode';

// 渲染前先同步应用初始主题（读取 localStorage + 系统偏好），避免启动闪屏
document.documentElement.dataset.theme = resolveTheme(loadStoredAppearance());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
