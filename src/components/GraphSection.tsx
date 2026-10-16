import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { fileIconClass } from '../seti-icons';
import { useStore } from '../store';
import type { RepoState } from '../store';
import type { CommitFile, CommitInfo } from '../types';
import {
  absolutePath,
  computeGraph,
  copyText,
  formatAbsoluteTime,
  formatRelativeTime,
  GRAPH_LANE_WIDTH,
  GRAPH_ROW_HEIGHT,
  isRemoteRef,
  laneColor,
  prettyRef,
  splitPath,
  statusColorClass,
  type GraphRow,
} from '../util';
import { RepoPicker, RefPicker } from './GraphPickers';
import { Menu } from './Menu';
import { SectionHeader } from './Section';

export function GraphSection() {
  const repos = useStore((s) => s.repos);
  const activeRoot = useStore((s) => s.activeRoot);
  const graphRepo = useStore((s) => s.graphRepo);
  const graphRefs = useStore((s) => s.graphRefs);
  const graphView = useStore((s) => s.graphView);
  const setGraphView = useStore((s) => s.setGraphView);
  const collapsed = useStore((s) => !!s.collapsed['section:graph']);
  const loadHistory = useStore((s) => s.loadHistory);
  const sync = useStore((s) => s.sync);

  // 图表显示的仓库：auto 跟随当前活动仓库，否则为显式选择的仓库
  const displayRoot = graphRepo === 'auto' ? activeRoot : graphRepo;
  const repo = repos.find((r) => r.info.root === displayRoot) ?? null;

  const [picker, setPicker] = useState<'repo' | 'refs' | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // 列表容器的动态高度上限：按视口剩余空间自动撑起（对照 VS Code 图表视图占满可用高度）
  const [scrollMax, setScrollMax] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) {
      return;
    }
    const update = (): void => {
      const rect = el.getBoundingClientRect();
      // 底部预留：侧栏底栏（32px）+ 少量留白
      setScrollMax(Math.max(160, Math.round(window.innerHeight - rect.top - 40)));
    };
    update();
    window.addEventListener('resize', update);
    // 上方区块（存储库/更改）高度变化会推动列表位置，一并监听
    const ro = new ResizeObserver(update);
    const scrollParent = el.closest('.sidebar-scroll');
    if (scrollParent) {
      for (const child of Array.from(scrollParent.children)) {
        ro.observe(child);
      }
    }
    return () => {
      window.removeEventListener('resize', update);
      ro.disconnect();
    };
  }, [collapsed]);

  // 显示仓库切换后，若该仓库尚未加载历史则补载一次（仅在未加载时触发，避免死循环）
  useEffect(() => {
    if (!displayRoot) {
      return;
    }
    const target = useStore.getState().repos.find((r) => r.info.root === displayRoot);
    if (target && !target.historyLoaded) {
      void loadHistory(displayRoot);
    }
  }, [displayRoot, loadHistory]);

  // 引用选择按钮的文案：自动 / 全部 / 单个引用名 / N 个引用
  const refsLabel =
    graphRefs === 'auto'
      ? '自动'
      : graphRefs === 'all'
        ? '全部'
        : graphRefs.length === 1
          ? graphRefs[0]
          : `${graphRefs.length} 个引用`;

  // 转到当前历史记录项：滚动到 HEAD 对应的提交行
  const goToCurrent = (): void => {
    const container = contentRef.current;
    if (!container) {
      return;
    }
    const head = repo?.status?.head ?? null;
    const row = head ? container.querySelector<HTMLElement>(`[data-hash="${head}"]`) : null;
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      // 找不到当前提交：图表列表滚回顶部（内部滚动容器）
      container.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // 从所有远程存储库中抓取：对所有打开仓库依次 fetch
  const fetchAllRepos = async (): Promise<void> => {
    for (const r of useStore.getState().repos) {
      await sync(r.info.root, 'fetch');
    }
  };

  return (
    <section className="section">
      <SectionHeader
        id="section:graph"
        title="图表"
        actions={
          <>
            <button
              className="graph-select-btn"
              title="选择要查看的存储库"
              onClick={() => setPicker('repo')}
            >
              <i className="codicon codicon-repo" />
              <span>{repo ? repo.info.name : '自动'}</span>
              <i className="codicon codicon-chevron-down" />
            </button>
            <button
              className="graph-select-btn"
              title="选择要查看的一个/多个历史记录项引用"
              onClick={() => setPicker('refs')}
            >
              <i className="codicon codicon-git-branch" />
              <span>{refsLabel}</span>
              <i className="codicon codicon-chevron-down" />
            </button>
            <button
              className="icon-btn small"
              title="转到当前历史记录项"
              onClick={goToCurrent}
            >
              <i className="codicon codicon-target" />
            </button>
            <button
              className="icon-btn small"
              title="从所有远程存储库中抓取"
              onClick={() => void fetchAllRepos()}
            >
              <i className="codicon codicon-repo-fetch" />
            </button>
            <button
              className="icon-btn small"
              title="拉取"
              disabled={!displayRoot}
              onClick={() => {
                if (displayRoot) {
                  void sync(displayRoot, 'pull');
                }
              }}
            >
              <i className="codicon codicon-repo-pull" />
            </button>
            <button
              className="icon-btn small"
              title="推送"
              disabled={!displayRoot}
              onClick={() => {
                if (displayRoot) {
                  void sync(displayRoot, 'push');
                }
              }}
            >
              <i className="codicon codicon-repo-push" />
            </button>
            <button
              className="icon-btn small"
              title="刷新"
              disabled={!displayRoot}
              onClick={() => {
                if (displayRoot) {
                  void loadHistory(displayRoot);
                }
              }}
            >
              <i className="codicon codicon-refresh" />
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
      {/* 网络操作（fetch/pull/push）进行中的进度条（对照 VS Code 视图标题栏） */}
      <GraphProgress />
      {!collapsed && (
        <div
          ref={contentRef}
          className="graph-scroll"
          style={scrollMax === null ? undefined : { maxHeight: scrollMax }}
        >
          {repo && repo.commits.length > 0 ? (
            <GraphList repo={repo} commits={repo.commits} />
          ) : (
            <div className="hint-row">没有提交历史</div>
          )}
        </div>
      )}
      {picker === 'repo' && <RepoPicker onClose={() => setPicker(null)} />}
      {picker === 'refs' && (
        <RefPicker branches={repo?.branches ?? []} onClose={() => setPicker(null)} />
      )}
      {menuPos && (
        <Menu
          entries={[
            {
              label: '以列表形式查看',
              checked: graphView === 'list',
              onSelect: () => setGraphView('list'),
            },
            {
              label: '以树形式查看',
              checked: graphView === 'tree',
              onSelect: () => setGraphView('tree'),
            },
          ]}
          x={menuPos.x}
          y={menuPos.y}
          onClose={() => setMenuPos(null)}
        />
      )}
    </section>
  );
}

/** 网络操作（fetch/pull/push）进行中的进度条（对照 VS Code 视图标题栏的蓝色滑动横条）。
    多仓库依次操作时 store 的计数会短暂归零，因此隐藏带 250ms 延迟避免闪烁。 */
function GraphProgress(): ReactElement | null {
  const syncing = useStore((s) => s.syncing > 0);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (syncing) {
      setShow(true);
      return;
    }
    const t = window.setTimeout(() => setShow(false), 250);
    return () => window.clearTimeout(t);
  }, [syncing]);

  if (!show) {
    return null;
  }
  return (
    <div className="view-progress">
      <div className="view-progress-bit" />
    </div>
  );
}

