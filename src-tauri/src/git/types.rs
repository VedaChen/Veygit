use serde::Serialize;

/// 单个文件的变更条目（对应 VS Code SCM 的 SourceControlResourceState）
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    /// 相对仓库根目录的路径（正斜杠分隔）
    pub path: String,
    /// 单字母状态：M/A/D/R/C/T/U/?
    pub status: String,
    /// rename / copy 时的原路径
    pub original_path: Option<String>,
    /// 属于已暂存（index）组
    pub staged: bool,
}

/// 仓库整体状态（对应 VS Code 的 Repository + ResourceGroup 四组）
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryStatus {
    pub root: String,
    pub head: Option<String>,
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub merge_changes: Vec<FileChange>,
    pub index_changes: Vec<FileChange>,
    pub working_tree_changes: Vec<FileChange>,
    pub untracked_changes: Vec<FileChange>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    pub root: String,
    pub name: String,
    pub git_version: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub name: String,
    pub is_remote: bool,
    pub is_head: bool,
    pub commit: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub author: String,
    pub email: String,
    pub timestamp: i64,
    pub subject: String,
    pub refs: Vec<String>,
    pub parents: Vec<String>,
}

/// diff 内容：kind = "text" | "binary" | "tooLarge"
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiffContent {
    pub kind: String,
    pub original: String,
    pub modified: String,
}
