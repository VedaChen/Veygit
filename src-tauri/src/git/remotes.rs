use anyhow::Result;

use super::exec::Git;

/// 列出已配置的远程名（每行一个 → Vec<String>，保持 `git remote` 的字母序）
pub fn list_remotes(git: &Git) -> Result<Vec<String>> {
    let out = git.run_stdout(&["remote"])?;
    Ok(out
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect())
}

/// 添加远程：git remote add <name> <url>
pub fn remote_add(git: &Git, name: &str, url: &str) -> Result<String> {
    git.run_msg(&["remote", "add", name, url])
}

/// 删除远程：git remote remove <name>
pub fn remote_remove(git: &Git, name: &str) -> Result<String> {
    git.run_msg(&["remote", "remove", name])
}