/** 提交文件树的节点（文件夹有 children，文件有 file） */
interface CommitTreeNode {
  name: string;
  /** 完整仓库相对路径（文件夹为目录前缀） */
  path: string;
  /** 文件夹的子节点（文件节点无 children） */
  children?: CommitTreeNode[];
  /** 文件节点对应的变更 */
  file?: CommitFile;
}

/** 把变更文件列表构造成文件树（文件夹在前、同级按名称排序） */
function buildCommitTree(files: CommitFile[]): CommitTreeNode[] {
  const root: CommitTreeNode = { name: '', path: '', children: [] };
  for (const f of files) {
    const parts = f.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const isFile = i === parts.length - 1;
      const segment = parts[i];
      const path = parts.slice(0, i + 1).join('/');
      let child = node.children!.find((x) => x.name === segment);
      if (!child) {
        child = { name: segment, path, children: isFile ? undefined : [] };
        if (isFile) {
          child.file = f;
        }
        node.children!.push(child);
      }
      node = child;
    }
  }
  const sortNode = (n: CommitTreeNode): void => {
    if (!n.children) {
      return;
    }
    n.children.sort((a, b) => {
      const aDir = !!a.children;
      const bDir = !!b.children;
      if (aDir !== bDir) {
        return aDir ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    for (const c of n.children) {
      sortNode(c);
    }
  };
  sortNode(root);
  return root.children!;
}

/**
 * 提交文件树（"以树形式查看"）：文件夹可折叠、文件行只显示文件名（路径由层级表达，
 * 对照 VS Code tree 模式下变更列表的 hidePath 行为）。
 */
function CommitFileTree({
  files,
  onSelect,
  onContextMenu,
}: {
  files: CommitFile[];
  onSelect: (f: CommitFile) => void;
  onContextMenu: (path: string, x: number, y: number) => void;
}): ReactElement {
  const nodes = useMemo(() => buildCommitTree(files), [files]);
  // 折叠的文件夹路径集合（点击文件夹行切换）
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (path: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const renderNodes = (list: CommitTreeNode[], depth: number): ReactElement[] =>
    list.flatMap((node) => {
      const indent = { paddingLeft: depth * 14 + 6 };
      if (node.children) {
        const isCollapsed = collapsed.has(node.path);
        return [
          <div
            key={node.path}
            className="graph-dir-row"
            style={indent}
            title={node.path}
            onClick={(e) => {
              e.stopPropagation();
              toggle(node.path);
            }}
          >
            <i className={`codicon codicon-chevron-${isCollapsed ? 'right' : 'down'}`} />
            <i className={`codicon codicon-folder${isCollapsed ? '' : '-opened'}`} />
            <span className="graph-dir-name">{node.name}</span>
          </div>,
          ...(isCollapsed ? [] : renderNodes(node.children, depth + 1)),
        ];
      }
      const f = node.file!;
      return [
        <div
          key={node.path}
          className="graph-file-row"
          style={indent}
          title={node.path}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(f);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onContextMenu(f.path, e.clientX, e.clientY);
          }}
        >
          {fileIconClass(f.path) ? (
            <i className={`file-type-icon ${fileIconClass(f.path)}`} />
          ) : (
            <i className="codicon codicon-file" />
          )}
          <span className="graph-file-name">{node.name}</span>
          <span className={`change-status ${statusColorClass(f.status)}`}>{f.status}</span>
        </div>,
      ];
    });

  return <>{renderNodes(nodes, 0)}</>;
}

function GraphList({
  repo,
  commits,
}: {
  repo: RepoState;
  commits: CommitInfo[];
}) {
  const layout = useMemo(() => computeGraph(commits), [commits]);
  // 提交展开后的文件行右键菜单（坐标 + 目标文件路径）
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; path: string } | null>(null);
  // 提交行悬浮卡片：延迟 400ms 后显示（坐标已按窗口边界修正）
  const [hover, setHover] = useState<{ hash: string; x: number; y: number } | null>(null);
  const hoverTimer = useRef<number | null>(null);
  // 离开行后的隐藏延迟：允许鼠标跨过行与卡片的间隙移入卡片（例如点击复制哈希）
  const hideTimer = useRef<number | null>(null);
  const treeView = useStore((s) => s.graphView === 'tree');
  const expandedCommit = useStore((s) => s.expandedCommit);
  const commitFiles = useStore((s) => s.commitFiles);
  const commitStats = useStore((s) => s.commitStats);
  const toggleCommitExpand = useStore((s) => s.toggleCommitExpand);
  const selectCommitFile = useStore((s) => s.selectCommitFile);

  // 组件卸载时清理未触发的悬浮/隐藏定时器
  useEffect(
    () => () => {
      if (hoverTimer.current !== null) {
        window.clearTimeout(hoverTimer.current);
      }
      if (hideTimer.current !== null) {
        window.clearTimeout(hideTimer.current);
      }
    },
    [],
  );

  return (
    <div className="graph-list">
      {commits.map((c, i) => {
        const row = layout.rows[i];
        // 行宽按该行自身车道数计算：描述自动贴近车道线（对照 VS Code）
        const rowWidth =
          Math.max(row.top.length, row.bottom.length, row.lane + 1) * GRAPH_LANE_WIDTH + 6;
        // 该行节点中心 x（展开文件列表的竖线对齐此处，对照 VS Code）
        const nodeX = row.lane * GRAPH_LANE_WIDTH + GRAPH_LANE_WIDTH / 2;
        // 展开的提交行高亮（点击行 = 展开/收起文件列表）
        const selected = expandedCommit === c.hash;

        return (
          <Fragment key={c.hash}>
            <div
              className={`graph-row${selected ? ' selected' : ''}`}
              data-hash={c.hash}
              onClick={() => {
                // 仅展开/收起提交内的文件列表（右侧 diff 只在点击文件时显示）
                void toggleCommitExpand(repo.info.root, c.hash);
              }}
              onMouseEnter={(e) => {
                // 重新进入行时先取消上一次未触发的定时器
                if (hoverTimer.current !== null) {
                  window.clearTimeout(hoverTimer.current);
                }
                if (hideTimer.current !== null) {
                  window.clearTimeout(hideTimer.current);
                  hideTimer.current = null;
                }
                const rect = e.currentTarget.getBoundingClientRect();
                const hash = c.hash;
                hoverTimer.current = window.setTimeout(() => {
                  // 边界保护：右侧放不下则贴近窗口右缘，底部放不下则上移
                  const x =
                    rect.right + 8 + 380 > window.innerWidth
                      ? window.innerWidth - 388
                      : rect.right + 8;
                  const y = Math.min(rect.top, window.innerHeight - 240);
                  setHover({ hash, x, y });
                  void useStore.getState().loadCommitStats(repo.info.root, hash);
                }, 400);
              }}
              onMouseLeave={() => {
                if (hoverTimer.current !== null) {
                  window.clearTimeout(hoverTimer.current);
                  hoverTimer.current = null;
                }
                // 延迟隐藏：给鼠标留出移入卡片的时间（卡片 onMouseEnter 会取消）
                if (hideTimer.current !== null) {
                  window.clearTimeout(hideTimer.current);
                }
                hideTimer.current = window.setTimeout(() => {
                  hideTimer.current = null;
                  setHover(null);
                }, 150);
              }}
            >
              <GraphSvg row={row} width={rowWidth} />
              <div className="graph-main">
                <span className="graph-subject">{c.subject}</span>
                {c.refs.map((r) => {
                  const label = prettyRef(r);
                  return (
                    <span
                      key={r}
                      className={`ref-badge${isRemoteRef(label) ? ' remote' : ''}`}
                    >
                      {label}
                    </span>
                  );
                })}
                {/* 行尾：作者（单行布局，margin-left: auto 推到最右侧） */}
                <span className="graph-commit-meta">
                  <span className="graph-author">{c.author}</span>
                </span>
              </div>
            </div>
            {expandedCommit === c.hash && (
              <div
                className="graph-files"
                style={{
                  marginLeft: nodeX - 1,
                  borderLeft: `2px solid ${laneColor(row.lane)}`,
                  paddingLeft: 10,
                }}
              >
                {treeView ? (
                  // 树视图：变更文件按文件夹层级展示（对照 VS Code "以树形式查看"）
                  <CommitFileTree
                    files={commitFiles[c.hash] ?? []}
                    onSelect={(f) => void selectCommitFile(repo.info.root, c.hash, c.subject, f)}
                    onContextMenu={(path, x, y) => setCtxMenu({ x, y, path })}
                  />
                ) : (
                  (commitFiles[c.hash] ?? []).map((f) => {
                    const { dir, name } = splitPath(f.path);
                    return (
                      <div
                        key={f.path}
                        className="graph-file-row"
                        title={f.path}
                        onClick={(e) => {
                          e.stopPropagation();
                          void selectCommitFile(repo.info.root, c.hash, c.subject, f);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setCtxMenu({ x: e.clientX, y: e.clientY, path: f.path });
                        }}
                      >
                        {fileIconClass(f.path) ? (
                          <i className={`file-type-icon ${fileIconClass(f.path)}`} />
                        ) : (
                          <i className="codicon codicon-file" />
                        )}
                        <span className="graph-file-name">{name}</span>
                        {/* 仓库名 • 路径（灰色小字，无路径时只显示仓库名） */}
                        <span className="graph-file-desc">
                          {repo.info.name}
                          {dir ? ` • ${dir.replace(/\/$/, '')}` : ''}
                        </span>
                        <span className={`change-status ${statusColorClass(f.status)}`}>
                          {f.status}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </Fragment>
        );
      })}
      {ctxMenu && (
        <Menu
          entries={[
            { label: '复制相对路径', onSelect: () => void copyText(ctxMenu.path) },
            {
              label: '复制绝对路径',
              onSelect: () => void copyText(absolutePath(repo.info.root, ctxMenu.path)),
            },
          ]}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
        />
      )}
      {/* 提交悬浮卡片：portal 到 body，避免被列表滚动容器裁剪 */}
      {hover &&
        (() => {
          const c = commits.find((x) => x.hash === hover.hash);
          if (!c) {
            return null;
          }
          const stats = commitStats[c.hash] ?? null;
          return createPortal(
            <div
              className="commit-hover"
              style={{ left: hover.x, top: hover.y }}
              onMouseEnter={() => {
                // 鼠标进入卡片：取消行触发的延迟隐藏
                if (hideTimer.current !== null) {
                  window.clearTimeout(hideTimer.current);
                  hideTimer.current = null;
                }
              }}
              onMouseLeave={() => {
                if (hideTimer.current !== null) {
                  window.clearTimeout(hideTimer.current);
                  hideTimer.current = null;
                }
                setHover(null);
              }}
            >
              <div className="commit-hover-head">
                <span className="commit-hover-author">{c.author}</span>
                {`, ${formatRelativeTime(c.timestamp)}（${formatAbsoluteTime(c.timestamp)}）`}
              </div>
              <div className="commit-hover-subject">{c.subject}</div>
              <div className="commit-hover-stats">
                {stats
                  ? `已更改 ${stats.files} 个文件，${stats.insertions} 行插入(+)，${stats.deletions} 行删除(-)`
                  : '统计加载中…'}
              </div>
              {c.refs.length > 0 && (
                <div className="commit-hover-refs">
                  {c.refs.map((r) => {
                    const label = prettyRef(r);
                    return (
                      <span key={r} className={`ref-badge${isRemoteRef(label) ? ' remote' : ''}`}>
                        {label}
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="commit-hover-hash">
                <i className="codicon codicon-git-commit" />
                <span>{c.shortHash}</span>
                <button
                  className="commit-hover-copy"
                  title="复制提交哈希"
                  onClick={() => void copyText(c.shortHash)}
                >
                  <i className="codicon codicon-copy" />
                </button>
              </div>
            </div>,
            document.body,
          );
        })()}
    </div>
  );
}

/** 单行的 commit graph 绘制（lane 竖线 + 节点 + merge 曲线） */
function GraphSvg({ row, width }: { row: GraphRow; width: number }) {
  const H = GRAPH_ROW_HEIGHT;
  const LW = GRAPH_LANE_WIDTH;
  const x = (lane: number): number => lane * LW + LW / 2;
  const els: ReactElement[] = [];

  // 跨越该行的竖线 / 通往节点的上半段 / 汇合线
  row.top.forEach((hash, i) => {
    if (hash === null) {
      return;
    }
    if (i === row.lane) {
      els.push(
        <line
          key={`t${i}`}
          x1={x(i)}
          y1={0}
          x2={x(i)}
          y2={H / 2}
          stroke={laneColor(i)}
          strokeWidth={1.2}
        />,
      );
    } else if (row.mergesIn.includes(i)) {
      // 兄弟 lane 汇入本节点（对照 git log --graph 的收敛线）
      const d = `M ${x(i)} 0 C ${x(i)} ${H / 4}, ${x(row.lane)} ${H / 4}, ${x(row.lane)} ${H / 2}`;
      els.push(
        <path key={`m${i}`} d={d} fill="none" stroke={laneColor(i)} strokeWidth={1.2} />,
      );
    } else if (row.bottom[i] === hash) {
      els.push(
        <line
          key={`v${i}`}
          x1={x(i)}
          y1={0}
          x2={x(i)}
          y2={H}
          stroke={laneColor(i)}
          strokeWidth={1.2}
        />,
      );
    }
  });

  // 节点下半段：first parent 直下，其余 parent 用曲线分叉到各自 lane
  row.bottom.forEach((hash, i) => {
    if (hash === null) {
      return;
    }
    if (i === row.lane) {
      els.push(
        <line
          key={`b${i}`}
          x1={x(i)}
          y1={H / 2}
          x2={x(i)}
          y2={H}
          stroke={laneColor(i)}
          strokeWidth={1.2}
        />,
      );
    } else if (row.top[i] !== hash && row.parents.includes(hash)) {
      const d = `M ${x(row.lane)} ${H / 2} C ${x(row.lane)} ${H / 2 + 12}, ${x(i)} ${H - 12}, ${x(i)} ${H}`;
      els.push(
        <path
          key={`c${i}`}
          d={d}
          fill="none"
          stroke={laneColor(i)}
          strokeWidth={1.2}
        />,
      );
    }
  });

  // 节点圆：merge 提交（多父）为空心圆环，普通提交为实心小圆（对照 VS Code 图表）
  els.push(
    row.parents.length > 1 ? (
      <circle
        key="node"
        cx={x(row.lane)}
        cy={H / 2}
        r={3.2}
        style={{ fill: 'var(--bg-sidebar)' }}
        stroke={laneColor(row.lane)}
        strokeWidth={1.6}
      />
    ) : (
      <circle key="node" cx={x(row.lane)} cy={H / 2} r={2.8} fill={laneColor(row.lane)} />
    ),
  );

  return (
    <svg className="graph-svg" width={width} height={H} style={{ minWidth: width }}>
      {els}
    </svg>
  );
}
