import { createPortal } from 'react-dom';
import { useState } from 'react';
import type { ReactElement } from 'react';

export interface MenuEntry {
  label?: string;
  /** 右侧快捷键提示文字，如 'Ctrl+Alt+K' */
  shortcut?: string;
  /** 已勾选（标签前显示 ✓） */
  checked?: boolean;
  /** 灰色禁用 */
  disabled?: boolean;
  /** 分割线（忽略其他字段） */
  separator?: boolean;
  /** 子菜单（悬停自动展开） */
  children?: MenuEntry[];
  /** 触发时回传给 onAction 的动作 id（叶子项） */
  action?: string;
  /** 点击（叶子项）时的动作；未提供则仅关闭菜单 */
  onSelect?: () => void;
}

export interface MenuProps {
  entries: MenuEntry[];
  /** 视口坐标（菜单 fixed 定位） */
  x: number;
  y: number;
  onClose: () => void;
  /** 叶子项 action 回传（优先于 onSelect） */
  onAction?: (action: string) => void;
}

/**
 * VS Code 风格级联下拉菜单：Portal 渲染到 body，fixed 定位在触发点下方；
 * 子菜单的显示/隐藏完全由 CSS（.flyout-item:hover > .flyout-sub）控制，无 JS hover 状态。
 */
export function Menu({ entries, x, y, onClose, onAction }: MenuProps): ReactElement {
  // 菜单宽约 264px、预估高 300px：越界时向内收，保证完整可见（顶部/左侧至少留 8px）
  const left = x + 264 > window.innerWidth ? window.innerWidth - 272 : x;
  const top = y + 300 > window.innerHeight ? Math.max(8, window.innerHeight - 308) : y;

  return createPortal(
    <div className="flyout-overlay" onMouseDown={onClose}>
      <div className="flyout-menu" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()}>
        <MenuEntries entries={entries} onClose={onClose} onAction={onAction} />
      </div>
    </div>,
    document.body,
  );
}

/** 递归渲染菜单条目；子菜单复用自身，支持任意层级级联。
    子菜单的展开状态由 JS 控制（openIndex）：鼠标移开一级项时保持展开，
    仅在悬停到其他一级项时才切换（有子菜单则展开其子菜单，否则收起）。 */
