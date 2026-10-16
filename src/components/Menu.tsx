import { createPortal } from 'react-dom';
import type { ReactElement } from 'react';

export interface MenuEntry {
  label?: string;
  /** 右侧快捷键提示文字，如 'Ctrl+Alt+K' */
  shortcut?: string;
  /** 灰色禁用 */
  disabled?: boolean;
  /** 分割线（忽略其他字段） */
  separator?: boolean;
  /** 子菜单（悬停自动展开） */
  children?: MenuEntry[];
  /** 点击（叶子项）时的动作；未提供则仅关闭菜单 */
  onSelect?: () => void;
}

export interface MenuProps {
  entries: MenuEntry[];
  /** 视口坐标（菜单 fixed 定位） */
  x: number;
  y: number;
  onClose: () => void;
}

/**
 * VS Code 风格级联下拉菜单：Portal 渲染到 body，fixed 定位在触发点下方；
 * 子菜单的显示/隐藏完全由 CSS（.flyout-item:hover > .flyout-sub）控制，无 JS hover 状态。
 */
export function Menu({ entries, x, y, onClose }: MenuProps): ReactElement {
  // 菜单宽约 264px、预估高 300px：越界时向内收，保证完整可见（顶部/左侧至少留 8px）
  const left = x + 264 > window.innerWidth ? window.innerWidth - 272 : x;
  const top = y + 300 > window.innerHeight ? Math.max(8, window.innerHeight - 308) : y;

  return createPortal(
    <div className="flyout-overlay" onMouseDown={onClose}>
      <div className="flyout-menu" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()}>
        <MenuEntries entries={entries} onClose={onClose} />
      </div>
    </div>,
    document.body,
  );
}

/** 递归渲染菜单条目；子菜单复用自身，支持任意层级级联 */
function MenuEntries({
  entries,
  onClose,
}: {
  entries: MenuEntry[];
  onClose: () => void;
}): ReactElement {
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
          e.onSelect?.();
          onClose();
        };

        return (
          <div
            className={'flyout-item' + (e.disabled ? ' disabled' : '')}
            key={i}
            onClick={onClick}
          >
            <span className="flyout-item-label">{e.label}</span>
            {e.shortcut && <span className="flyout-item-shortcut">{e.shortcut}</span>}
            {e.children && (
              <>
                <i className="codicon codicon-chevron-right flyout-item-arrow" />
                <div className="flyout-sub">
                  <MenuEntries entries={e.children} onClose={onClose} />
                </div>
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

/** 存储库“更多操作”级联菜单数据工厂（对照 VS Code 源代码管理存储库视图） */
export function buildRepoMenu({
  onSync,
  onCloseRepo,
}: {
  onSync: (op: 'fetch' | 'pull' | 'push' | 'sync') => void;
  onCloseRepo: () => void;
}): MenuEntry[] {
  return [
    { label: '拉取', onSelect: () => onSync('pull') },
    { label: '推送', onSelect: () => onSync('push') },
    { label: '克隆' },
    { label: '签出到...' },
    { label: '抓取', onSelect: () => onSync('fetch') },
    { separator: true },
    {
      label: '提交',
      children: [
        { label: '提交' },
        { label: '提交已暂存文件' },
        { label: '全部提交', shortcut: 'Ctrl+Alt+K' },
        { label: '撤消上次提交' },
        { label: '中止变基', disabled: true },
        { separator: true },
        { label: '提交(修改)' },
        { label: '提交已暂存文件(修改)' },
        { label: '全部提交(修改)' },
        { separator: true },
        { label: '提交(已署名)' },
        { label: '提交已暂存文件(已署名)' },
        { label: '全部提交(已署名)' },
      ],
    },
    {
      label: '更改',
      children: [
        { label: '暂存所有更改' },
        { label: '取消暂存所有更改' },
        { label: '放弃所有更改' },
      ],
    },
    {
      label: '拉取，推送',
      children: [
        { label: '同步', shortcut: 'Ctrl+T', onSelect: () => onSync('sync') },
        { separator: true },
        { label: '拉取', onSelect: () => onSync('pull') },
        { label: '拉取(变基)' },
        { label: '拉取自...' },
        { separator: true },
        { label: '推送', onSelect: () => onSync('push') },
        { label: '推送到...', shortcut: 'Ctrl+Shift+K' },
        { separator: true },
        { label: '抓取', onSelect: () => onSync('fetch') },
        { label: '抓取(剪除)' },
        { label: '从所有远程存储库中抓取', onSelect: () => onSync('fetch') },
      ],
    },
    {
      label: '分支',
      children: [
        { label: '合并...' },
        { label: '变基分支...' },
        { separator: true },
        { label: '创建分支...' },
        { label: '从现有来源创建新的分支...' },
        { separator: true },
        { label: '重命名分支...' },
        { label: '删除分支...' },
        { label: '删除远程分支...' },
        { separator: true },
        { label: '发布分支...' },
      ],
    },
    {
      label: '远程',
      children: [
        { label: '添加远程存储库...' },
        { label: '删除远程存储库' },
      ],
    },
    {
      label: '存储',
      children: [
        { label: '储藏' },
        { label: '储藏(包含未跟踪)' },
        { label: '储藏暂存' },
        { separator: true },
        { label: '应用最新储藏' },
        { label: '应用储藏...' },
        { separator: true },
        { label: '弹出最新储藏' },
        { label: '弹出储藏...' },
        { separator: true },
        { label: '删除储藏...' },
        { label: '删除所有储藏...' },
        { separator: true },
        { label: '查看储藏条目...' },
      ],
    },
    {
      label: '标记',
      children: [
        { label: '创建标记...' },
        { label: '删除标签...' },
        { label: '删除远程标记...' },
        { separator: true },
        { label: '推送标记' },
      ],
    },
    {
      label: '工作树',
      children: [{ label: '创建工作树...' }],
    },
    { separator: true },
    { label: '显示 GIT 输出' },
    { separator: true },
    { label: '关闭存储库', onSelect: onCloseRepo },
  ];
}
