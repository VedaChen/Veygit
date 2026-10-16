use anyhow::{anyhow, Result};

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

/// 列出远程名 + fetch URL（对照 VS Code 删除远程 QuickPick 的 "名称 + URL" 行）
pub fn remote_urls(git: &Git) -> Result<Vec<(String, String)>> {
    let out = git.run_raw(&["remote", "-v"])?;
    if out.code != 0 {
        return Err(anyhow!(out.combined()));
    }
    let mut result: Vec<(String, String)> = Vec::new();
    for line in out.stdout_string().lines() {
        let line = line.trim();
        if !line.ends_with("(fetch)") {
            continue;
        }
        let mut parts = line.split_whitespace();
        let name = parts.next().unwrap_or("");
        let url = parts.next().unwrap_or("");
        if name.is_empty() || url.is_empty() || result.iter().any(|(n, _)| n == name) {
            continue;
        }
        result.push((name.to_string(), url.to_string()));
    }
    Ok(result)
}

/// 添加远程：git remote add <name> <url>
pub fn remote_add(git: &Git, name: &str, url: &str) -> Result<String> {
    git.run_msg(&["remote", "add", name, url])
}

/// 删除远程：git remote remove <name>
pub fn remote_remove(git: &Git, name: &str) -> Result<String> {
    git.run_msg(&["remote", "remove", name])
}
