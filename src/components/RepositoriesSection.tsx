import { useState } from 'react';
import { runGitAction } from '../actions';
import { useStore } from '../store';
import type { RepoState } from '../store';
import { SectionHeader } from './Section';
import { Menu, buildRepoMenu } from './Menu';

export function RepositoriesSection() {
  const repos = useStore((s) => s.repos);
  const collapsed = useStore((s) => !!s.collapsed['section:repos']);
  const openRepository = useStore((s) => s.openRepository);

  return (
    <section className="section">
      <SectionHeader
        id="section:repos"
        title="存储库"
        count={repos.length}
        actions={
          <button
            className="icon-btn small"
            title="打开存储库"
            onClick={() => void openRepository()}
          >
            <i className="codicon codicon-add" />
          </button>
        }
      />
      {!collapsed &&
        (repos.length === 0 ? (
          <div className="empty-guide">
            <span>尚未打开任何仓库</span>
            <button className="toolbar-btn" onClick={() => void openRepository()}>
              <i className="codicon codicon-folder-opened" /> 打开存储库
            </button>
          </div>
        ) : (
          repos.map((r) => <RepoItem key={r.info.root} repo={r} />)
        ))}
    </section>
  );
}

function RepoItem({ repo }: { repo: RepoState }) {
  const activeRoot = useStore((s) => s.activeRoot);
  const setActive = useStore((s) => s.setActive);
  const closeRepository = useStore((s) => s.closeRepository);
  const sync = useStore((s) => s.sync);
  const openBranchPicker = useStore((s) => s.openBranchPicker);

  // “更多操作”级联菜单的屏幕坐标（null 表示未打开）
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  const root = repo.info.root;
  const status = repo.status;
  const active = activeRoot === root;

  const changesCount = status
    ? status.mergeChanges.length +
      status.indexChanges.length +
      status.workingTreeChanges.length +
      status.untrackedChanges.length
    : 0;

  const branchLabel = status ? (status.branch ?? 'HEAD 已分离') : '…';
  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;

  return (
    <div className={`repo-item${active ? ' active' : ''}`} onClick={() => setActive(root)}>
      <div className="repo-row">
        <i className="codicon codicon-repo repo-icon" />
        <span className="repo-name" title={root}>
          {repo.info.name}
        </span>
        <button
          className="repo-branch"
          title={`当前分支：${branchLabel}（点击切换分支）`}
          onClick={(e) => {
            e.stopPropagation();
            setActive(root);
            openBranchPicker(root);
          }}
        >
          <i className="codicon codicon-git-branch" />
          <span className="repo-branch-name">
            {branchLabel}
            {changesCount > 0 ? '*' : ''}
          </span>
        </button>
        <span className="repo-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="icon-btn small repo-sync-btn"
            title="同步更改（拉取 + 推送）"
            onClick={() => void sync(root, 'sync')}
          >
            <i className="codicon codicon-sync" />
            {/* 计数格式对照 VS Code syncLabel：`behind↓ ahead↑`（数字在前、两段都显示，含 0） */}
            {(ahead > 0 || behind > 0) && (
              <span className="sync-counts">
                <span className="sync-behind" title={`${behind} 个提交待拉取`}>
                  {behind}
                  <i className="codicon codicon-arrow-down" />
                </span>
                <span className="sync-ahead" title={`${ahead} 个提交待推送`}>
                  {ahead}
                  <i className="codicon codicon-arrow-up" />
                </span>
              </span>
            )}
          </button>
          <button
            className="icon-btn small"
            title="更多操作"
            onClick={(e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              setMenuPos({ x: r.left, y: r.bottom + 4 });
            }}
          >
            <i className="codicon codicon-ellipsis" />
          </button>
          {menuPos && (
            <Menu
              entries={buildRepoMenu({
                onAction: (action) => void runGitAction(action, root),
                onCloseRepo: () => void closeRepository(root),
              })}
              x={menuPos.x}
              y={menuPos.y}
              onClose={() => setMenuPos(null)}
              onAction={(action) => void runGitAction(action, root)}
            />
          )}
        </span>
      </div>
    </div>
  );
}
