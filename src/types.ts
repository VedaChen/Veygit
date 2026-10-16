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
  /** 分支尖端提交的第一行消息 */
  subject: string;
  /** 提交作者 */
  author: string;
  /** 提交时间（unix 秒） */
  timestamp: number;
  /** 相对 upstream 领先的提交数 */
  ahead: number;
  /** 相对 upstream 落后的提交数 */
  behind: number;
  /** 是否设置了 upstream */
  hasUpstream: boolean;
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

/** 提交中变更的文件（对照 VS Code graph 提交展开的文件列表） */
export interface CommitFile {
  /** 相对仓库根的路径 */
  path: string;
  /** 单字母状态：M/A/D/R/C… */
  status: string;
}

export type DiffKind = 'text' | 'binary' | 'tooLarge';

export interface DiffContent {
  kind: DiffKind;
  original: string;
  modified: string;
}

/** 储藏条目（对照 git stash list） */
export interface StashInfo {
  reference: string;
  message: string;
}
