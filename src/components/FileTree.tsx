import { confirm } from '@tauri-apps/plugin-dialog';
import { useStore } from '../store';
import type { RepoState } from '../store';
import { collectChanges, compactDir, statusColorClass, type TreeEntry } from '../util';

/** 文件变更的目录树（对照 VS Code SCM 的 tree 视图 + 紧凑目录合并） */
export function FileTree({
  entries,
  repo,
  groupId,
  depth,
}: {
  entries: TreeEntry[];
  repo: RepoState;
  groupId: string;
  depth: number;
}) {
  return (
    <>
      {entries.map((e) =>
        e.isDir ? (
          <DirNode key={`d:${e.path}`} entry={e} repo={repo} groupId={groupId} depth={depth} />
        ) : (
          <FileNode key={`f:${e.path}`} entry={e} repo={repo} groupId={groupId} depth={depth} />
        ),
      )}
    </>
  );
}

function DirNode({
  entry,
  repo,
  groupId,
  depth,
}: {
  entry: TreeEntry;
  repo: RepoState;
  groupId: string;
  depth: number;
}) {
  const { label, target } = compactDir(entry);
  const key = `tree:${repo.info.root}:${groupId}:${target.path}`;
  const collapsed = useStore((s) => !!s.collapsed[key]);
  const toggleGroup = useStore((s) => s.toggleGroup);
  const stage = useStore((s) => s.stage);
  const unstage = useStore((s) => s.unstage);
  const discard = useStore((s) => s.discard);

  const changes = collectChanges(target);
  const isIndex = groupId === 'index';
  const isMerge = groupId === 'merge';
  const canDiscard = !isMerge;

  const onDiscardAll = async (): Promise<void> => {
    const ok = await confirm(`丢弃 ${label} 下 ${changes.length} 个文件的更改？此操作不可恢复。`, {
      title: '丢弃更改',
      kind: 'warning',
    });
    if (ok) {
      void discard(repo.info.root, changes);
    }
  };

  return (
    <>
      <div
        className="tree-row dir-row"
        style={{ paddingLeft: 6 + depth * 10 }}
        onClick={() => toggleGroup(key)}
      >
        <i className={`codicon codicon-chevron-${collapsed ? 'right' : 'down'} tree-chevron`} />
        <i className={`codicon codicon-${collapsed ? 'folder' : 'folder-opened'} tree-icon`} />
        <span className="tree-name dir-name">{label}</span>
        <span className="row-actions" onClick={(e) => e.stopPropagation()}>
          {!isIndex && (
            <button
              className="icon-btn small"
              title="暂存目录中的全部更改"
              onClick={() => void stage(repo.info.root, changes)}
            >
              <i className="codicon codicon-plus" />
            </button>
          )}
          {isIndex && (
            <button
              className="icon-btn small"
              title="取消暂存目录中的全部更改"
              onClick={() => void unstage(repo.info.root, changes)}
            >
              <i className="codicon codicon-remove" />
            </button>
          )}
          {canDiscard && (
            <button
              className="icon-btn small"
              title="丢弃目录中的全部更改"
              onClick={() => void onDiscardAll()}
            >
              <i className="codicon codicon-discard" />
            </button>
          )}
        </span>
      </div>
      {!collapsed && (
        <FileTree entries={target.children} repo={repo} groupId={groupId} depth={depth + 1} />
      )}
    </>
  );
}

function FileNode({
  entry,
  repo,
  groupId,
  depth,
}: {
  entry: TreeEntry;
  repo: RepoState;
  groupId: string;
  depth: number;
}) {
  const change = entry.change!;
  const selection = useStore((s) => s.selection);
  const selectChange = useStore((s) => s.selectChange);
  const stage = useStore((s) => s.stage);
  const unstage = useStore((s) => s.unstage);
  const discard = useStore((s) => s.discard);
  const busy = useStore((s) => s.busy);

  const selected =
    selection?.kind === 'change' &&
    selection.repo === repo.info.root &&
    selection.path === change.path &&
    selection.staged === change.staged;

  const isIndex = groupId === 'index';
  const isMerge = groupId === 'merge';
  const isUntracked = groupId === 'untracked';

  const onDiscard = async (): Promise<void> => {
    const what = isUntracked ? '删除该文件' : '丢弃该文件的更改';
    const ok = await confirm(`${what}？此操作不可恢复。`, {
      title: isUntracked ? '删除文件' : '丢弃更改',
      kind: 'warning',
    });
    if (ok) {
      void discard(repo.info.root, [change]);
    }
  };

  return (
    <div
      className={`tree-row file-row${selected ? ' selected' : ''}`}
      style={{ paddingLeft: 6 + depth * 10 }}
      title={change.originalPath ? `${change.originalPath} → ${change.path}` : change.path}
      onClick={() => void selectChange(repo.info.root, change)}
    >
      <i className="codicon codicon-file tree-icon file-icon" />
      <span className="tree-name" title={entry.name}>
        {entry.name}
      </span>
      <span className="row-actions" onClick={(e) => e.stopPropagation()}>
        {!isIndex && (
          <button
            className="icon-btn small"
            disabled={busy}
            title={isMerge ? '标记为已解决（暂存）' : '暂存更改'}
            onClick={() => void stage(repo.info.root, [change])}
          >
            <i className="codicon codicon-plus" />
          </button>
        )}
        {isIndex && (
          <button
            className="icon-btn small"
            disabled={busy}
            title="取消暂存"
            onClick={() => void unstage(repo.info.root, [change])}
          >
            <i className="codicon codicon-remove" />
          </button>
        )}
        {!isMerge && (
          <button
            className="icon-btn small"
            disabled={busy}
            title="丢弃更改"
            onClick={() => void onDiscard()}
          >
            <i className="codicon codicon-discard" />
          </button>
        )}
      </span>
      <span className={`change-status ${statusColorClass(change.status)}`}>{change.status}</span>
    </div>
  );
}
