import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import { useStore } from '../store';

/**
 * GIT 输出面板（对照 VS Code 输出视图的简化版）：
 * fixed 在应用底部的抽屉，逐行显示最近 git 操作的输出，默认关闭。
 */
export function OutputPanel(): ReactElement | null {
  const open = useStore((s) => s.outputOpen);
  const output = useStore((s) => s.output);
  const setOutputOpen = useStore((s) => s.setOutputOpen);
  const clearOutput = useStore((s) => s.clearOutput);
  const bodyRef = useRef<HTMLDivElement>(null);

  // 输出变化 / 面板打开时自动滚动到底部
  useEffect(() => {
    const el = bodyRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [output, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="output-panel">
      <div className="output-header">
        <span className="output-title">GIT 输出</span>
        <div className="output-actions">
          <button className="icon-btn small" title="清空输出" onClick={clearOutput}>
            <i className="codicon codicon-clear-all" />
          </button>
          <button className="icon-btn small" title="关闭输出" onClick={() => setOutputOpen(false)}>
            <i className="codicon codicon-close" />
          </button>
        </div>
      </div>
      <div className="output-body" ref={bodyRef}>
        {output.map((line, i) => (
          <div className="output-line" key={i}>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
