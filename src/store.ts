import { create } from 'zustand';
import { api } from './api';
import type {
  BranchInfo,
  CommitInfo,
  DiffContent,
  FileChange,
  RepoInfo,
  RepositoryStatus,
} from './types';

/** 单个已打开仓库的状态（对照 VS Code 每个 Repository 实例的模型） */
export interface RepoState {
  info: RepoInfo;
  status: RepositoryStatus | null;
  branches: BranchInfo[];
  commits: CommitInfo[];
  message: string;
  amend: boolean;
  historyLoaded: boolean;
}

export type Selection =
  | { kind: 'change'; repo: string; path: string; staged: boolean; originalPath: string | null }
  | { kind: 'commit'; repo: string; hash: string; subject: string }
  | null;

export interface Notice {
  level: 'info' | 'error' | 'success';
  text: string;
}

/** 分支快速选择器（对照 VS Code "选择要签出的分支或标记" QuickPick） */
export type BranchPickerMode = 'list' | 'createFrom' | 'create' | 'detached';

export interface BranchPickerState {
  repo: string;
  mode: BranchPickerMode;
  /** createFrom 选中的依据分支 */
  base: string | null;
  filter: string;
}

interface AppStore {
  repos: RepoState[];
  activeRoot: string | null;

  selection: Selection | null;
  diff: DiffContent | null;
  patch: string | null;

  busy: boolean;
  notice: Notice | null;
  collapsed: Record<string, boolean>;
  branchPicker: BranchPickerState | null;

  init: () => Promise<void>;
  openRepository: () => Promise<void>;
  closeRepository: (root: string) => Promise<void>;
  setActive: (root: string) => void;
  refresh: (root?: string) => Promise<void>;
  refreshAll: () => Promise<void>;

  setMessage: (root: string, message: string) => void;
  setAmend: (root: string, amend: boolean) => void;

  selectChange: (repo: string, change: FileChange) => Promise<void>;
  selectCommit: (repo: string, hash: string, subject: string) => Promise<void>;

  stage: (repo: string, changes: FileChange[]) => Promise<void>;
  unstage: (repo: string, changes: FileChange[]) => Promise<void>;
  discard: (repo: string, changes: FileChange[]) => Promise<void>;
  commit: (root: string) => Promise<void>;

  toggleGroup: (id: string) => void;

  // ---- 分支快速选择器 ----
  openBranchPicker: (root: string) => void;
  closeBranchPicker: () => void;
  setBranchPickerMode: (mode: BranchPickerMode, base?: string | null) => void;
  setBranchPickerFilter: (filter: string) => void;
  /** list 模式：切换分支；createFrom 模式：选中依据分支；detached 模式：分离签出 */
  pickBranch: (branch: BranchInfo) => void;

  loadBranches: (root: string) => Promise<void>;
  checkout: (root: string, name: string, create: boolean) => Promise<void>;
  createBranch: (root: string, name: string, base: string | null) => Promise<void>;
  checkoutDetached: (root: string, reference: string) => Promise<void>;
  sync: (root: string, op: 'fetch' | 'pull' | 'push' | 'sync') => Promise<void>;
  loadHistory: (root: string) => Promise<void>;
  clearNotice: () => void;
}

const STORAGE_KEY = 'vscode-git-panel.repos';
let initialized = false;

// 刷新队列：watcher 事件风暴时保证不并发、不丢最后一次刷新
const pendingRefreshes = new Set<string>();
let refreshing = false;

function emptyRepoState(info: RepoInfo): RepoState {
  return {
    info,
    status: null,
    branches: [],
    commits: [],
    message: '',
    amend: false,
    historyLoaded: false,
  };
}

function saveRepos(repos: RepoState[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(repos.map((r) => r.info.root)));
  } catch {
    // ignore
  }
}

