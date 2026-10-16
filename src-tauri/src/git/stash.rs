use anyhow::Result;

use super::exec::Git;
use super::types::StashInfo;

/// 储藏当前改动：git stash push [-u] [--staged]
/// include_untracked=true 时连同未跟踪文件一起储藏（-u）；
/// staged=true 时只储藏已暂存内容（--staged，其余改动留在工作区）。
pub fn stash_push(git: &Git, include_untracked: bool, staged: bool) -> Result<String> {
    let mut args = vec!["stash", "push"];
    if include_untracked {
        args.push("-u");
    }
    if staged {
        args.push("--staged");
    }
    git.run_msg(&args)
}

/// 列出储藏条目：git stash list --format=%gd%x1f%s%x1e
/// 字段以 US(\x1f) 分隔、记录以 RS(\x1e) 结尾，避免从 "stash@{0}: WIP on ..." 里切冒号出错。
pub fn stash_list(git: &Git) -> Result<Vec<StashInfo>> {
    let out = git.run_stdout(&["stash", "list", "--format=%gd%x1f%s%x1e"])?;

    let mut result = Vec::new();
    for record in out.split('\u{1e}') {
        let record = record.trim_matches(|c: char| c == '\r' || c == '\n');
        if record.is_empty() {
            continue;
        }
        let mut fields = record.split('\u{1f}');
        let reference = fields.next().unwrap_or("").trim().to_string();
        if reference.is_empty() {
            continue;
        }
        let message = fields.next().unwrap_or("").trim_end().to_string();
        result.push(StashInfo { reference, message });
    }
    Ok(result)
}

/// 应用储藏（条目保留）：git stash apply <reference>
pub fn stash_apply(git: &Git, reference: &str) -> Result<String> {
    git.run_msg(&["stash", "apply", reference])
}

/// 弹出储藏（应用后删除该条目）：git stash pop <reference>
pub fn stash_pop(git: &Git, reference: &str) -> Result<String> {
    git.run_msg(&["stash", "pop", reference])
}

/// 删除单个储藏条目：git stash drop <reference>
pub fn stash_drop(git: &Git, reference: &str) -> Result<String> {
    git.run_msg(&["stash", "drop", reference])
}

/// 清空所有储藏条目：git stash clear
pub fn stash_clear(git: &Git) -> Result<String> {
    git.run_msg(&["stash", "clear"])
}

/// 以 patch 形式查看储藏内容：git stash show -p <reference>
pub fn stash_show(git: &Git, reference: &str) -> Result<String> {
    git.run_msg(&["stash", "show", "-p", reference])
}
