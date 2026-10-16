/**
 * GitHub OAuth 授权（Device Flow）与仓库 API。
 *
 * 对照 VS Code 的"从 GitHub 添加远程存储库"：授权登录 → 获取账号仓库列表 → 选择后添加为远程。
 * 桌面应用无法安全保存 OAuth client_secret，因此采用 GitHub 官方的 Device Flow：
 * 显示验证码 + 打开浏览器（https://github.com/login/device）→ 用户输入验证码授权 →
 * 应用轮询收取 access_token（无需回调服务器，无需 client_secret）。
 *
 * 网络请求走 tauri-plugin-http（Rust 侧发出，不受 WebView CORS 限制）。
 */

import { fetch } from '@tauri-apps/plugin-http';

const CLIENT_ID_KEY = 'vscode-git-panel.githubClientId';
const TOKEN_KEY = 'vscode-git-panel.githubToken';
const LOGIN_KEY = 'vscode-git-panel.githubLogin';

export function loadGitHubClientId(): string {
  try {
    return localStorage.getItem(CLIENT_ID_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveGitHubClientId(id: string): void {
  try {
    localStorage.setItem(CLIENT_ID_KEY, id);
  } catch {
    // ignore
  }
}

export function clearGitHubClientId(): void {
  try {
    localStorage.removeItem(CLIENT_ID_KEY);
  } catch {
    // ignore
  }
}

export function loadGitHubToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveGitHubToken(token: string, login: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(LOGIN_KEY, login);
  } catch {
    // ignore
  }
}

export function loadGitHubLogin(): string {
  try {
    return localStorage.getItem(LOGIN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function clearGitHubToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LOGIN_KEY);
  } catch {
    // ignore
  }
}

export interface DeviceCode {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

/** 请求设备码（用户在浏览器中输入 user_code 完成授权） */
export async function requestDeviceCode(clientId: string): Promise<DeviceCode> {
  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, scope: 'repo' }),
  });
  const data = (await res.json()) as DeviceCode & { error?: string; error_description?: string };
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || `HTTP ${res.status}`);
  }
  return data;
}

/** 轮询换取 access_token（authorization_pending 时继续等待；用户取消 / 过期 / 拒绝时抛错） */
export async function pollAccessToken(
  clientId: string,
  deviceCode: string,
  intervalSec: number,
  expiresInSec: number,
  isCancelled: () => boolean,
): Promise<string> {
  const deadline = Date.now() + expiresInSec * 1000;
  let interval = Math.max(5, intervalSec) * 1000;
  for (;;) {
    await new Promise((r) => window.setTimeout(r, interval));
    if (isCancelled()) {
      throw new Error('已取消授权');
    }
    if (Date.now() > deadline) {
      throw new Error('验证码已过期，请重试');
    }
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });
    const data = (await res.json()) as { access_token?: string; error?: string };
    if (data.access_token) {
      return data.access_token;
    }
    if (data.error === 'authorization_pending') {
      continue;
    }
    if (data.error === 'slow_down') {
      interval += 5000;
      continue;
    }
    if (data.error === 'expired_token') {
      throw new Error('验证码已过期，请重试');
    }
    if (data.error === 'access_denied') {
      throw new Error('已拒绝授权');
    }
    if (data.error) {
      throw new Error(data.error);
    }
  }
}

/** 获取当前 token 对应的登录名（同时用于校验 token 是否有效） */
export async function fetchGitHubLogin(token: string): Promise<string> {
  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) {
    throw new Error(`GitHub 用户信息获取失败（HTTP ${res.status}）`);
  }
  const data = (await res.json()) as { login: string };
  return data.login;
}

export interface GitHubRepo {
  full_name: string;
  clone_url: string;
  private: boolean;
  description: string | null;
  pushed_at: string | null;
}

/** 列出账号可见的仓库（自己的 + 协作的 + 组织的，最近推送优先） */
export async function fetchGitHubRepos(token: string): Promise<GitHubRepo[]> {
  const res = await fetch(
    'https://api.github.com/user/repos?per_page=100&sort=pushed&direction=desc&affiliation=owner,collaborator,organization_member',
    {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    },
  );
  if (!res.ok) {
    throw new Error(`GitHub 仓库列表获取失败（HTTP ${res.status}）`);
  }
  return (await res.json()) as GitHubRepo[];
}