function MenuEntries({
  entries,
  onClose,
  onAction,
}: {
  entries: MenuEntry[];
  onClose: () => void;
  onAction?: (action: string) => void;
}): ReactElement {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <>
      {entries.map((e, i) => {
        if (e.separator) {
          return <div className="flyout-sep" key={i} />;
        }

        const onClick = (): void => {
          if (e.disabled || e.children) {
            return;
          }
          if (e.action && onAction) {
            onAction(e.action);
          } else {
            e.onSelect?.();
          }
          onClose();
        };

        return (
          <div
            className={
              'flyout-item' +
              (e.disabled ? ' disabled' : '') +
              (e.children && openIndex === i ? ' sub-open' : '')
            }
            key={i}
            onClick={onClick}
            onMouseEnter={() => {
              if (e.disabled) {
                return;
              }
              setOpenIndex(e.children ? i : null);
            }}
          >
            {e.checked && <i className="codicon codicon-check flyout-item-check" />}
            <span className="flyout-item-label">{e.label}</span>
            {e.shortcut && <span className="flyout-item-shortcut">{e.shortcut}</span>}
            {e.children && (
              <>
                <i className="codicon codicon-chevron-right flyout-item-arrow" />
                <div className="flyout-sub">
                  <MenuEntries entries={e.children} onClose={onClose} onAction={onAction} />
                </div>
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

/**
 * “拉取”到“显示 GIT 输出”的公共菜单段（存储库菜单与更改菜单共用）；
 * 叶子项一律用 action 字段承载动作 id，点击时由最外层 MenuEntries 回传给 onAction，
 * 因此此处的 onAction 形参仅用于保持调用签名的统一（前缀 _ 表示参数有意不使用）。
 */
function buildGitCommands(_onAction: (action: string) => void): MenuEntry[] {
  return [
    { label: '拉取', action: 'pull' },
    { label: '推送', action: 'push' },
    { label: '克隆', action: 'clone' },
    { label: '签出到...', action: 'checkoutTo' },
    { label: '抓取', action: 'fetch' },
    { separator: true },
    {
      label: '提交',
      children: [
        { label: '提交', action: 'commit' },
        { label: '提交已暂存文件', action: 'commitStaged' },
        { label: '全部提交', shortcut: 'Ctrl+Alt+K', action: 'commitAll' },
        { label: '撤消上次提交', action: 'commitUndo' },
        { label: '中止变基', disabled: true },
        { separator: true },
        { label: '提交(修改)', action: 'commitAmend' },
        { label: '提交已暂存文件(修改)', action: 'commitStagedAmend' },
        { label: '全部提交(修改)', action: 'commitAllAmend' },
        { separator: true },
        { label: '提交(已署名)', action: 'commitSignedOff' },
        { label: '提交已暂存文件(已署名)', action: 'commitStagedSignedOff' },
        { label: '全部提交(已署名)', action: 'commitAllSignedOff' },
      ],
    },
    {
      label: '更改',
      children: [
        { label: '暂存所有更改', action: 'stageAll' },
        { label: '取消暂存所有更改', action: 'unstageAll' },
        { label: '放弃所有更改', action: 'discardAll' },
      ],
    },
    {
      label: '拉取，推送',
      children: [
        { label: '同步', shortcut: 'Ctrl+T', action: 'sync' },
        { separator: true },
        { label: '拉取', action: 'pull' },
        { label: '拉取(变基)', action: 'pullRebase' },
        { label: '拉取自...', action: 'pullFrom' },
        { separator: true },
        { label: '推送', action: 'push' },
        { label: '推送到...', shortcut: 'Ctrl+Shift+K', action: 'pushTo' },
        { separator: true },
        { label: '抓取', action: 'fetch' },
        { label: '抓取(剪除)', action: 'fetchPrune' },
        { label: '从所有远程存储库中抓取', action: 'fetchAll' },
      ],
    },
    {
      label: '分支',
      children: [
        { label: '合并...', action: 'merge' },
        { label: '变基分支...', action: 'rebase' },
        { separator: true },
        { label: '创建分支...', action: 'createBranch' },
        { label: '从现有来源创建新的分支...', action: 'createBranchFrom' },
        { separator: true },
        { label: '重命名分支...', action: 'renameBranch' },
        { label: '删除分支...', action: 'deleteBranch' },
        { label: '删除远程分支...', action: 'deleteRemoteBranch' },
        { separator: true },
        { label: '发布分支...', action: 'publishBranch' },
      ],
    },
    {
      label: '远程',
      children: [
        { label: '添加远程存储库...', action: 'remoteAdd' },
        { label: '删除远程存储库', action: 'remoteRemove' },
      ],
    },
    {
      label: '存储',
      children: [
        { label: '储藏', action: 'stash' },
        { label: '储藏(包含未跟踪)', action: 'stashIncludeUntracked' },
        { label: '储藏暂存', action: 'stashStaged' },
        { separator: true },
        { label: '应用最新储藏', action: 'stashApplyLatest' },
        { label: '应用储藏...', action: 'stashApply' },
        { separator: true },
        { label: '弹出最新储藏', action: 'stashPopLatest' },
        { label: '弹出储藏...', action: 'stashPop' },
        { separator: true },
        { label: '删除储藏...', action: 'stashDrop' },
        { label: '删除所有储藏...', action: 'stashDropAll' },
        { separator: true },
        { label: '查看储藏条目...', action: 'stashView' },
      ],
    },
    {
      label: '标记',
      children: [
        { label: '创建标记...', action: 'tagCreate' },
        { label: '删除标签...', action: 'tagDelete' },
        { label: '删除远程标记...', action: 'tagDeleteRemote' },
        { separator: true },
        { label: '推送标记', action: 'tagPush' },
      ],
    },
    {
      label: '工作树',
      children: [{ label: '创建工作树...', action: 'worktreeCreate' }],
    },
    { separator: true },
    { label: '显示 GIT 输出', action: 'showGitOutput' },
  ];
}

/** 存储库“更多操作”级联菜单数据工厂（对照 VS Code 源代码管理存储库视图） */
export function buildRepoMenu({
  onAction,
  onCloseRepo,
}: {
  onAction: (action: string) => void;
  onCloseRepo: () => void;
}): MenuEntry[] {
  return [
    ...buildGitCommands(onAction),
    { separator: true },
    { label: '关闭存储库', onSelect: onCloseRepo },
  ];
}

/** 从仓库根路径取显示名（最后一段） */
function repoName(root: string): string {
  const parts = root.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : root;
}

export interface ChangesMenuOptions {
  viewMode: 'list' | 'tree';
  sortMode: 'path' | 'name' | 'status';
  /** 已打开的仓库根路径列表 */
  repos: string[];
  activeRoot: string | null;
  onViewMode: (mode: 'list' | 'tree') => void;
  onSortMode: (mode: 'path' | 'name' | 'status') => void;
  onSelectRepo: (root: string) => void;
  onAction: (action: string) => void;
}

/** “更改”标题栏 ⋯ 菜单数据工厂（对照 VS Code 源代码管理 SCM 视图菜单） */
export function buildChangesMenu(opts: ChangesMenuOptions): MenuEntry[] {
  return [
    {
      label: opts.viewMode === 'list' ? '以树形式查看' : '以列表形式查看',
      onSelect: () => opts.onViewMode(opts.viewMode === 'list' ? 'tree' : 'list'),
    },
    {
      label: '查看和排序',
      children: [
        {
          label: '存储库',
          children: opts.repos.map((root) => ({
            label: repoName(root),
            checked: root === opts.activeRoot,
            onSelect: () => opts.onSelectRepo(root),
          })),
        },
        { separator: true },
        { label: '以列表形式查看', checked: opts.viewMode === 'list', onSelect: () => opts.onViewMode('list') },
        { label: '以树形式查看', checked: opts.viewMode === 'tree', onSelect: () => opts.onViewMode('tree') },
        { separator: true },
        { label: '按路径对更改进行排序', checked: opts.sortMode === 'path', onSelect: () => opts.onSortMode('path') },
        { label: '按名称对更改进行排序', checked: opts.sortMode === 'name', onSelect: () => opts.onSortMode('name') },
        { label: '按状态对更改进行排序', checked: opts.sortMode === 'status', onSelect: () => opts.onSortMode('status') },
      ],
    },
    { separator: true },
    ...buildGitCommands(opts.onAction),
  ];
}
