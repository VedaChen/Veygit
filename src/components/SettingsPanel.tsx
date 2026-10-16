import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactElement } from 'react';
import { useStore } from '../store';
import type { AppearanceMode } from '../store';
import {
  clearGitHubClientId,
  clearGitHubToken,
  loadGitHubClientId,
  loadGitHubLogin,
} from '../github';

const MODES: { value: AppearanceMode; label: string }[] = [
  { value: 'auto', label: '自动' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '暗色' },
];

/** 设置面板（当前仅含"外观模式"；对照 VS Code 设置的简化形态） */
export function SettingsPanel(): ReactElement | null {
  const open = useStore((s) => s.settingsOpen);
  const setOpen = useStore((s) => s.setSettingsOpen);
  const appearance = useStore((s) => s.appearance);
  const setAppearance = useStore((s) => s.setAppearance);
  // GitHub 授权状态（localStorage 读取；清除操作后手动刷新显示）
  const [ghLogin, setGhLogin] = useState('');
  const [ghHasClientId, setGhHasClientId] = useState(false);

  // 每次打开设置面板时刷新 GitHub 状态
  useEffect(() => {
    if (open) {
      setGhLogin(loadGitHubLogin());
      setGhHasClientId(!!loadGitHubClientId());
    }
  }, [open]);

  // Esc 关闭设置面板（仅在打开时监听）
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, setOpen]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="settings-overlay" onMouseDown={() => setOpen(false)}>
      <div className="settings-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span>设置</span>
          <button className="icon-btn small" title="关闭" onClick={() => setOpen(false)}>
            <i className="codicon codicon-close" />
          </button>
        </div>
        <div className="settings-body">
          <div>
            <div className="settings-item-label">外观模式</div>
            <div className="settings-choice">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  className={`settings-choice-btn${appearance === m.value ? ' active' : ''}`}
                  onClick={() => setAppearance(m.value)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="settings-item-label">GitHub 授权</div>
            <div className="settings-item-desc">
              {ghLogin
                ? `已登录：${ghLogin}`
                : ghHasClientId
                  ? '已配置 Client ID（未登录）'
                  : '未配置'}
            </div>
            {(ghLogin || ghHasClientId) && (
              <div className="settings-actions">
                {ghLogin && (
                  <button
                    className="settings-action-btn"
                    title="清除保存的 GitHub 登录令牌（下次添加 GitHub 远程时需重新授权）"
                    onClick={() => {
                      clearGitHubToken();
                      setGhLogin('');
                    }}
                  >
                    退出登录
                  </button>
                )}
                <button
                  className="settings-action-btn"
                  title="清除 Client ID 与登录令牌；下次添加 GitHub 远程时将重新显示配置引导"
                  onClick={() => {
                    clearGitHubToken();
                    clearGitHubClientId();
                    setGhLogin('');
                    setGhHasClientId(false);
                  }}
                >
                  清除配置（重新引导）
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
