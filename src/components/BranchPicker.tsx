import { useEffect, useRef } from 'react';
import { useStore, type BranchPickerMode } from '../store';
import type { BranchInfo } from '../types';
import { formatRelativeTime } from '../util';

/**
 * 分支快速选择窗口（对照 VS Code "选择要签出的分支或标记" QuickPick）：
 * 搜索框 → 创建新分支… / 创建新分支依据… / 签出已分离… → 分割线 → 本地 / 远程分支列表
 */
export function BranchPicker() {
  const picker = useStore((s) => s.branchPicker);
  const repo = useStore((s) => s.repos.find((r) => r.info.root === s.branchPicker?.repo));
  const closeBranchPicker = useStore((s) => s.closeBranchPicker);
  const setBranchPickerMode = useStore((s) => s.setBranchPickerMode);
  const setBranchPickerFilter = useStore((s) => s.setBranchPickerFilter);
  const pickBranch = useStore((s) => s.pickBranch);
  const createBranch = useStore((s) => s.createBranch);
  const checkoutDetached = useStore((s) => s.checkoutDetached);
  const loadBranches = useStore((s) => s.loadBranches);
  const inputRef = useRef<HTMLInputElement>(null);

  const pickerRepo = picker?.repo ?? null;
  useEffect(() => {
    if (pickerRepo) {
      void loadBranches(pickerRepo);
      inputRef.current?.focus();
    }
  }, [pickerRepo, loadBranches]);

  if (!picker || !repo) {
    return null;
  }

  const branches = repo.branches;
  const f = picker.filter.trim().toLowerCase();
  const local = branches.filter((b) => !b.isRemote && b.name.toLowerCase().includes(f));
  const remote = branches.filter((b) => b.isRemote && b.name.toLowerCase().includes(f));
  const typed = picker.filter.trim();
  const currentBranch = repo.status?.branch ?? null;

  const placeholder =
    picker.mode === 'create'
      ? '输入新分支名称'
      : picker.mode === 'createFrom'
        ? '选择新分支的依据...'
        : picker.mode === 'detached'
          ? '输入 ref、分支名或标签，或从列表选择'
          : '选择要签出的分支或标记';

  const onEnter = (): void => {
    if (!typed) {
      return;
    }
    if (picker.mode === 'create') {
      void createBranch(picker.repo, typed, picker.base);
    } else if (picker.mode === 'detached') {
      void checkoutDetached(picker.repo, typed);
    } else if (picker.mode === 'list') {
      // 完全匹配现有本地分支 → 切换；否则基于当前分支创建并切换
      const exact = branches.find((b) => !b.isRemote && b.name === typed);
      if (exact) {
        if (exact.isHead) {
          closeBranchPicker();
        } else {
          pickBranch(exact);
        }
      } else {
        void createBranch(picker.repo, typed, null);
      }
    }
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (picker.mode === 'list') {
        closeBranchPicker();
      } else {
        setBranchPickerMode('list');
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onEnter();
    }
  };

  return (
    <div className="picker-overlay" onMouseDown={() => closeBranchPicker()}>
      <div className="picker" onMouseDown={(e) => e.stopPropagation()}>
        <div className="picker-input-row">
          <i className="codicon codicon-search" />
          <input
            ref={inputRef}
            className="picker-input"
            placeholder={placeholder}
            value={picker.filter}
            spellCheck={false}
            autoFocus
            onChange={(e) => setBranchPickerFilter(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="picker-list">
          {picker.mode === 'list' && (
            <>
              <button className="picker-action" onClick={() => setBranchPickerMode('create')}>
                <i className="codicon codicon-plus" /> 创建新分支...
              </button>
              <button className="picker-action" onClick={() => setBranchPickerMode('createFrom')}>
                <i className="codicon codicon-plus" /> 创建新分支依据...
              </button>
              <button className="picker-action" onClick={() => setBranchPickerMode('detached')}>
                <i className="codicon codicon-git-commit" /> 签出已分离...
              </button>
              <div className="picker-sep" />
            </>
          )}

          {picker.mode === 'create' && (
            <div className="picker-hint">
              <i className="codicon codicon-plus" />
              <span>
                基于 <b>{picker.base ?? currentBranch ?? 'HEAD'}</b> 创建新分支
                {typed ? (
                  <>
                    {' '}
                    “<b>{typed}</b>”
                  </>
                ) : null}
                ，按 Enter 确认
              </span>
            </div>
          )}

          {picker.mode === 'createFrom' && (
            <div className="picker-hint subdued">
              <i className="codicon codicon-git-branch" />
              <span>请从下面选择一个分支作为新分支的依据</span>
            </div>
          )}

          {picker.mode === 'detached' && (
            <div className="picker-hint subdued">
              <i className="codicon codicon-git-commit" />
              <span>输入 ref 后按 Enter，或点击下面的分支/标签</span>
            </div>
          )}

          {local.map((b) => (
            <BranchItem key={`local-${b.name}`} branch={b} mode={picker.mode} onPick={pickBranch} />
          ))}

          {remote.length > 0 && <div className="picker-group-label">远程分支</div>}
          {remote.map((b) => (
            <BranchItem key={`remote-${b.name}`} branch={b} mode={picker.mode} onPick={pickBranch} />
          ))}

          {local.length === 0 && remote.length === 0 && (
            <div className="picker-empty">没有匹配的分支</div>
          )}
        </div>
      </div>
    </div>
  );
}

function BranchItem({
  branch,
  mode,
  onPick,
}: {
  branch: BranchInfo;
  mode: BranchPickerMode;
  onPick: (b: BranchInfo) => void;
}) {
  const showAb = branch.hasUpstream && (branch.ahead > 0 || branch.behind > 0);

  return (
    <div
      className={`picker-item${branch.isHead ? ' current' : ''}${
        mode === 'create' ? ' inert' : ''
      }`}
      onClick={() => onPick(branch)}
    >
      <div className="picker-item-line1">
        <i className="codicon codicon-git-branch" />
        <span className="picker-item-name">{branch.name}</span>
        {branch.isHead && <i className="codicon codicon-check picker-item-check" />}
        {showAb && (
          <span className="picker-item-ab">
            {branch.behind}↓ {branch.ahead}↑
          </span>
        )}
        {branch.timestamp > 0 && (
          <span className="picker-item-time">
            {showAb ? '• ' : ''}
            {formatRelativeTime(branch.timestamp)}
          </span>
        )}
      </div>
      <div className="picker-item-line2">
        <span className="picker-item-author">{branch.author}</span>
        <span>•</span>
        <span className="mono">{branch.commit.slice(0, 7)}</span>
        <span>•</span>
        <span className="ellipsis">{branch.subject}</span>
      </div>
    </div>
  );
}
