import { useState } from 'react';
import { confirm } from '@tauri-apps/plugin-dialog';
import { useStore } from '../store';
import type { RepoState } from '../store';
import {
  absolutePath,
  collectChanges,
  compactDir,
  copyText,
  splitPath,
  statusColorClass,
  type TreeEntry,
} from '../util';
import { Menu } from './Menu';

/** 文件变更的目录树 / 列表（对照 VS Code SCM 的 tree / list 视图 + 紧凑目录合并） */
export function FileTree({
  entries,
  repo,
  groupId,
  depth,
  mode,
}: {
  entries: TreeEntry[];
  repo: RepoState;
  groupId: string;
  depth: number;
  mode: 'list' | 'tree';
}) {
  // 列表模式：不渲染目录节点，把树深度优先拍平成文件行
  if (mode === 'list') {
    return (
      <>
        {flatten(entries).map((e) => (
          <FileNode
            key={`f:${e.path}`}
            entry={e}
            repo={repo}
            groupId={groupId}
            depth={0}
            showDir
          />
        ))}
      </>
    );
  }
  return (
    <>
      {entries.map((e) =>
        e.isDir ? (
          <DirNode
            key={`d:${e.path}`}
            entry={e}
            repo={repo}
            groupId={groupId}
            depth={depth}
            mode={mode}
          />
        ) : (
          <FileNode key={`f:${e.path}`} entry={e} repo={repo} groupId={groupId} depth={depth} />
        ),
      )}
    </>
  );
}

/** 深度优先拍平目录树，得到有序的文件条目列表 */
function flatten(entries: TreeEntry[]): TreeEntry[] {
  const out: TreeEntry[] = [];
  for (const e of entries) {
    if (e.isDir) {
      out.push(...flatten(e.children));
    } else {
      out.push(e);
    }
  }
  return out;
}

function DirNode({
  entry,
  repo,
  groupId,
  depth,
  mode,
}: {
  entry: TreeEntry;
  repo: RepoState;
  groupId: string;
  depth: number;
  mode: 'list' | 'tree';
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
        <FileTree
          entries={target.children}
          repo={repo}
          groupId={groupId}
          depth={depth + 1}
          mode={mode}
        />
      )}
    </>
  );
}

function FileNode({
  entry,
  repo,
  groupId,
  depth,
  showDir,
}: {
  entry: TreeEntry;
  repo: RepoState;
  groupId: string;
  depth: number;
  showDir?: boolean;
}) {
  const change = entry.change!;
  const { dir } = splitPath(change.path);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
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
  // 仅 working / untracked 组允许放弃更改（index / merge 组不显示）
  const canDiscard = groupId === 'working' || groupId === 'untracked';

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
    <>
      <div
        className={`tree-row file-row${selected ? ' selected' : ''}`}
        style={{ paddingLeft: 6 + depth * 10 }}
        title={change.originalPath ? `${change.originalPath} → ${change.path}` : change.path}
        onClick={() => void selectChange(repo.info.root, change)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setCtxMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        <i className="codicon codicon-file tree-icon file-icon" />
        <span className="tree-name" title={entry.name}>
          {entry.name}
        </span>
        {showDir && dir && <span className="file-path">{dir.replace(/\/$/, '')}</span>}
        <span className="row-actions" onClick={(e) => e.stopPropagation()}>
          {/* title="" 用于屏蔽行级 title，避免与 data-tooltip 气泡同时出现 */}
          <button
            className="icon-btn small"
            title=""
            data-tooltip="打开文件"
            onClick={() => void selectChange(repo.info.root, change)}
          >
            <i className="codicon codicon-go-to-file" />
          </button>
          {canDiscard && (
            <button
              className="icon-btn small"
              title=""
              disabled={busy}
              data-tooltip="放弃更改"
              onClick={() => void onDiscard()}
            >
              <i className="codicon codicon-discard" />
            </button>
          )}
          {!isIndex && (
            <button
              className="icon-btn small"
              title=""
              disabled={busy}
              data-tooltip={isMerge ? '标记为已解决' : '暂存更改'}
              onClick={() => void stage(repo.info.root, [change])}
            >
              <i className="codicon codicon-plus" />
            </button>
          )}
          {isIndex && (
            <button
              className="icon-btn small"
              title=""
              disabled={busy}
              data-tooltip="取消暂存"
              onClick={() => void unstage(repo.info.root, [change])}
            >
              <i className="codicon codicon-remove" />
            </button>
          )}
        </span>
        <span className={`change-status ${statusColorClass(change.status)}`}>{change.status}</span>
      </div>
      {ctxMenu && (
        <Menu
          entries={[
            { label: '复制相对路径', onSelect: () => void copyText(change.path) },
            {
              label: '复制绝对路径',
              onSelect: () => void copyText(absolutePath(repo.info.root, change.path)),
            },
          ]}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </>
  );
}
