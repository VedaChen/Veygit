import { useState } from 'react';
import { confirm } from '@tauri-apps/plugin-dialog';
import { runGitAction } from '../actions';
import { useStore } from '../store';
import type { RepoState } from '../store';
import type { FileChange } from '../types';
import { buildTree, sortChanges } from '../util';
import { SectionHeader } from './Section';
import { CommitBox } from './CommitBox';
import { FileTree } from './FileTree';
import { Menu, buildChangesMenu } from './Menu';

export function ChangesSection() {
  const repo = useStore((s) => s.repos.find((r) => r.info.root === s.activeRoot));
  const collapsed = useStore((s) => !!s.collapsed['section:changes']);
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const sortMode = useStore((s) => s.sortMode);
  const setSortMode = useStore((s) => s.setSortMode);
  const activeRoot = useStore((s) => s.activeRoot);
  const setActive = useStore((s) => s.setActive);
  const busy = useStore((s) => s.busy);
  const stage = useStore((s) => s.stage);
  const discard = useStore((s) => s.discard);
  // 注意：选择器只取 repos，再本地 map，避免每次返回新数组导致重渲染
  const repoRoots = useStore((s) => s.repos).map((r) => r.info.root);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  if (!repo) {
    return null;
  }

  const status = repo.status;
  const total = status
    ? status.mergeChanges.length +
      status.indexChanges.length +
      status.workingTreeChanges.length +
      status.untrackedChanges.length
    : 0;
  // 标题栏“暂存/放弃所有更改”的作用范围：工作区更改 + 未跟踪文件
  const allChanges = status ? [...status.workingTreeChanges, ...status.untrackedChanges] : [];

  const onStageAll = (): void => {
    if (!busy && allChanges.length > 0) {
      void stage(repo.info.root, allChanges);
    }
  };

  const onDiscardAll = async (): Promise<void> => {
    if (allChanges.length === 0) {
      return;
    }
    const ok = await confirm(`放弃 ${allChanges.length} 个文件的更改？此操作不可恢复。`, {
      title: '放弃更改',
      kind: 'warning',
    });
    if (ok) {
      void discard(repo.info.root, allChanges);
    }
  };

  return (
    <section className="section">
      <SectionHeader
        id="section:changes"
        title="更改"
        count={status ? total : undefined}
        actions={
          <>
            <button
              className="icon-btn small"
              title="暂存所有更改"
              disabled={busy || allChanges.length === 0}
              onClick={onStageAll}
            >
              <i className="codicon codicon-check" />
            </button>
            <button
              className="icon-btn small"
              title="放弃所有更改"
              disabled={busy || allChanges.length === 0}
              onClick={() => void onDiscardAll()}
            >
              <i className="codicon codicon-discard" />
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
          </>
        }
      />
      {!collapsed && (
        <>
          <CommitBox repo={repo} />
          {status ? (
            <>
              <ChangeGroup
                repo={repo}
                id="merge"
                title="合并更改"
                changes={status.mergeChanges}
                mode={viewMode}
              />
              <ChangeGroup
                repo={repo}
                id="index"
                title="暂存的更改"
                changes={status.indexChanges}
                mode={viewMode}
              />
              <ChangeGroup
                repo={repo}
                id="working"
                title="更改"
                changes={status.workingTreeChanges}
                mode={viewMode}
              />
              <ChangeGroup
                repo={repo}
                id="untracked"
                title="未跟踪的更改"
                changes={status.untrackedChanges}
                mode={viewMode}
              />
            </>
          ) : (
            <div className="hint-row">
              <i className="codicon codicon-loading spinning" /> 加载中...
            </div>
          )}
        </>
      )}
      {menuPos && (
        <Menu
          entries={buildChangesMenu({
            viewMode,
            sortMode,
            repos: repoRoots,
            activeRoot,
            onViewMode: setViewMode,
            onSortMode: setSortMode,
            onSelectRepo: setActive,
            onAction: (action) => void runGitAction(action, repo.info.root),
          })}
          x={menuPos.x}
          y={menuPos.y}
          onClose={() => setMenuPos(null)}
          onAction={(action) => void runGitAction(action, repo.info.root)}
        />
      )}
    </section>
  );
}

function ChangeGroup({
  repo,
  id,
  title,
  changes,
  mode,
}: {
  repo: RepoState;
  id: string;
  title: string;
  changes: FileChange[];
  mode: 'list' | 'tree';
}) {
  const groupKey = `group:${repo.info.root}:${id}`;
  const collapsed = useStore((s) => !!s.collapsed[groupKey]);
  const toggleGroup = useStore((s) => s.toggleGroup);
  const stage = useStore((s) => s.stage);
  const unstage = useStore((s) => s.unstage);
  const discard = useStore((s) => s.discard);
  const sortMode = useStore((s) => s.sortMode);

  if (changes.length === 0) {
    return null;
  }

  const isIndex = id === 'index';
  const isMerge = id === 'merge';
  const canDiscard = !isMerge;
  // 先按当前排序模式排序，再构建目录树
  const tree = buildTree(sortChanges(changes, sortMode));

  const onDiscardAll = async (): Promise<void> => {
    const ok = await confirm(`丢弃 ${changes.length} 个文件的更改？此操作不可恢复。`, {
      title: '丢弃更改',
      kind: 'warning',
    });
    if (ok) {
      void discard(repo.info.root, changes);
    }
  };

  return (
    <div className="change-group">
      <div className="group-header">
        <button className="group-toggle" onClick={() => toggleGroup(groupKey)}>
          <i className={`codicon codicon-chevron-${collapsed ? 'right' : 'down'}`} />
          <span className="group-title">{title}</span>
          <span className="group-count">{changes.length}</span>
        </button>
        <div className="group-actions">
          {!isIndex && (
            <button
              className="icon-btn small"
              title="全部暂存"
              onClick={() => void stage(repo.info.root, changes)}
            >
              <i className="codicon codicon-plus" />
            </button>
          )}
          {isIndex && (
            <button
              className="icon-btn small"
              title="全部取消暂存"
              onClick={() => void unstage(repo.info.root, changes)}
            >
              <i className="codicon codicon-remove" />
            </button>
          )}
          {canDiscard && (
            <button
              className="icon-btn small"
              title="全部丢弃"
              onClick={() => void onDiscardAll()}
            >
              <i className="codicon codicon-discard" />
            </button>
          )}
        </div>
      </div>
      {!collapsed && <FileTree entries={tree} repo={repo} groupId={id} depth={0} mode={mode} />}
    </div>
  );
}
