import { Fragment, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useStore } from '../store';
import type { RepoState } from '../store';
import type { CommitInfo } from '../types';
import {
  computeGraph,
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

/** 从仓库根路径取显示名（最后一段） */
function repoNameOf(root: string): string {
  const parts = root.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : root;
}

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

  // 显示仓库切换后，若该仓库尚未加载历史则补载一次（仅在未加载时触发，避免死循环）
  useEffect(() => {
    // tree 模式下由下面的 effect 统一加载所有仓库
    if (graphView === 'tree' || !displayRoot) {
      return;
    }
    const target = useStore.getState().repos.find((r) => r.info.root === displayRoot);
    if (target && !target.historyLoaded) {
      void loadHistory(displayRoot);
    }
  }, [displayRoot, graphView, loadHistory]);

  // tree 模式需要所有打开仓库的提交历史
  useEffect(() => {
    if (graphView !== 'tree') {
      return;
    }
    for (const r of repos) {
      if (!r.historyLoaded) {
        void loadHistory(r.info.root);
      }
    }
  }, [graphView, repos, loadHistory]);

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
      // 找不到当前提交：列表滚回顶部
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        count={repo?.commits.length || undefined}
        actions={
          <>
            <button
              className="graph-select-btn"
              title="选择要查看的存储库"
              onClick={() => setPicker('repo')}
            >
              <i className="codicon codicon-repo" />
              <span>{graphRepo === 'auto' ? '自动' : repoNameOf(graphRepo)}</span>
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
              <i className="codicon codicon-cloud-download" />
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
              <i className="codicon codicon-arrow-down" />
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
              <i className="codicon codicon-arrow-up" />
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
      {!collapsed && (
        <div ref={contentRef}>
          {graphView === 'tree' ? (
            <GraphTree repos={repos} />
          ) : repo && repo.commits.length > 0 ? (
            <GraphList repo={repo} commits={repo.commits} showRepoName />
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

/** tree 模式：所有打开仓库分组展示各自的提交历史 */
function GraphTree({ repos }: { repos: RepoState[] }) {
  const visible = repos.filter((r) => r.commits.length > 0);
  if (visible.length === 0) {
    return <div className="hint-row">没有提交历史</div>;
  }
  return (
    <>
      {visible.map((r) => (
        <div className="graph-repo-group" key={r.info.root}>
          <div className="graph-repo-header">
            <i className="codicon codicon-repo" /> <span>{r.info.name}</span>
          </div>
          <GraphList repo={r} commits={r.commits} />
        </div>
      ))}
    </>
  );
}

function GraphList({
  repo,
  commits,
  showRepoName = false,
}: {
  repo: RepoState;
  commits: CommitInfo[];
  /** list 模式下每行附带仓库名（tree 模式下由分组头承担） */
  showRepoName?: boolean;
}) {
  const layout = useMemo(() => computeGraph(commits), [commits]);
  const selection = useStore((s) => s.selection);
  const selectCommit = useStore((s) => s.selectCommit);
  const expandedCommit = useStore((s) => s.expandedCommit);
  const commitFiles = useStore((s) => s.commitFiles);
  const toggleCommitExpand = useStore((s) => s.toggleCommitExpand);
  const selectCommitFile = useStore((s) => s.selectCommitFile);

  const svgWidth = layout.maxLanes * GRAPH_LANE_WIDTH + 6;

  return (
    <div className="graph-list">
      {commits.map((c, i) => {
        const row = layout.rows[i];
        const selected =
          selection?.kind === 'commit' &&
          selection.repo === repo.info.root &&
          selection.hash === c.hash;

        return (
          <Fragment key={c.hash}>
            <div
              className={`graph-row${selected ? ' selected' : ''}`}
              data-hash={c.hash}
              title={`${c.shortHash} ${c.subject}`}
              onClick={() => {
                // 展开提交内的文件列表，同时右侧继续显示整个提交 patch
                void toggleCommitExpand(repo.info.root, c.hash);
                void selectCommit(repo.info.root, c.hash, c.subject);
              }}
            >
              <GraphSvg row={row} width={svgWidth} />
              <div className="graph-main">
                <div className="graph-line1">
                  <span className="graph-subject">{c.subject}</span>
                  {showRepoName && (
                    <span className="graph-commit-repo">{repo.info.name}</span>
                  )}
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
                </div>
                <div className="graph-line2">
                  <span className="graph-author">{c.author}</span>
                  <span className="graph-time">{formatRelativeTime(c.timestamp)}</span>
                </div>
              </div>
            </div>
            {expandedCommit === c.hash && (
              <div className="graph-files" style={{ paddingLeft: svgWidth + 4 }}>
                {(commitFiles[c.hash] ?? []).map((f) => {
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
                    >
                      <i className="codicon codicon-file" />
                      <span className="graph-file-name">{name}</span>
                      {dir && <span className="graph-file-dir">{dir.replace(/\/$/, '')}</span>}
                      <span className={`change-status ${statusColorClass(f.status)}`}>
                        {f.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Fragment>
        );
      })}
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
          strokeWidth={1.6}
        />,
      );
    } else if (row.mergesIn.includes(i)) {
      // 兄弟 lane 汇入本节点（对照 git log --graph 的收敛线）
      const d = `M ${x(i)} 0 C ${x(i)} ${H / 4}, ${x(row.lane)} ${H / 4}, ${x(row.lane)} ${H / 2}`;
      els.push(
        <path key={`m${i}`} d={d} fill="none" stroke={laneColor(i)} strokeWidth={1.6} />,
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
          strokeWidth={1.6}
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
          strokeWidth={1.6}
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
          strokeWidth={1.6}
        />,
      );
    }
  });

  // 节点圆
  els.push(
    <circle key="node" cx={x(row.lane)} cy={H / 2} r={3.6} fill={laneColor(row.lane)} />,
  );

  return (
    <svg className="graph-svg" width={width} height={H} style={{ minWidth: width }}>
      {els}
    </svg>
  );
}
