import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useStore } from '../store';
import { copyText } from '../util';
import type { ReactElement } from 'react';

/** Homepage URL / Callback URL 的占位值（Device Flow 不使用回调，两处都填它即可） */
const FILL_URL = 'https://github.com';

/** GitHub 新建 OAuth 应用的直达页面 */
const NEW_APP_URL = 'https://github.com/settings/applications/new';

/**
 * GitHub 授权配置引导弹窗（对照 VS Code 首次连接 GitHub 的引导体验）：
 * 内嵌完整的一次性配置步骤——可直接点击打开 GitHub 新建 OAuth 应用页面、复制占位 URL；
 * 用户将 Client ID 粘贴到输入框提交后进入 Device Flow 授权流程。
 */
export function GitHubSetupDialog(): ReactElement | null {
  const open = useStore((s) => s.githubSetupOpen);
  const resolve = useStore((s) => s.resolveGitHubSetup);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 打开弹窗时清空输入并聚焦
  useEffect(() => {
    if (!open) {
      return;
    }
    setText('');
    inputRef.current?.focus();
  }, [open]);

  // Esc 取消
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        resolve(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, resolve]);

  if (!open) {
    return null;
  }

  const submit = (): void => {
    const trimmed = text.trim();
    if (trimmed) {
      resolve(trimmed);
    }
  };

  return createPortal(
    <div className="picker-overlay" onMouseDown={() => resolve(null)}>
      <div className="picker github-setup" onMouseDown={(e) => e.stopPropagation()}>
        <div className="picker-title">连接 GitHub</div>
        <div className="github-setup-body">
          <p className="github-setup-intro">
            首次使用需要在 GitHub 上创建一个 OAuth 应用（一次性配置，约 2
            分钟）。授权直接在 GitHub 完成，不经过任何第三方服务器。
          </p>
          <ol className="github-setup-steps">
            <li>
              打开 GitHub 新建 OAuth 应用页面
              <button
                className="github-setup-link"
                onClick={() =>
                  void openUrl(NEW_APP_URL).catch(() => undefined)
                }
              >
                <i className="codicon codicon-link-external" />
                github.com/settings/applications/new
              </button>
            </li>
            <li>
              名称随意（如 <code>Veygit</code>）；Homepage URL 与 Authorization callback URL
              都填 <code>{FILL_URL}</code>
              <button
                className="github-setup-copy"
                title="复制 https://github.com"
                onClick={() => void copyText(FILL_URL)}
              >
                <i className="codicon codicon-copy" />
              </button>
            </li>
            <li>
              点击 <b>Register application</b> 创建；在应用页面勾选{' '}
              <b>Enable Device Flow</b> 并保存
            </li>
            <li>
              复制页面上的 <b>Client ID</b>，粘贴到下方输入框
            </li>
          </ol>
        </div>
        <div className="picker-input-row">
          <i className="codicon codicon-key" />
          <input
            ref={inputRef}
            className="picker-input"
            placeholder="Client ID"
            value={text}
            spellCheck={false}
            autoFocus
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button className="picker-ok" disabled={!text.trim()} onClick={submit}>
            继续
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