function loadSavedRepos(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export const useStore = create<AppStore>()((set, get) => {
  function updateRepo(root: string, patch: Partial<RepoState>): void {
    set((state) => ({
      repos: state.repos.map((r) =>
        r.info.root === root ? { ...r, ...patch } : r,
      ),
    }));
  }

  async function doRefresh(root: string): Promise<void> {
    try {
      const status = await api.getStatus(root);
      updateRepo(root, { status });

      // 选中的文件如果已不在变更列表里，收起右侧 diff
      const sel = get().selection;
      if (sel?.kind === 'change' && sel.repo === root) {
        const all = [
          ...status.mergeChanges,
          ...status.indexChanges,
          ...status.workingTreeChanges,
          ...status.untrackedChanges,
        ];
        if (!all.some((c) => c.path === sel.path && c.staged === sel.staged)) {
          set({ selection: null, diff: null });
        }
      }
    } catch (e) {
      set({ notice: { level: 'error', text: String(e) } });
    }
  }

  async function loadDiffFor(
    sel: Extract<Selection, { kind: 'change' }>,
  ): Promise<void> {
    try {
      const diff = await api.getDiff(sel.repo, sel.path, sel.staged, sel.originalPath);
      const current = get().selection;
      if (
        current?.kind === 'change' &&
        current.repo === sel.repo &&
        current.path === sel.path
      ) {
        set({ diff });
      }
    } catch (e) {
      set({ notice: { level: 'error', text: String(e) } });
    }
  }

  /** stage / unstage 后，若当前选中的文件在变更集里，让选中项跟随移动并刷新 diff */
  async function followSelection(
    repo: string,
    changes: FileChange[],
    toStaged: boolean,
  ): Promise<void> {
    const sel = get().selection;
    if (sel?.kind !== 'change' || sel.repo !== repo) {
      return;
    }
    if (!changes.some((c) => c.path === sel.path)) {
      return;
    }
    const next = { ...sel, staged: toStaged };
    set({ selection: next });
    await loadDiffFor(next);
  }

  async function runAction(fn: () => Promise<void>): Promise<void> {
    try {
      set({ busy: true });
      await fn();
    } catch (e) {
      set({ notice: { level: 'error', text: String(e) } });
    } finally {
      set({ busy: false });
    }
  }

  return {
    repos: [],
    activeRoot: null,
    selection: null,
    diff: null,
    patch: null,
    busy: false,
    notice: null,
    collapsed: {},
    branchPicker: null,

    async init() {
      if (initialized) {
        return;
      }
      initialized = true;

      const saved = loadSavedRepos();
      for (const path of saved) {
        try {
          const info = await api.openRepository(path);
          set((state) =>
            state.repos.some((r) => r.info.root === info.root)
              ? state
              : { repos: [...state.repos, emptyRepoState(info)] },
          );
        } catch {
          // 目录已被删除或不再是仓库：跳过
        }
      }

      const first = get().repos[0];
      if (first) {
        set({ activeRoot: first.info.root });
        await get().refreshAll();
        for (const r of get().repos) {
          void get().loadBranches(r.info.root);
          void get().loadHistory(r.info.root);
        }
      }
    },

    async openRepository() {
      await runAction(async () => {
        const info = await api.chooseAndOpenRepository();
        if (!info) {
          return;
        }
        const exists = get().repos.some((r) => r.info.root === info.root);
        if (!exists) {
          set((state) => ({ repos: [...state.repos, emptyRepoState(info)] }));
          saveRepos(get().repos);
        }
        set({
          activeRoot: info.root,
          selection: null,
          diff: null,
          patch: null,
          branchPicker: null,
        });
        await get().refresh(info.root);
        await get().loadBranches(info.root);
        await get().loadHistory(info.root);
      });
    },

    async closeRepository(root) {
      try {
        await api.closeRepository(root);
      } catch {
        // ignore
      }
      const sel = get().selection;
      set((state) => {
        const repos = state.repos.filter((r) => r.info.root !== root);
        const activeRoot =
          state.activeRoot === root ? (repos[0]?.info.root ?? null) : state.activeRoot;
        return {
          repos,
          activeRoot,
          selection: sel && sel.repo === root ? null : state.selection,
          diff: sel && sel.repo === root ? null : state.diff,
          patch: sel && sel.repo === root ? null : state.patch,
          branchPicker: state.branchPicker?.repo === root ? null : state.branchPicker,
        };
      });
      saveRepos(get().repos);
    },

    setActive(root) {
      const current = get().activeRoot;
      if (current === root) {
        return;
      }
      set({
        activeRoot: root,
        selection: null,
        diff: null,
        patch: null,
        branchPicker: null,
      });
      const repo = get().repos.find((r) => r.info.root === root);
      if (repo) {
        if (!repo.status) {
          void get().refresh(root);
        }
        if (repo.branches.length === 0) {
          void get().loadBranches(root);
        }
        if (!repo.historyLoaded) {
          void get().loadHistory(root);
        }
      }
    },

    async refresh(root) {
      const target = root ?? get().activeRoot;
      if (!target) {
        return;
      }
      if (!get().repos.some((r) => r.info.root === target)) {
        return;
      }
      pendingRefreshes.add(target);
      if (refreshing) {
        return;
      }
      refreshing = true;
      try {
        while (pendingRefreshes.size > 0) {
          const next = pendingRefreshes.values().next().value as string;
          pendingRefreshes.delete(next);
          await doRefresh(next);
        }
      } finally {
        refreshing = false;
      }
    },

    async refreshAll() {
      await Promise.all(get().repos.map((r) => get().refresh(r.info.root)));
    },

    setMessage(root, message) {
      updateRepo(root, { message });
    },

    setAmend(root, amend) {
      updateRepo(root, { amend });
    },

    async selectChange(repo, change) {
      const sel = {
        kind: 'change' as const,
        repo,
        path: change.path,
        staged: change.staged,
        originalPath: change.originalPath,
      };
      set({ selection: sel, patch: null, diff: null });
      await loadDiffFor(sel);
    },

    async selectCommit(repo, hash, subject) {
      set({ selection: { kind: 'commit', repo, hash, subject }, diff: null, patch: null });
      try {
        const patch = await api.getCommitPatch(repo, hash);
        const current = get().selection;
        if (current?.kind === 'commit' && current.hash === hash) {
          set({ patch });
        }
      } catch (e) {
        set({ notice: { level: 'error', text: String(e) } });
      }
    },

    async stage(repo, changes) {
      await runAction(async () => {
        await api.stage(repo, changes.map((c) => c.path));
        await followSelection(repo, changes, true);
      });
      await get().refresh(repo);
    },

    async unstage(repo, changes) {
      await runAction(async () => {
        await api.unstage(repo, changes.map((c) => c.path));
        await followSelection(repo, changes, false);
      });
      await get().refresh(repo);
    },

    async discard(repo, changes) {
      const staged = changes.every((c) => c.staged);
      await runAction(async () => {
        await api.discardChanges(
          repo,
          changes.map((c) => c.path),
          staged,
        );
        const sel = get().selection;
        if (sel?.kind === 'change' && sel.repo === repo && changes.some((c) => c.path === sel.path)) {
          set({ selection: null, diff: null });
        }
      });
      await get().refresh(repo);
    },

    async commit(root) {
      const repo = get().repos.find((r) => r.info.root === root);
      if (!repo || !repo.message.trim()) {
        return;
      }
      await runAction(async () => {
        await api.commit(root, repo.message, repo.amend);
        updateRepo(root, { message: '', amend: false });
        set({
          selection: null,
          diff: null,
          notice: { level: 'success', text: '提交成功' },
        });
      });
      await get().refresh(root);
      await get().loadHistory(root);
    },

    toggleGroup(id) {
      set({ collapsed: { ...get().collapsed, [id]: !get().collapsed[id] } });
    },

    openBranchPicker(root) {
      set({ branchPicker: { repo: root, mode: 'list', base: null, filter: '' } });
      void get().loadBranches(root);
    },

    closeBranchPicker() {
      set({ branchPicker: null });
    },

    setBranchPickerMode(mode, base = null) {
      const p = get().branchPicker;
      if (!p) {
        return;
      }
      set({ branchPicker: { ...p, mode, base, filter: '' } });
    },

    setBranchPickerFilter(filter) {
      const p = get().branchPicker;
      if (!p) {
        return;
      }
      set({ branchPicker: { ...p, filter } });
    },

    pickBranch(branch) {
      const p = get().branchPicker;
      if (!p) {
        return;
      }
      if (p.mode === 'createFrom') {
        // 已选中新分支的依据分支 → 进入命名阶段
        set({ branchPicker: { ...p, mode: 'create', base: branch.name, filter: '' } });
        return;
      }
      if (p.mode === 'detached') {
        void get().checkoutDetached(p.repo, branch.name);
        return;
      }
      // list：普通切换（远程分支取短名，由 git 的 DWIM 建立跟踪）
      if (branch.isHead) {
        set({ branchPicker: null });
        return;
      }
      const name = branch.isRemote ? branch.name.split('/').slice(1).join('/') : branch.name;
      void get().checkout(p.repo, name, false);
    },

    async loadBranches(root) {
      if (!get().repos.some((r) => r.info.root === root)) {
        return;
      }
      try {
        const branches = await api.listBranches(root);
        updateRepo(root, { branches });
      } catch (e) {
        set({ notice: { level: 'error', text: String(e) } });
      }
    },

    async checkout(root, name, create) {
      await runAction(async () => {
        await api.checkoutBranch(root, name, create);
        set({
          selection: null,
          diff: null,
          patch: null,
          branchPicker: null,
          notice: { level: 'success', text: `已切换到 ${name}` },
        });
      });
      await get().refresh(root);
      await get().loadBranches(root);
      await get().loadHistory(root);
    },

    async createBranch(root, name, base) {
      const trimmed = name.trim();
      if (!trimmed) {
        return;
      }
      await runAction(async () => {
        await api.createBranch(root, trimmed, base);
        set({
          branchPicker: null,
          selection: null,
          diff: null,
          patch: null,
          notice: {
            level: 'success',
            text: `已基于 ${base ?? '当前分支'} 创建并切换到 ${trimmed}`,
          },
        });
      });
      await get().refresh(root);
      await get().loadBranches(root);
      await get().loadHistory(root);
    },

    async checkoutDetached(root, reference) {
      const trimmed = reference.trim();
      if (!trimmed) {
        return;
      }
      await runAction(async () => {
        await api.checkoutDetached(root, trimmed);
        set({
          branchPicker: null,
          selection: null,
          diff: null,
          patch: null,
          notice: { level: 'success', text: `已分离签出 ${trimmed}` },
        });
      });
      await get().refresh(root);
      await get().loadBranches(root);
      await get().loadHistory(root);
    },

    async sync(root, op) {
      await runAction(async () => {
        let text: string;
        if (op === 'fetch') {
          text = await api.fetchAll(root);
        } else if (op === 'pull') {
          text = await api.pull(root);
        } else if (op === 'push') {
          text = await api.push(root);
        } else {
          // 同步 = 先拉后推（对照 VS Code 的 sync）
          await api.pull(root);
          text = await api.push(root);
        }
        set({
          notice: { level: 'success', text: text.split('\n')[0] || '完成' },
        });
      });
      await get().refresh(root);
      await get().loadBranches(root);
    },

    async loadHistory(root) {
      if (!get().repos.some((r) => r.info.root === root)) {
        return;
      }
      try {
        const commits = await api.getLog(root, 100, 0);
        updateRepo(root, { commits, historyLoaded: true });
      } catch (e) {
        set({ notice: { level: 'error', text: String(e) } });
      }
    },

    clearNotice() {
      set({ notice: null });
    },
  };
});
