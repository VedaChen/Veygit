use anyhow::Result;

use super::exec::Git;

/// 创建工作树（在指定路径签出当前提交）：git worktree add <path>
pub fn worktree_add(git: &Git, path: &str) -> Result<String> {
    git.run_msg(&["worktree", "add", path])
}
