import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactElement } from 'react';
import { useStore } from '../store';
import type { BranchInfo } from '../types';

/** 互斥项（全部 / 自动）在勾选集合中的哨兵 key（不会与真实引用名冲突） */
const ALL_KEY = '__all__';
const AUTO_KEY = '__auto__';

/** “自动”行的说明文字（筛选时连同标题一起匹配） */
const REPO_AUTO_DESC = '显示活动存储库的源代码管理图';
const REFS_ALL_DESC = '所有历史记录项引用';
const REFS_AUTO_DESC = '当前历史记录项引用';

/** 勾选标记：已选显示对勾，未选用同宽空占位保证各行首对齐（与 BranchPicker 的勾选习惯一致） */
function CheckMark({ checked }: { checked: boolean }): ReactElement {
  return checked ? (
    <i className="codicon codicon-check picker-check" />
  ) : (
    <span className="picker-check" />
  );
}

/**
 * 存储库选择弹窗（对照 VS Code SCM Graph 标题栏“选择要查看的存储库”QuickPick）：
 * 输入框筛选 → “自动”（跟随活动存储库）→ 各已打开仓库，点击立即应用并关闭。
 */
export function RepoPicker({ onClose }: { onClose: () => void }): ReactElement {
  const repos = useStore((s) => s.repos);
  const graphRepo = useStore((s) => s.graphRepo);
  const setGraphRepo = useStore((s) => s.setGraphRepo);
  const [filter, setFilter] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const f = filter.trim().toLowerCase();
  // 按仓库名 / 路径筛选；“自动”项连同说明文字一起匹配
  const showAuto = !f || `自动 ${REPO_AUTO_DESC}`.toLowerCase().includes(f);
  const shownRepos = repos.filter(
    (r) => !f || r.info.name.toLowerCase().includes(f) || r.info.root.toLowerCase().includes(f),
  );

  /** 应用选择：'auto' 跟随活动存储库，否则为指定仓库根路径 */
  const pick = (scope: string): void => {
    setGraphRepo(scope);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return createPortal(
    <div className="picker-overlay" onMouseDown={onClose}>
      <div className="picker" onMouseDown={(e) => e.stopPropagation()}>
        <div className="picker-input-row">
          <i className="codicon codicon-search" />
          <input
            ref={inputRef}
            className="picker-input"
            placeholder="选择要查看的存储库，键入以筛选所有存储库"
            value={filter}
            spellCheck={false}
            autoFocus
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="picker-list">
          {showAuto && (
            <div className="picker-item" onClick={() => pick('auto')}>
              <div className="picker-item-line1">
                <CheckMark checked={graphRepo === 'auto'} />
                <span className="picker-item-name">自动</span>
              </div>
              <div className="picker-item-line2">
                <span className="picker-desc">{REPO_AUTO_DESC}</span>
              </div>
            </div>
          )}

          {shownRepos.map((r) => (
            <div className="picker-item" key={r.info.root} onClick={() => pick(r.info.root)}>
              <div className="picker-item-line1">
                <CheckMark checked={graphRepo === r.info.root} />
                <i className="codicon codicon-repo" />
                <span className="picker-item-name">{r.info.name}</span>
              </div>
              <div className="picker-item-line2">
                <span className="picker-desc">{r.info.root}</span>
              </div>
            </div>
          ))}

          {!showAuto && shownRepos.length === 0 && (
            <div className="picker-empty">没有匹配的存储库</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * 引用选择弹窗（对照 VS Code SCM Graph“选择要查看的一个/多个历史记录项引用”QuickPick）：
 * 多选列表——全部 / 自动（互斥）→ 本地分支 / 远程分支；头部右侧显示已选数量与“确定”，
 * “确定”把勾选集映射为 store 的 graphRefs 后关闭。
 */
export function RefPicker({
  branches,
  onClose,
}: {
  branches: BranchInfo[];
  onClose: () => void;
}): ReactElement {
  const graphRefs = useStore((s) => s.graphRefs);
  const setGraphRefs = useStore((s) => s.setGraphRefs);
  const [filter, setFilter] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 初始勾选：从 store 的 graphRefs 反推（'all' / 'auto' / 指定引用名集合）
  const [selected, setSelected] = useState<Set<string>>(() => {
    if (graphRefs === 'all') {
      return new Set([ALL_KEY]);
    }
    if (graphRefs === 'auto') {
      return new Set([AUTO_KEY]);
    }
    return new Set(graphRefs);
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /** 互斥项（全部 / 自动）：再次点击取消勾选，勾选时清空其他所有选择 */
  const toggleExclusive = (key: string): void => {
    setSelected((prev) => (prev.has(key) ? new Set() : new Set([key])));
  };

  /** 切换某个引用名的勾选；勾选引用会取消互斥项（全部 / 自动） */
  const toggleRef = (name: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(ALL_KEY);
      next.delete(AUTO_KEY);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  /** 应用：全部 / 自动映射为对应模式，否则传勾选的引用名列表（无选择时“确定”已禁用） */
  const apply = (): void => {
    if (selected.size === 0) {
      return;
    }
    if (selected.has(ALL_KEY)) {
      setGraphRefs('all');
    } else if (selected.has(AUTO_KEY)) {
      setGraphRefs('auto');
    } else {
      setGraphRefs([...selected]);
    }
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      apply();
    }
  };

  const f = filter.trim().toLowerCase();
  const match = (text: string): boolean => !f || text.toLowerCase().includes(f);
  const showAll = match(`全部 ${REFS_ALL_DESC}`);
  const showAuto = match(`自动 ${REFS_AUTO_DESC}`);
  const local = branches.filter((b) => !b.isRemote && match(b.name));
  const remote = branches.filter((b) => b.isRemote && match(b.name));
  const empty = !showAll && !showAuto && local.length === 0 && remote.length === 0;

  return createPortal(
    <div className="picker-overlay" onMouseDown={onClose}>
      <div className="picker" onMouseDown={(e) => e.stopPropagation()}>
        <div className="picker-input-row">
          <i className="codicon codicon-search" />
          <input
            ref={inputRef}
            className="picker-input"
            placeholder="选择要查看的一个/多个历史记录项引用，键入以进行筛选"
            value={filter}
            spellCheck={false}
            autoFocus
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <span className="picker-badge">已选 {selected.size} 项</span>
          <button className="picker-ok" disabled={selected.size === 0} onClick={apply}>
            确定
          </button>
        </div>
        <div className="picker-list">
          {showAll && (
            <div className="picker-item" onClick={() => toggleExclusive(ALL_KEY)}>
              <div className="picker-item-line1">
                <CheckMark checked={selected.has(ALL_KEY)} />
                <span className="picker-item-name">全部</span>
              </div>
              <div className="picker-item-line2">
                <span className="picker-desc">{REFS_ALL_DESC}</span>
              </div>
            </div>
          )}

          {showAuto && (
            <div className="picker-item" onClick={() => toggleExclusive(AUTO_KEY)}>
              <div className="picker-item-line1">
                <CheckMark checked={selected.has(AUTO_KEY)} />
                <span className="picker-item-name">自动</span>
              </div>
              <div className="picker-item-line2">
                <span className="picker-desc">{REFS_AUTO_DESC}</span>
              </div>
            </div>
          )}

          {local.map((b) => (
            <RefRow key={b.name} branch={b} checked={selected.has(b.name)} onToggle={toggleRef} />
          ))}
          {remote.map((b) => (
            <RefRow key={b.name} branch={b} checked={selected.has(b.name)} onToggle={toggleRef} />
          ))}

          {empty && <div className="picker-empty">没有匹配的引用</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** 引用行：勾选标记 + 分支图标（远程用云图标）+ 名称 + 行尾灰字标签（分支 / 远程分支） */
function RefRow({
  branch,
  checked,
  onToggle,
}: {
  branch: BranchInfo;
  checked: boolean;
  onToggle: (name: string) => void;
}): ReactElement {
  return (
    <div className="picker-item" onClick={() => onToggle(branch.name)}>
      <div className="picker-item-line1">
        <CheckMark checked={checked} />
        <i className={`codicon ${branch.isRemote ? 'codicon-cloud' : 'codicon-git-branch'}`} />
        <span className="picker-item-name">{branch.name}</span>
        <span className="picker-label">{branch.isRemote ? '远程分支' : '分支'}</span>
      </div>
    </div>
  );
}
