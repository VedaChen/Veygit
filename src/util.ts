import type { CommitInfo, FileChange } from './types';

export function formatRelativeTime(unixSeconds: number): string {
  if (!unixSeconds) {
    return '';
  }
  const diff = Math.max(0, Date.now() / 1000 - unixSeconds);
  if (diff < 60) {
    return '刚刚';
  }
  if (diff < 3600) {
    return `${Math.floor(diff / 60)} 分钟前`;
  }
  if (diff < 86400) {
    return `${Math.floor(diff / 3600)} 小时前`;
  }
  if (diff < 86400 * 30) {
    return `${Math.floor(diff / 86400)} 天前`;
  }
  const date = new Date(unixSeconds * 1000);
  return date.toISOString().slice(0, 10);
}

export function splitPath(path: string): { dir: string; name: string } {
  const idx = path.lastIndexOf('/');
  if (idx < 0) {
    return { dir: '', name: path };
  }
  return { dir: path.slice(0, idx + 1), name: path.slice(idx + 1) };
}

/** 按路径 / 名称 / 状态对更改排序（返回新数组，对照 VS Code SCM 排序选项） */
export function sortChanges(
  changes: FileChange[],
  mode: 'path' | 'name' | 'status',
): FileChange[] {
  const byPath = (a: FileChange, b: FileChange): number => a.path.localeCompare(b.path);
  const sorted = [...changes];
  if (mode === 'name') {
    sorted.sort((a, b) => splitPath(a.path).name.localeCompare(splitPath(b.path).name) || byPath(a, b));
  } else if (mode === 'status') {
    sorted.sort((a, b) => a.status.localeCompare(b.status) || byPath(a, b));
  } else {
    sorted.sort(byPath);
  }
  return sorted;
}

export function statusColorClass(status: string): string {
  switch (status) {
    case 'M':
      return 'status-modified';
    case 'A':
      return 'status-added';
    case 'D':
      return 'status-deleted';
    case 'R':
    case 'C':
      return 'status-renamed';
    case 'U':
      return 'status-conflict';
    case '?':
      return 'status-untracked';
    default:
      return 'status-modified';
  }
}

/* ---------- 变更文件树 ---------- */

export interface TreeEntry {
  /** 显示名（单段） */
  name: string;
  /** 相对仓库根的完整路径 */
  path: string;
  isDir: boolean;
  children: TreeEntry[];
  change?: FileChange;
}

/** 把文件变更列表构建成目录树（对照 VS Code SCM 的 tree 视图） */
export function buildTree(changes: FileChange[]): TreeEntry[] {
  const roots: TreeEntry[] = [];

  for (const change of changes) {
    const parts = change.path.split('/');
    let level = roots;
    let prefix = '';
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      prefix = prefix ? `${prefix}/${name}` : name;
      const isFile = i === parts.length - 1;

      if (isFile) {
        level.push({
          name,
          path: change.path,
          isDir: false,
          children: [],
          change,
        });
      } else {
        let dir = level.find((e) => e.isDir && e.name === name);
        if (!dir) {
          dir = { name, path: prefix, isDir: true, children: [] };
          level.push(dir);
        }
        level = dir.children;
      }
    }
  }

  sortTree(roots);
  return roots;
}

function sortTree(entries: TreeEntry[]): void {
  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) {
      return a.isDir ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  for (const e of entries) {
    sortTree(e.children);
  }
}

/** 紧凑目录合并：只有单个子目录时合并展示为 “a / b / c” */
export function compactDir(entry: TreeEntry): { label: string; target: TreeEntry } {
  const chain = [entry.name];
  let cur = entry;
  while (cur.children.length === 1 && cur.children[0].isDir) {
    cur = cur.children[0];
    chain.push(cur.name);
  }
  return { label: chain.join(' / '), target: cur };
}

/** 收集某目录（含子目录）里的全部文件变更 */
export function collectChanges(entry: TreeEntry): FileChange[] {
  if (!entry.isDir) {
    return entry.change ? [entry.change] : [];
  }
  return entry.children.flatMap(collectChanges);
}

/* ---------- commit graph ---------- */

export const GRAPH_PALETTE = [
  '#e2c08d', // 黄
  '#539bf5', // 蓝
  '#7ee787', // 绿
  '#d2a8ff', // 紫
  '#ff7b72', // 红
  '#39c5cf', // 青
];

export const GRAPH_LANE_WIDTH = 14;
export const GRAPH_ROW_HEIGHT = 40;

export interface GraphRow {
  hash: string;
  lane: number;
  /** 进入该行时各 lane 期待的 hash（null = 空闲） */
  top: (string | null)[];
  /** 该行处理后各 lane 期待的 hash */
  bottom: (string | null)[];
  parents: string[];
  /** 汇入本节点的其它 lane（多个 lane 期待同一 commit 时收敛，对照 git log --graph） */
  mergesIn: number[];
}

export interface GraphLayout {
  rows: GraphRow[];
  maxLanes: number;
}

/** 计算提交历史的 lane 布局（简化版 git log --graph 算法） */
export function computeGraph(commits: CommitInfo[]): GraphLayout {
  const rows: GraphRow[] = [];
  let maxLanes = 0;
  const lanes: (string | null)[] = [];

  for (const commit of commits) {
    // 1. 收集所有期待该 commit 的 lane（可能有多条，需收敛）
    const waiting: number[] = [];
    lanes.forEach((h, i) => {
      if (h === commit.hash) {
        waiting.push(i);
      }
    });

    let lane: number;
    if (waiting.length === 0) {
      lane = lanes.indexOf(null);
      if (lane === -1) {
        lane = lanes.length;
        lanes.push(null);
      }
      lanes[lane] = commit.hash;
    } else {
      lane = waiting[0];
    }
    const mergesIn = waiting.filter((i) => i !== lane);

    const top = [...lanes];

    // 收敛：其余等待同一 commit 的 lane 清空（渲染时画汇合线）
    for (const mi of mergesIn) {
      lanes[mi] = null;
    }

    // 2. 第一个 parent 接替当前 lane，其余 parent 各占新 lane
    const [first, ...rest] = commit.parents;
    lanes[lane] = first ?? null;
    for (const p of rest) {
      if (lanes.includes(p)) {
        continue;
      }
      let l2 = lanes.indexOf(null);
      if (l2 === -1) {
        l2 = lanes.length;
        lanes.push(null);
      }
      lanes[l2] = p;
    }

    const bottom = [...lanes];
    maxLanes = Math.max(maxLanes, top.length, bottom.length);

    rows.push({ hash: commit.hash, lane, top, bottom, parents: commit.parents, mergesIn });

    // 收敛尾部空闲 lane，避免 lane 数无限增长
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      lanes.pop();
    }
  }

  return { rows, maxLanes };
}

export function laneColor(lane: number): string {
  return GRAPH_PALETTE[lane % GRAPH_PALETTE.length];
}

/** 美化 %D 中的 ref 名称：`HEAD -> main` → `main`，`tag: v1` → `v1` */
export function prettyRef(ref: string): string {
  let r = ref.trim();
  if (r.startsWith('HEAD -> ')) {
    r = r.slice('HEAD -> '.length);
  }
  if (r.startsWith('tag: ')) {
    r = r.slice('tag: '.length);
  }
  return r;
}

export function isRemoteRef(ref: string): boolean {
  return /^(origin|upstream|refs\/remotes)\//.test(ref) || ref.includes('/');
}
