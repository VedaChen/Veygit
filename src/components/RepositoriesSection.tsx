import { useState } from 'react';
import { useStore } from '../store';
import type { RepoState } from '../store';
import { SectionHeader } from './Section';

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

  const [menuOpen, setMenuOpen] = useState(false);

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

  // 同步按钮图标随 ahead/behind 变化（对照 VS Code 的 Sync Changes 图标）
  const syncIcon =
    status && status.ahead > 0 && status.behind > 0
      ? 'codicon-sync'
      : status && status.ahead > 0
        ? 'codicon-cloud-upload'
        : 'codicon-cloud-download';

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
            className="icon-btn small"
            title="同步更改（拉取 + 推送）"
            onClick={() => void sync(root, 'sync')}
          >
            <i className={`codicon ${syncIcon}`} />
          </button>
          <div className="menu-anchor">
            <button
              className="icon-btn small"
              title="更多操作"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <i className="codicon codicon-ellipsis" />
            </button>
            {menuOpen && (
              <div className="menu" onMouseLeave={() => setMenuOpen(false)}>
                <button
                  className="menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    void openBranchPicker(root);
                  }}
                >
                  <i className="codicon codicon-git-branch" /> 切换分支...
                </button>
                <div className="menu-sep" />
                <button
                  className="menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    void sync(root, 'fetch');
                  }}
                >
                  <i className="codicon codicon-cloud-download" /> 获取 (Fetch)
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    void sync(root, 'pull');
                  }}
                >
                  <i className="codicon codicon-arrow-down" /> 拉取 (Pull)
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    void sync(root, 'push');
                  }}
                >
                  <i className="codicon codicon-arrow-up" /> 推送 (Push)
                </button>
                <div className="menu-sep" />
                <button
                  className="menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    void closeRepository(root);
                  }}
                >
                  <i className="codicon codicon-close" /> 关闭存储库
                </button>
              </div>
            )}
          </div>
        </span>
      </div>
    </div>
  );
}
