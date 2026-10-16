import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type {
  BranchInfo,
  CommitFile,
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

  getLog: (repo: string, limit?: number, skip?: number, refs?: string[]) =>
    invoke<CommitInfo[]>('get_log', { repo, limit, skip, refs }),

  getCommitPatch: (repo: string, hash: string, path?: string) =>
    invoke<string>('get_commit_patch', { repo, hash, path }),

  getCommitFiles: (repo: string, hash: string) =>
    invoke<CommitFile[]>('get_commit_files', { repo, hash }),
};
