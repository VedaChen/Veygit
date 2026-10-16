import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';

export function BranchMenu() {
  const status = useStore((s) => s.status);
  const branches = useStore((s) => s.branches);
  const loadBranches = useStore((s) => s.loadBranches);
  const checkout = useStore((s) => s.checkout);

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const label = status?.branch ?? 'detached HEAD';
  const f = filter.trim().toLowerCase();
  const local = branches.filter((b) => !b.isRemote && b.name.toLowerCase().includes(f));
  const remote = branches.filter((b) => b.isRemote && b.name.toLowerCase().includes(f));
  const typed = filter.trim();
  const canCreate = typed.length > 0 && !branches.some((b) => !b.isRemote && b.name === typed);

  const doCheckout = (name: string, create: boolean) => {
    void checkout(name, create);
    setOpen(false);
    setFilter('');
  };

  return (
    <div className="branch-root" ref={rootRef}>
      <button
        className="branch-btn"
        onClick={() => {
          setOpen(!open);
          if (!open) {
            void loadBranches();
          }
        }}
        title="切换分支"
      >
        <i className="codicon codicon-git-branch" />
        <span className="branch-btn-label">{label}</span>
        <i className="codicon codicon-chevron-down" />
      </button>

      {open && (
        <div className="branch-menu">
          <input
            autoFocus
            className="branch-filter"
            placeholder="切换或创建分支..."
            value={filter}
            spellCheck={false}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && typed) {
                doCheckout(typed, canCreate);
              } else if (e.key === 'Escape') {
                setOpen(false);
              }
            }}
          />
          <div className="branch-list">
            {canCreate && (
              <div className="branch-item create" onClick={() => doCheckout(typed, true)}>
                <span>
                  <i className="codicon codicon-plus" /> 创建分支 “{typed}”
                </span>
              </div>
            )}
            {local.map((b) => (
              <div
                key={`local-${b.name}`}
                className={`branch-item${b.isHead ? ' current' : ''}`}
                onClick={() => {
                  if (!b.isHead) {
                    doCheckout(b.name, false);
                  } else {
                    setOpen(false);
                  }
                }}
              >
                <span className="branch-name">
                  {b.isHead && <i className="codicon codicon-check" />}
                  {b.name}
                </span>
                <span className="branch-hash">{b.commit.slice(0, 7)}</span>
              </div>
            ))}
            {remote.length > 0 && <div className="branch-sep">远程分支</div>}
            {remote.map((b) => {
              const shortName = b.name.split('/').slice(1).join('/');
              return (
                <div
                  key={`remote-${b.name}`}
                  className="branch-item remote"
                  onClick={() => doCheckout(shortName, false)}
                  title={`checkout ${shortName}（跟踪 ${b.name}）`}
                >
                  <span className="branch-name">{b.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
