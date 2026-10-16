import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type {
  BranchInfo,
  CommitFile,
  CommitInfo,
  CommitStats,
  DiffContent,
  RepoInfo,
  RepositoryStatus,
  StashInfo,
} from './types';

export const api = {
  async chooseAndOpenRepository(): Promise<RepoInfo | null> {
    const dir = await open({
      directory: true,
      multiple: false,
      title: '选择 Git 仓库目录',
    });
    if (!dir) {
      return null;
    }
    return invoke<RepoInfo>('open_repository', { path: dir });
  },

  openRepository: (path: string) => invoke<RepoInfo>('open_repository', { path }),

  closeRepository: (repo: string) => invoke<void>('close_repository', { repo }),

  getStatus: (repo: string) => invoke<RepositoryStatus>('get_status', { repo }),

  stage: (repo: string, paths: string[]) => invoke<void>('stage', { repo, paths }),

  unstage: (repo: string, paths: string[]) =>
    invoke<void>('unstage', { repo, paths }),

  discardChanges: (repo: string, paths: string[], staged: boolean) =>
    invoke<void>('discard_changes', { repo, paths, staged }),

  commit: (repo: string, message: string, amend: boolean) =>
    invoke<string>('commit', { repo, message, amend }),

  getDiff: (
    repo: string,
    path: string,
    staged: boolean,
    originalPath: string | null,
  ) => invoke<DiffContent>('get_diff', { repo, path, staged, originalPath }),

  listBranches: (repo: string) =>
    invoke<BranchInfo[]>('list_branches', { repo }),

  checkoutBranch: (repo: string, name: string, create: boolean) =>
    invoke<string>('checkout_branch', { repo, name, create }),

  createBranch: (repo: string, name: string, base: string | null) =>
    invoke<string>('create_branch', { repo, name, base }),

  checkoutDetached: (repo: string, reference: string) =>
    invoke<string>('checkout_detached', { repo, reference }),

  fetchAll: (repo: string) => invoke<string>('fetch_all', { repo }),

  pull: (repo: string) => invoke<string>('pull', { repo }),

  push: (repo: string) => invoke<string>('push', { repo }),

  remoteUrl: (repo: string) => invoke<string>('remote_url', { repo }),

  storeCredentials: (
    repo: string,
    protocol: string,
    host: string,
    username: string,
    password: string,
  ) => invoke<void>('store_credentials', { repo, protocol, host, username, password }),

  getLog: (repo: string, limit?: number, skip?: number, refs?: string[]) =>
    invoke<CommitInfo[]>('get_log', { repo, limit, skip, refs }),

  getCommitPatch: (repo: string, hash: string, path?: string) =>
    invoke<string>('get_commit_patch', { repo, hash, path }),

  getCommitFiles: (repo: string, hash: string) =>
    invoke<CommitFile[]>('get_commit_files', { repo, hash }),

  getCommitStats: (repo: string, hash: string) =>
    invoke<CommitStats>('get_commit_stats', { repo, hash }),

  getCommitFileDiff: (repo: string, hash: string, path: string) =>
    invoke<DiffContent>('get_commit_file_diff', { repo, hash, path }),

  // ---- 提交（全部提交 / 撤销上一次提交） ----

  commitAll: (
    repo: string,
    message: string,
    amend: boolean,
    signedOff: boolean,
  ) => invoke<string>('commit_all', { repo, message, amend, signedOff }),

  commitUndo: (repo: string) => invoke<string>('commit_undo', { repo }),

  // ---- 变基 ----

  rebaseAbort: (repo: string) => invoke<string>('rebase_abort', { repo }),

  // ---- 拉取 / 推送（指定远端） ----

  pullRebase: (repo: string) => invoke<string>('pull_rebase', { repo }),

  pullFrom: (repo: string, remote: string, branch: string) =>
    invoke<string>('pull_from', { repo, remote, branch }),

  pushTo: (repo: string, remote: string, branch: string) =>
    invoke<string>('push_to', { repo, remote, branch }),

  fetchPrune: (repo: string) => invoke<string>('fetch_prune', { repo }),

  // ---- 分支（合并 / 变基 / 重命名 / 删除 / 发布） ----

  mergeBranch: (repo: string, branch: string) =>
    invoke<string>('merge_branch', { repo, branch }),

  rebaseBranch: (repo: string, branch: string) =>
    invoke<string>('rebase_branch', { repo, branch }),

  renameBranch: (repo: string, newName: string) =>
    invoke<string>('rename_branch', { repo, newName }),

  deleteBranch: (repo: string, name: string, force: boolean) =>
    invoke<string>('delete_branch', { repo, name, force }),

  deleteRemoteBranch: (repo: string, remote: string, branch: string) =>
    invoke<string>('delete_remote_branch', { repo, remote, branch }),

  publishBranch: (repo: string, remote: string) =>
    invoke<string>('publish_branch', { repo, remote }),

  // ---- 远端管理 ----

  listRemotes: (repo: string) => invoke<string[]>('list_remotes', { repo }),

  remoteAdd: (repo: string, name: string, url: string) =>
    invoke<string>('remote_add', { repo, name, url }),

  remoteRemove: (repo: string, name: string) =>
    invoke<string>('remote_remove', { repo, name }),

  // ---- 储藏 ----

  stashPush: (repo: string, includeUntracked: boolean, staged: boolean) =>
    invoke<string>('stash_push', { repo, includeUntracked, staged }),

  stashList: (repo: string) => invoke<StashInfo[]>('stash_list', { repo }),

  stashApply: (repo: string, reference: string) =>
    invoke<string>('stash_apply', { repo, reference }),

  stashPop: (repo: string, reference: string) =>
    invoke<string>('stash_pop', { repo, reference }),

  stashDrop: (repo: string, reference: string) =>
    invoke<string>('stash_drop', { repo, reference }),

  stashClear: (repo: string) => invoke<string>('stash_clear', { repo }),

  stashShow: (repo: string, reference: string) =>
    invoke<string>('stash_show', { repo, reference }),

  // ---- 标签 ----

  tagCreate: (repo: string, name: string) =>
    invoke<string>('tag_create', { repo, name }),

  tagDelete: (repo: string, name: string) =>
    invoke<string>('tag_delete', { repo, name }),

  tagDeleteRemote: (repo: string, remote: string, name: string) =>
    invoke<string>('tag_delete_remote', { repo, remote, name }),

  tagPush: (repo: string, remote: string) =>
    invoke<string>('tag_push', { repo, remote }),

  // ---- 工作树 / 克隆 ----

  worktreeAdd: (repo: string, path: string) =>
    invoke<string>('worktree_add', { repo, path }),

  cloneRepository: (url: string, target: string) =>
    invoke<string>('clone_repository', { url, target }),
};
