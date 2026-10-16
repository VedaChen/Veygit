import React from 'react';
import ReactDOM from 'react-dom/client';
import '@vscode/codicons/dist/codicon.css';
import './theme.css';
import './styles.css';
import './monaco-setup';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
