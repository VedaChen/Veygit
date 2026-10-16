import { confirm } from '@tauri-apps/plugin-dialog';
import { useStore } from '../store';
import type { RepoState } from '../store';
import type { FileChange } from '../types';
import { buildTree } from '../util';
import { SectionHeader } from './Section';
import { CommitBox } from './CommitBox';
import { FileTree } from './FileTree';

export function ChangesSection() {
  const repo = useStore((s) => s.repos.find((r) => r.info.root === s.activeRoot));
  const collapsed = useStore((s) => !!s.collapsed['section:changes']);

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

  return (
    <section className="section">
      <SectionHeader id="section:changes" title="更改" count={status ? total : undefined} />
      {!collapsed && (
        <>
          <CommitBox repo={repo} />
          {status ? (
            <>
              <ChangeGroup repo={repo} id="merge" title="合并更改" changes={status.mergeChanges} />
              <ChangeGroup repo={repo} id="index" title="暂存的更改" changes={status.indexChanges} />
              <ChangeGroup repo={repo} id="working" title="更改" changes={status.workingTreeChanges} />
              <ChangeGroup
                repo={repo}
                id="untracked"
                title="未跟踪的更改"
                changes={status.untrackedChanges}
              />
            </>
          ) : (
            <div className="hint-row">
              <i className="codicon codicon-loading spinning" /> 加载中...
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ChangeGroup({
  repo,
  id,
  title,
  changes,
}: {
  repo: RepoState;
  id: string;
  title: string;
  changes: FileChange[];
}) {
  const groupKey = `group:${repo.info.root}:${id}`;
  const collapsed = useStore((s) => !!s.collapsed[groupKey]);
  const toggleGroup = useStore((s) => s.toggleGroup);
  const stage = useStore((s) => s.stage);
  const unstage = useStore((s) => s.unstage);
  const discard = useStore((s) => s.discard);

  if (changes.length === 0) {
    return null;
  }

  const isIndex = id === 'index';
  const isMerge = id === 'merge';
  const canDiscard = !isMerge;
  const tree = buildTree(changes);

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
      {!collapsed && <FileTree entries={tree} repo={repo} groupId={id} depth={0} />}
    </div>
  );
}
