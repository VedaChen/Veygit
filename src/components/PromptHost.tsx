import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactElement } from 'react';
import { useStore } from '../store';

/**
 * 通用 prompt 弹窗宿主（对照 VS Code 的输入框 / QuickPick 简化版）：
 * 由 store 的 prompt 状态驱动——kind === 'input' 为文本输入，kind === 'pick' 为单选列表（带筛选）。
 */
export function PromptHost(): ReactElement | null {
  const prompt = useStore((s) => s.prompt);
  const resolvePrompt = useStore((s) => s.resolvePrompt);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 弹窗打开 / 切换时重置输入内容并聚焦
  useEffect(() => {
    if (!prompt) {
      return;
    }
    setText(prompt.kind === 'input' ? (prompt.value ?? '') : '');
    inputRef.current?.focus();
  }, [prompt]);

  // Esc 取消（window 级监听，输入框失焦时也生效）
  useEffect(() => {
    if (!prompt) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        resolvePrompt(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [prompt, resolvePrompt]);

  if (!prompt) {
    return null;
  }

  const items = prompt.kind === 'pick' ? (prompt.items ?? []) : [];
  const f = text.trim().toLowerCase();
  const filtered = f
    ? items.filter(
        (it) =>
          it.label.toLowerCase().includes(f) ||
          (it.description?.toLowerCase().includes(f) ?? false),
      )
    : items;

  /** Enter：input 模式提交当前文本；pick 模式提交第一条过滤结果（有则提交） */
  const submit = (): void => {
    if (prompt.kind === 'input') {
      resolvePrompt(text);
    } else if (filtered.length > 0) {
      resolvePrompt(filtered[0].value);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  return createPortal(
    <div className="picker-overlay" onMouseDown={() => resolvePrompt(null)}>
      <div className="picker" onMouseDown={(e) => e.stopPropagation()}>
        {/* 标题为空时（如凭据弹窗）不渲染标题行，只显示输入框与下方提示 */}
        {prompt.title && <div className="picker-title">{prompt.title}</div>}
        <div className="picker-input-row">
          <i className={`codicon ${prompt.kind === 'pick' ? 'codicon-search' : 'codicon-edit'}`} />
          <input
            ref={inputRef}
            className="picker-input"
            type={prompt.password ? 'password' : 'text'}
            placeholder={prompt.placeholder}
            value={text}
            spellCheck={false}
            autoFocus
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        {prompt.kind === 'input' && prompt.description && (
          <div className="picker-description">{prompt.description}</div>
        )}
        {prompt.kind === 'pick' && (
          <div className="picker-list">
            {filtered.map((it) => (
              <div className="picker-item" key={it.value} onClick={() => resolvePrompt(it.value)}>
                <div className="picker-item-line1">
                  <span className="picker-item-name">{it.label}</span>
                </div>
                {it.description && (
                  <div className="picker-item-line2">
                    <span className="picker-desc">{it.description}</span>
                  </div>
                )}
              </div>
            ))}
            {filtered.length === 0 && <div className="picker-empty">没有匹配的项</div>}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
