import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ReactElement } from 'react';
import { useStore } from '../store';
import type { AppearanceMode } from '../store';

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
        </div>
      </div>
    </div>,
    document.body,
  );
}
