import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type {
  BranchInfo,
  CommitInfo,
  DiffContent,
  RepoInfo,
  RepositoryStatus,
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

  getStatus: () => invoke<RepositoryStatus>('get_status'),

  stage: (paths: string[]) => invoke<void>('stage', { paths }),

  unstage: (paths: string[]) => invoke<void>('unstage', { paths }),

  discardChanges: (paths: string[], staged: boolean) =>
    invoke<void>('discard_changes', { paths, staged }),

  commit: (message: string, amend: boolean) =>
    invoke<string>('commit', { message, amend }),

  getDiff: (path: string, staged: boolean, originalPath: string | null) =>
    invoke<DiffContent>('get_diff', { path, staged, originalPath }),

  listBranches: () => invoke<BranchInfo[]>('list_branches'),

  checkoutBranch: (name: string, create: boolean) =>
    invoke<string>('checkout_branch', { name, create }),

  fetchAll: () => invoke<string>('fetch_all'),

  pull: () => invoke<string>('pull'),

  push: () => invoke<string>('push'),

  getLog: (limit?: number, skip?: number) =>
    invoke<CommitInfo[]>('get_log', { limit, skip }),

  getCommitPatch: (hash: string) =>
    invoke<string>('get_commit_patch', { hash }),
};
