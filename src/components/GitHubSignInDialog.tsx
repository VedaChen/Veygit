import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useStore } from '../store';
import { copyText } from '../util';
import {
  clearGitHubClientId,
  fetchGitHubLogin,
  loadGitHubClientId,
  pollAccessToken,
  requestDeviceCode,
  saveGitHubClientId,
  type DeviceCode,
} from '../github';
import type { ReactElement } from 'react';

/** Homepage URL / Callback URL 的占位值（Device Flow 不使用回调，两处都填它即可） */
const FILL_URL = 'https://github.com';

/** GitHub 新建 OAuth 应用的直达页面 */
const NEW_APP_URL = 'https://github.com/settings/applications/new';

/**
 * "连接 GitHub"窗口（对照 VS Code 的 GitHub 登录窗口）：
 * 「浏览器/设备」与「令牌」两个标签——
 * - 浏览器/设备：Device Flow（首次使用内嵌 Client ID 配置步骤；显示验证码 + 打开浏览器，轮询自动完成）；
 * - 令牌：粘贴 Personal access token 登录。
 * 登录成功（或取消）时通过 store 的 resolveGitHubSignIn 返回结果。
 */
export function GitHubSignInDialog(): ReactElement | null {
  const open = useStore((s) => s.githubSignInOpen);
  const resolve = useStore((s) => s.resolveGitHubSignIn);
  const [tab, setTab] = useState<'device' | 'token'>('device');
  // 浏览器/设备流程
  const [clientId, setClientId] = useState('');
  const [needClientId, setNeedClientId] = useState(false);
  const [clientIdInput, setClientIdInput] = useState('');
  const [deviceCode, setDeviceCode] = useState<DeviceCode | null>(null);
  // 令牌流程
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cancelledRef = useRef(false);
  const clientIdRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef<HTMLInputElement>(null);

  // 打开窗口时初始化状态（并读取已保存的 Client ID）
  useEffect(() => {
    if (!open) {
      return;
    }
    cancelledRef.current = false;
    setTab('device');
    setError('');
    setDeviceCode(null);
    setBusy(false);
    setToken('');
    setClientIdInput('');
    const stored = loadGitHubClientId();
    setClientId(stored);
    setNeedClientId(!stored);
  }, [open]);

  // 关闭窗口时停止后台轮询
  useEffect(() => {
    if (!open) {
      cancelledRef.current = true;
    }
  }, [open]);

  /** 结束本次登录（value = 授权结果 / null = 取消），并停止可能的轮询 */
  const finish = (value: { token: string; login: string } | null): void => {
    cancelledRef.current = true;
    resolve(value);
  };

  // Esc 取消
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        finish(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) {
    return null;
  }

  /** 首次配置：保存 Client ID 并进入设备授权视图 */
  const submitClientId = (): void => {
    const id = clientIdInput.trim();
    if (!id) {
      return;
    }
    saveGitHubClientId(id);
    setClientId(id);
    setNeedClientId(false);
    setError('');
  };

  /** 浏览器/设备：请求设备码 → 打开浏览器 → 轮询直到授权完成 */
  const startDeviceFlow = async (): Promise<void> => {
    if (busy || !clientId) {
      return;
    }
    setError('');
    setBusy(true);
    try {
      const dc = await requestDeviceCode(clientId);
      setDeviceCode(dc);
      setBusy(false);
      void openUrl(dc.verification_uri).catch(() => undefined);
      void pollAccessToken(
        clientId,
        dc.device_code,
        dc.interval,
        dc.expires_in,
        () => cancelledRef.current,
      )
        .then(async (t) => {
          const login = await fetchGitHubLogin(t);
          finish({ token: t, login });
        })
        .catch((err) => {
          if (!cancelledRef.current) {
            setError(`授权失败：${String(err)}`);
            setDeviceCode(null);
          }
        });
    } catch (err) {
      setBusy(false);
      setError(
        `授权失败：${String(err)}（请检查 Client ID 是否正确，并已勾选 Enable Device Flow）`,
      );
    }
  };

  /** 令牌：验证 Personal access token 后完成登录 */
  const signInWithToken = async (): Promise<void> => {
    const t = token.trim();
    if (!t || busy) {
      return;
    }
    setError('');
    setBusy(true);
    try {
      const login = await fetchGitHubLogin(t);
      finish({ token: t, login });
    } catch {
      setBusy(false);
      setError('令牌无效，请检查后重试');
    }
  };

  /** 重新配置 Client ID（清除已保存值回到配置视图） */
  const reconfigure = (): void => {
    clearGitHubClientId();
    setClientId('');
    setNeedClientId(true);
    setDeviceCode(null);
    setError('');
  };

  return createPortal(
    <div className="picker-overlay" onMouseDown={() => finish(null)}>
      <div className="gh-signin" onMouseDown={(e) => e.stopPropagation()}>
        <div className="gh-signin-header">
          <span>连接 GitHub</span>
          <button className="icon-btn small" title="关闭" onClick={() => finish(null)}>
            <i className="codicon codicon-close" />
          </button>
        </div>
        <div className="gh-signin-body">
          <div className="gh-signin-brand">GitHub</div>
          <div className="gh-signin-sub">登录</div>
          <div className="gh-signin-divider" />
          <div className="gh-signin-tabs">
            <button
              className={`gh-signin-tab${tab === 'device' ? ' active' : ''}`}
              onClick={() => {
                setTab('device');
                setError('');
              }}
            >
              浏览器/设备
            </button>
            <button
              className={`gh-signin-tab${tab === 'token' ? ' active' : ''}`}
              onClick={() => {
                setTab('token');
                setError('');
                window.setTimeout(() => tokenRef.current?.focus(), 0);
              }}
            >
              令牌
            </button>
          </div>

          {tab === 'device' ? (
            needClientId ? (
              // 首次使用：内嵌 Client ID 配置步骤
              <div className="gh-signin-setup">
                <p className="gh-signin-hint">
                  首次使用需要在 GitHub 上创建一个 OAuth 应用（一次性配置，约 2 分钟）：
                </p>
                <ol className="github-setup-steps">
                  <li>
                    打开新建 OAuth 应用页面
                    <button
                      className="github-setup-link"
                      onClick={() => void openUrl(NEW_APP_URL).catch(() => undefined)}
                    >
                      <i className="codicon codicon-link-external" />
                      github.com/settings/applications/new
                    </button>
                  </li>
                  <li>
                    名称随意（如 Veygit）；Homepage URL 与 Authorization callback URL 都填{' '}
                    <code>{FILL_URL}</code>
                    <button
                      className="github-setup-copy"
                      title="复制 https://github.com"
                      onClick={() => void copyText(FILL_URL)}
                    >
                      <i className="codicon codicon-copy" />
                    </button>
                  </li>
                  <li>
                    勾选 <b>Enable Device Flow</b> 并保存，复制页面上的 Client ID 粘贴到下方
                  </li>
                </ol>
                <div className="gh-signin-input-row">
                  <input
                    ref={clientIdRef}
                    className="gh-signin-input"
                    placeholder="Client ID"
                    value={clientIdInput}
                    spellCheck={false}
                    autoFocus
                    onChange={(e) => setClientIdInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        submitClientId();
                      }
                    }}
                  />
                  <button
                    className="gh-signin-btn"
                    disabled={!clientIdInput.trim()}
                    onClick={submitClientId}
                  >
                    继续
                  </button>
                </div>
              </div>
            ) : deviceCode ? (
              // 等待授权：显示验证码 + 复制并打开浏览器
              <div className="gh-signin-device">
                <p className="gh-signin-hint">在浏览器中输入下面的代码完成授权：</p>
                <div className="gh-signin-code">{deviceCode.user_code}</div>
                <button
                  className="gh-signin-btn primary"
                  onClick={() => {
                    void copyText(deviceCode.user_code);
                    void openUrl(deviceCode.verification_uri).catch(() => undefined);
                  }}
                >
                  <i className="codicon codicon-copy" /> 复制代码并打开浏览器
                </button>
                <p className="gh-signin-hint">
                  <i className="codicon codicon-loading spinning" /> 等待授权完成…（授权后自动继续）
                </p>
              </div>
            ) : (
              // 就绪：开始设备授权
              <div className="gh-signin-device">
                <p className="gh-signin-hint">将打开浏览器完成 GitHub 授权。</p>
                <button
                  className="gh-signin-btn primary"
                  disabled={busy}
                  onClick={() => void startDeviceFlow()}
                >
                  {busy ? (
                    <i className="codicon codicon-loading spinning" />
                  ) : (
                    <i className="codicon codicon-sign-in" />
                  )}{' '}
                  登录
                </button>
              </div>
            )
          ) : (
            // 令牌标签
            <div className="gh-signin-token">
              <div className="gh-signin-input-row">
                <input
                  ref={tokenRef}
                  className="gh-signin-input"
                  type="password"
                  placeholder="个人访问令牌"
                  value={token}
                  spellCheck={false}
                  autoFocus
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void signInWithToken();
                    }
                  }}
                />
                <button
                  className="gh-signin-btn primary"
                  disabled={!token.trim() || busy}
                  onClick={() => void signInWithToken()}
                >
                  {busy ? <i className="codicon codicon-loading spinning" /> : '登录'}
                </button>
              </div>
              <p className="gh-signin-hint">
                在 GitHub → Settings → Developer settings → Personal access tokens
                创建（需勾选 repo 权限）
              </p>
            </div>
          )}

          {error && <div className="gh-signin-error">{error}</div>}
          {tab === 'device' && error && clientId && (
            <button className="gh-signin-relink" onClick={reconfigure}>
              重新配置 Client ID
            </button>
          )}
        </div>
        <div className="gh-signin-footer">
          没有账号？
          <button
            className="gh-signin-signup"
            onClick={() => void openUrl('https://github.com/signup').catch(() => undefined)}
          >
            创建账号
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
