import { useMemo, type ReactElement } from 'react';
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
  type GraphRow,
} from '../util';
import { SectionHeader } from './Section';

export function GraphSection() {
  const repo = useStore((s) => s.repos.find((r) => r.info.root === s.activeRoot));
  const collapsed = useStore((s) => !!s.collapsed['section:graph']);
  const loadHistory = useStore((s) => s.loadHistory);

  if (!repo) {
    return null;
  }

  return (
    <section className="section">
      <SectionHeader
        id="section:graph"
        title="图表"
        count={repo.commits.length || undefined}
        actions={
          <button
            className="icon-btn small"
            title="刷新提交历史"
            onClick={() => void loadHistory(repo.info.root)}
          >
            <i className="codicon codicon-refresh" />
          </button>
        }
      />
      {!collapsed &&
        (repo.commits.length === 0 ? (
          <div className="hint-row">没有提交历史</div>
        ) : (
          <GraphList repo={repo} commits={repo.commits} />
        ))}
    </section>
  );
}

function GraphList({ repo, commits }: { repo: RepoState; commits: CommitInfo[] }) {
  const layout = useMemo(() => computeGraph(commits), [commits]);
  const selection = useStore((s) => s.selection);
  const selectCommit = useStore((s) => s.selectCommit);

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
          <div
            key={c.hash}
            className={`graph-row${selected ? ' selected' : ''}`}
            title={`${c.shortHash} ${c.subject}`}
            onClick={() => void selectCommit(repo.info.root, c.hash, c.subject)}
          >
            <GraphSvg row={row} width={svgWidth} />
            <div className="graph-main">
              <div className="graph-line1">
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
              </div>
              <div className="graph-line2">
                <span className="graph-author">{c.author}</span>
                <span className="graph-time">{formatRelativeTime(c.timestamp)}</span>
              </div>
            </div>
          </div>
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
