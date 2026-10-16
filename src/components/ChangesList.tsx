import { confirm } from '@tauri-apps/plugin-dialog';
import { useStore } from '../store';
import type { FileChange } from '../types';
import { splitPath, statusColorClass } from '../util';

export function ChangesList() {
  const status = useStore((s) => s.status);
  if (!status) {
    return null;
  }
  return (
    <div className="changes-list">
      <ChangeGroup id="merge" title="Merge Changes" changes={status.mergeChanges} />
      <ChangeGroup id="index" title="Staged Changes" changes={status.indexChanges} />
      <ChangeGroup id="working" title="Changes" changes={status.workingTreeChanges} />
      <ChangeGroup id="untracked" title="Untracked Changes" changes={status.untrackedChanges} />
    </div>
  );
}

function ChangeGroup({
  id,
  title,
  changes,
}: {
  id: string;
  title: string;
  changes: FileChange[];
}) {
  const collapsed = useStore((s) => !!s.collapsed[id]);
  const toggleGroup = useStore((s) => s.toggleGroup);
  const stage = useStore((s) => s.stage);
  const unstage = useStore((s) => s.unstage);
  const discard = useStore((s) => s.discard);

  if (changes.length === 0) {
    return null;
  }

  const isIndex = id === 'index';
  const canDiscard = id !== 'merge';

  const onDiscardAll = async () => {
    const ok = await confirm(
      `丢弃以下 ${changes.length} 个文件的更改？此操作不可恢复。`,
      { title: 'Discard Changes', kind: 'warning' },
    );
    if (ok) {
      void discard(changes);
    }
  };

  return (
    <section className="change-group">
      <div className="group-header">
        <button className="group-toggle" onClick={() => toggleGroup(id)}>
          <i className={`codicon codicon-chevron-${collapsed ? 'right' : 'down'}`} />
          <span className="group-title">{title}</span>
          <span className="group-count">{changes.length}</span>
        </button>
        <div className="group-actions">
          {!isIndex && (
            <button
              className="icon-btn small"
              title="全部暂存"
              onClick={() => void stage(changes)}
            >
              <i className="codicon codicon-plus" />
            </button>
          )}
          {isIndex && (
            <button
              className="icon-btn small"
              title="全部取消暂存"
              onClick={() => void unstage(changes)}
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
      {!collapsed &&
        changes.map((c) => (
          <ChangeRow key={`${c.path}-${c.staged}`} change={c} groupId={id} />
        ))}
    </section>
  );
}

function ChangeRow({ change, groupId }: { change: FileChange; groupId: string }) {
  const selection = useStore((s) => s.selection);
  const selectChange = useStore((s) => s.selectChange);
  const stage = useStore((s) => s.stage);
  const unstage = useStore((s) => s.unstage);
  const discard = useStore((s) => s.discard);
  const busy = useStore((s) => s.busy);

  const selected =
    selection?.kind === 'change' &&
    selection.path === change.path &&
    selection.staged === change.staged;

  const { dir, name } = splitPath(change.path);
  const displayName =
    change.status === 'R' && change.originalPath
      ? `${splitPath(change.originalPath).name} → ${name}`
      : name;

  const isIndex = groupId === 'index';
  const isMerge = groupId === 'merge';
  const isUntracked = groupId === 'untracked';

  const onDiscard = async () => {
    const what = isUntracked ? '删除文件' : '丢弃更改';
    const ok = await confirm(
      `对 ${change.path} ${what}？此操作不可恢复。`,
      { title: 'Discard Changes', kind: 'warning' },
    );
    if (ok) {
      void discard([change]);
    }
  };

  return (
    <div
      className={`change-row${selected ? ' selected' : ''}`}
      onClick={() => void selectChange(change)}
      title={change.path}
    >
      <i className="codicon codicon-file change-icon" />
      <span className="change-name">{displayName}</span>
      {dir && <span className="change-dir">{dir}</span>}
      <span className="change-actions" onClick={(e) => e.stopPropagation()}>
        {!isIndex && (
          <button
            disabled={busy}
            className="icon-btn small"
            title={isMerge ? '标记为已解决（暂存）' : '暂存'}
            onClick={() => void stage([change])}
          >
            <i className="codicon codicon-plus" />
          </button>
        )}
        {isIndex && (
          <button
            disabled={busy}
            className="icon-btn small"
            title="取消暂存"
            onClick={() => void unstage([change])}
          >
            <i className="codicon codicon-remove" />
          </button>
        )}
        {!isMerge && (
          <button
            disabled={busy}
            className="icon-btn small"
            title="丢弃更改"
            onClick={() => void onDiscard()}
          >
            <i className="codicon codicon-discard" />
          </button>
        )}
      </span>
      <span className={`change-status ${statusColorClass(change.status)}`}>
        {change.status}
      </span>
    </div>
  );
}
