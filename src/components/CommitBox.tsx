import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import type { RepoState } from '../store';
import { Menu } from './Menu';

export function CommitBox({ repo }: { repo: RepoState }) {
  const busy = useStore((s) => s.busy);
  const setMessage = useStore((s) => s.setMessage);
  const setAmend = useStore((s) => s.setAmend);
  const commit = useStore((s) => s.commit);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  const root = repo.info.root;
  const status = repo.status;

  const stagedCount = status?.indexChanges.length ?? 0;
  const mergeCount = status?.mergeChanges.length ?? 0;
  const hasStaged = stagedCount > 0 || mergeCount > 0;
  const branch = status?.branch;

  const placeholder = branch
    ? `消息 (Ctrl+Enter 在“${branch}”提交)`
    : '消息 (Ctrl+Enter 提交)';

  // 单行起步、按内容自动增高（上限 170px）
  useEffect(() => {
    const el = inputRef.current;
    if (!el) {
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 170)}px`;
  }, [repo.message]);

  const submit = (): void => {
    if (!busy && repo.message.trim() && hasStaged) {
      void commit(root);
    }
  };

  // 以“修正上次提交”方式提交：先同步置 amend（commit 开头会同步读取它），
  // 提交完成后无条件复位，保证失败时也不会影响下一次普通提交
  const commitAmend = async (): Promise<void> => {
    if (busy || !repo.message.trim() || !hasStaged) {
      return;
    }
    setAmend(root, true);
    await commit(root);
    setAmend(root, false);
  };

  return (
    <div className="commit-box">
      <textarea
        ref={inputRef}
        className="commit-input"
        rows={1}
        placeholder={placeholder}
        value={repo.message}
        spellCheck={false}
        onChange={(e) => setMessage(root, e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="commit-split">
        <button
          className="commit-split-main"
          disabled={busy || !repo.message.trim() || !hasStaged}
          title={hasStaged ? '提交 (Ctrl+Enter)' : '没有已暂存的更改'}
          onClick={submit}
        >
          <i className="codicon codicon-check" />
          <span>提交</span>
        </button>
        <button
          className="commit-split-arrow"
          disabled={busy || !repo.message.trim() || !hasStaged}
          title="更多提交操作"
          onClick={(e) => {
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            setMenuPos({ x: r.left, y: r.bottom + 4 });
          }}
        >
          <i className="codicon codicon-chevron-down" />
        </button>
        {menuPos && (
          <Menu
            entries={[
              {
                label: '提交(修改)',
                onSelect: () => void commitAmend(),
              },
            ]}
            x={menuPos.x}
            y={menuPos.y}
            onClose={() => setMenuPos(null)}
          />
        )}
      </div>
    </div>
  );
}
