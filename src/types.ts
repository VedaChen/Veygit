export interface FileChange {
  path: string;
  status: string;
  originalPath: string | null;
  staged: boolean;
}

export interface RepositoryStatus {
  root: string;
  head: string | null;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  mergeChanges: FileChange[];
  indexChanges: FileChange[];
  workingTreeChanges: FileChange[];
  untrackedChanges: FileChange[];
}

export interface RepoInfo {
  root: string;
  name: string;
  gitVersion: string;
}

export interface BranchInfo {
  name: string;
  isRemote: boolean;
  isHead: boolean;
  commit: string;
}

export interface CommitInfo {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  timestamp: number;
  subject: string;
  refs: string[];
  parents: string[];
}

export type DiffKind = 'text' | 'binary' | 'tooLarge';

export interface DiffContent {
  kind: DiffKind;
  original: string;
  modified: string;
}
