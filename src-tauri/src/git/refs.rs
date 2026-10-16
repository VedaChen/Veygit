use anyhow::Result;

use super::exec::Git;
use super::types::BranchInfo;

/// 列出本地与远程分支。
/// 对应 VS Code git.ts 的 getRefs()，这里简化为一次 for-each-ref。
pub fn list_branches(git: &Git) -> Result<Vec<BranchInfo>> {
    let out = git.run_stdout(&[
        "for-each-ref",
        "--format=%(refname)%00%(objectname)%00%(HEAD)%00",
        "refs/heads/",
        "refs/remotes/",
    ])?;

    let mut result: Vec<BranchInfo> = Vec::new();
    for line in out.lines() {
        let fields: Vec<&str> = line.split('\u{0}').collect();
        if fields.len() < 3 {
            continue;
        }
        let full = fields[0];
        if full.is_empty() {
            continue;
        }
        // 跳过 origin/HEAD 这类符号引用
        if full.starts_with("refs/remotes/") && full.ends_with("/HEAD") {
            continue;
        }

        let is_remote = full.starts_with("refs/remotes/");
        let name = full
            .strip_prefix("refs/heads/")
            .or_else(|| full.strip_prefix("refs/remotes/"))
            .unwrap_or(full)
            .to_string();
        let is_head = fields[2].trim() == "*";

        result.push(BranchInfo {
            name,
            is_remote,
            is_head,
            commit: fields[1].to_string(),
        });
    }

    // 本地分支在前，其余按名字排序
    result.sort_by(|a, b| {
        (a.is_remote, &a.name)
            .cmp(&(b.is_remote, &b.name))
    });
    Ok(result)
}
