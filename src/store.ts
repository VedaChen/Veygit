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

export type Selection =
  | { kind: 'change'; path: string; staged: boolean; originalPath: string | null }
  | { kind: 'commit'; hash: string }
  | null;

export interface Notice {
  level: 'info' | 'error' | 'success';
  text: string;
}

export type View = 'changes' | 'history';

interface AppStore {
  repo: RepoInfo | null;
  status: RepositoryStatus | null;
  branches: BranchInfo[];
  commits: CommitInfo[];
  historyLoading: boolean;
  view: View;
  selection: Selection;
  diff: DiffContent | null;
  patch: string | null;
  message: string;
  amend: boolean;
  busy: boolean;
  notice: Notice | null;
  collapsed: Record<string, boolean>;

  openRepository: () => Promise<void>;
  refresh: () => Promise<void>;
  setView: (view: View) => void;
  toggleGroup: (id: string) => void;
  setMessage: (message: string) => void;
  setAmend: (amend: boolean) => void;
  selectChange: (change: FileChange) => Promise<void>;
  selectCommit: (hash: string) => Promise<void>;
  stage: (changes: FileChange[]) => Promise<void>;
  unstage: (changes: FileChange[]) => Promise<void>;
  discard: (changes: FileChange[]) => Promise<void>;
  commit: () => Promise<void>;
  loadBranches: () => Promise<void>;
  checkout: (name: string, create: boolean) => Promise<void>;
  sync: (op: 'fetch' | 'pull' | 'push') => Promise<void>;
  loadHistory: () => Promise<void>;
  clearNotice: () => void;
}

// refresh 的防抖/排队，watcher 事件风暴时保证不并发、不丢最后一次刷新
let refreshing = false;
let refreshQueued = false;

export const useStore = create<AppStore>()((set, get) => {
  async function runAction(fn: () => Promise<void>): Promise<void> {
    try {
      set({ busy: true });
      await fn();
    } catch (e) {
      set({ notice: { level: 'error', text: String(e) } });
    } finally {
      set({ busy: false });
      await get().refresh();
    }
  }

  async function loadDiffFor(sel: Extract<Selection, { kind: 'change' }>): Promise<void> {
    try {
      const diff = await api.getDiff(sel.path, sel.staged, sel.originalPath);
      const current = get().selection;
      if (current?.kind === 'change' && current.path === sel.path) {
        set({ diff });
      }
    } catch (e) {
      set({ notice: { level: 'error', text: String(e) } });
    }
  }

  /** stage / unstage 后，若当前选中的文件在变更集里，让选中项跟随移动并刷新 diff */
  async function followSelection(changes: FileChange[], toStaged: boolean): Promise<void> {
    const sel = get().selection;
    if (sel?.kind !== 'change') {
      return;
    }
    if (!changes.some((c) => c.path === sel.path)) {
      return;
    }
    const next = { ...sel, staged: toStaged };
    set({ selection: next });
    await loadDiffFor(next);
  }

  return {
    repo: null,
    status: null,
    branches: [],
    commits: [],
    historyLoading: false,
    view: 'changes',
    selection: null,
    diff: null,
    patch: null,
    message: '',
    amend: false,
    busy: false,
    notice: null,
    collapsed: {},

    async openRepository() {
      try {
        set({ busy: true });
        const repo = await api.chooseAndOpenRepository();
        if (!repo) {
          return;
        }
        set({
          repo,
          status: null,
          selection: null,
          diff: null,
          patch: null,
          commits: [],
          notice: { level: 'info', text: `Opened ${repo.root}` },
        });
        await get().refresh();
        await get().loadBranches();
        await get().loadHistory();
      } catch (e) {
        set({ notice: { level: 'error', text: String(e) } });
      } finally {
        set({ busy: false });
      }
    },

    async refresh() {
      if (!get().repo) {
        return;
      }
      if (refreshing) {
        refreshQueued = true;
        return;
      }
      refreshing = true;
      try {
        const status = await api.getStatus();
        set({ status });

        // 选中的文件如果已经不在变更列表里，收起 diff
        const sel = get().selection;
        if (sel?.kind === 'change') {
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
      } finally {
        refreshing = false;
        if (refreshQueued) {
          refreshQueued = false;
          void get().refresh();
        }
      }
    },

    setView(view) {
      set({ view });
      if (view === 'history' && get().commits.length === 0) {
        void get().loadHistory();
      }
    },

    toggleGroup(id) {
      set({ collapsed: { ...get().collapsed, [id]: !get().collapsed[id] } });
    },

    setMessage(message) {
      set({ message });
    },

    setAmend(amend) {
      set({ amend });
    },

    async selectChange(change) {
      const sel = {
        kind: 'change' as const,
        path: change.path,
        staged: change.staged,
        originalPath: change.originalPath,
      };
      set({ selection: sel, patch: null, diff: null });
      await loadDiffFor(sel);
    },

    async selectCommit(hash) {
      set({ selection: { kind: 'commit', hash }, diff: null, patch: null });
      try {
        const patch = await api.getCommitPatch(hash);
        set({ patch });
      } catch (e) {
        set({ notice: { level: 'error', text: String(e) } });
      }
    },

    async stage(changes) {
      await runAction(async () => {
        await api.stage(changes.map((c) => c.path));
        await followSelection(changes, true);
      });
    },

    async unstage(changes) {
      await runAction(async () => {
        await api.unstage(changes.map((c) => c.path));
        await followSelection(changes, false);
      });
    },

    async discard(changes) {
      const staged = changes.every((c) => c.staged);
      await runAction(async () => {
        await api.discardChanges(
          changes.map((c) => c.path),
          staged,
        );
        const sel = get().selection;
        if (sel?.kind === 'change' && changes.some((c) => c.path === sel.path)) {
          set({ selection: null, diff: null });
        }
      });
    },

    async commit() {
      const { message, amend } = get();
      if (!message.trim()) {
        return;
      }
      await runAction(async () => {
        await api.commit(message, amend);
        set({
          message: '',
          amend: false,
          selection: null,
          diff: null,
          notice: { level: 'success', text: 'Committed' },
        });
      });
      void get().loadHistory();
    },

    async loadBranches() {
      if (!get().repo) {
        return;
      }
      try {
        const branches = await api.listBranches();
        set({ branches });
      } catch (e) {
        set({ notice: { level: 'error', text: String(e) } });
      }
    },

    async checkout(name, create) {
      await runAction(async () => {
        await api.checkoutBranch(name, create);
        set({
          selection: null,
          diff: null,
          patch: null,
          notice: { level: 'success', text: `Checked out ${name}` },
        });
      });
      await get().loadBranches();
      await get().loadHistory();
    },

    async sync(op) {
      await runAction(async () => {
        const text =
          op === 'fetch'
            ? await api.fetchAll()
            : op === 'pull'
              ? await api.pull()
              : await api.push();
        set({
          notice: {
            level: 'success',
            text: text || `${op} completed`,
          },
        });
      });
    },

    async loadHistory() {
      if (!get().repo) {
        return;
      }
      set({ historyLoading: true });
      try {
        const commits = await api.getLog(100, 0);
        set({ commits });
      } catch (e) {
        set({ notice: { level: 'error', text: String(e) } });
      } finally {
        set({ historyLoading: false });
      }
    },

    clearNotice() {
      set({ notice: null });
    },
  };
});
