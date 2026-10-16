use std::collections::HashSet;
use std::fs;

use anyhow::{anyhow, Result};

use super::exec::{Git, GitOutput};

fn run_owned(git: &Git, args: &[String]) -> Result<GitOutput> {
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let out = git.run_raw(&refs)?;
    if out.code != 0 {
        return Err(anyhow!(out.combined()));
    }
    Ok(out)
}

pub fn has_head(git: &Git) -> bool {
    git.run_raw(&["rev-parse", "--verify", "-q", "HEAD"])
        .map(|o| o.code == 0)
        .unwrap_or(false)
}

/// 暂存文件：git add -- <paths>
pub fn stage(git: &Git, paths: &[String]) -> Result<()> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut args = vec!["add".to_string(), "--".to_string()];
    args.extend(paths.iter().cloned());
    run_owned(git, &args)?;
    Ok(())
}

/// 取消暂存：有 HEAD 用 `reset`，初始仓库用 `rm --cached`
pub fn unstage(git: &Git, paths: &[String]) -> Result<()> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut args = if has_head(git) {
        vec![
            "reset".to_string(),
            "-q".to_string(),
            "HEAD".to_string(),
            "--".to_string(),
        ]
    } else {
        vec![
            "rm".to_string(),
            "--cached".to_string(),
            "-r".to_string(),
            "-q".to_string(),
            "--ignore-unmatch".to_string(),
            "--".to_string(),
        ]
    };
    args.extend(paths.iter().cloned());
    run_owned(git, &args)?;
    Ok(())
}

/// 丢弃变更。
/// staged=true  → 把 index 与工作区都恢复到 HEAD（文件回到"干净"状态）
/// staged=false → 工作区恢复为 index 内容；untracked 文件直接删除
pub fn discard(git: &Git, paths: &[String], staged: bool) -> Result<()> {
    if paths.is_empty() {
        return Ok(());
    }

    if staged {
        let mut to_checkout: Vec<String> = Vec::new();
        let mut to_remove: Vec<String> = Vec::new();
        for p in paths {
            if blob_exists_in_head(git, p) {
                to_checkout.push(p.clone());
            } else {
                to_remove.push(p.clone());
            }
        }
        if !to_checkout.is_empty() {
            let mut args = vec![
                "checkout".to_string(),
                "HEAD".to_string(),
                "--".to_string(),
            ];
            args.extend(to_checkout);
            run_owned(git, &args)?;
        }
        if !to_remove.is_empty() {
            let mut args = vec![
                "rm".to_string(),
                "--cached".to_string(),
                "-f".to_string(),
                "-q".to_string(),
                "--ignore-unmatch".to_string(),
                "--".to_string(),
            ];
            args.extend(to_remove.iter().cloned());
            run_owned(git, &args)?;
            for p in &to_remove {
                remove_worktree_path(git, p);
            }
        }
        return Ok(());
    }

    // unstaged：tracked → checkout --，untracked → 删除文件
    let tracked = list_tracked(git, paths)?;
    let tracked_set: HashSet<&String> = tracked.iter().collect();

    let mut to_checkout: Vec<String> = Vec::new();
    for p in paths {
        if tracked_set.contains(p) {
            to_checkout.push(p.clone());
        }
    }
    if !to_checkout.is_empty() {
        let mut args = vec!["checkout".to_string(), "--".to_string()];
        args.extend(to_checkout);
        run_owned(git, &args)?;
    }
    for p in paths {
        if !tracked_set.contains(p) {
            remove_worktree_path(git, p);
        }
    }
    Ok(())
}

/// 提交：git commit -m <message> [--amend]
pub fn commit(git: &Git, message: &str, amend: bool) -> Result<String> {
    let mut args = vec!["commit", "-m", message];
    if amend {
        args.push("--amend");
    }
    let out = git.run_raw(&args)?;
    if out.code != 0 {
        return Err(anyhow!(out.combined()));
    }
    Ok(out.combined())
}

/// 切换 / 创建分支
pub fn checkout_branch(git: &Git, name: &str, create: bool) -> Result<String> {
    let out = if create {
        git.run_raw(&["checkout", "-b", name])?
    } else {
        git.run_raw(&["checkout", name])?
    };
    if out.code != 0 {
        return Err(anyhow!(out.combined()));
    }
    Ok(out.combined())
}

/// 基于 base（默认为当前 HEAD）创建并切换到新分支。
/// 对应 VS Code 的 "Create Branch..."（base 为空）与 "Create Branch From..."（指定 base）。
pub fn create_branch(git: &Git, name: &str, base: Option<&str>) -> Result<String> {
    let out = match base {
        Some(b) if !b.trim().is_empty() => git.run_raw(&["checkout", "-b", name, b.trim()])?,
        _ => git.run_raw(&["checkout", "-b", name])?,
    };
    if out.code != 0 {
        return Err(anyhow!(out.combined()));
    }
    Ok(out.combined())
}

/// 签出已分离（Detached HEAD）：git checkout --detach <ref>
pub fn checkout_detached(git: &Git, reference: &str) -> Result<String> {
    let out = git.run_raw(&["checkout", "--detach", reference.trim()])?;
    if out.code != 0 {
        return Err(anyhow!(out.combined()));
    }
    Ok(out.combined())
}

/// 抓取所有远程：git fetch --all（剪除语义单独走 fetch_prune）
pub fn fetch(git: &Git) -> Result<String> {
    git.run_msg(&["fetch", "--all"])
}

pub fn pull(git: &Git) -> Result<String> {
    let out = git.run_raw(&["pull"])?;
    if out.code != 0 {
        return Err(anyhow!(out.combined()));
    }
    Ok(out.combined())
}

pub fn push(git: &Git) -> Result<String> {
    let out = git.run_raw(&["push"])?;
    if out.code == 0 {
        return Ok(out.combined());
    }

    let stderr = out.stderr_string();
    // 当前分支还没有 upstream：按惯例推到 origin 并建立跟踪
    if stderr.contains("has no upstream branch")
        || stderr.contains("no upstream branch")
        || stderr.contains("--set-upstream")
    {
        let branch = git.run_stdout(&["branch", "--show-current"])?;
        let branch = branch.trim().to_string();
        if !branch.is_empty() {
            let out2 = git.run_raw(&["push", "-u", "origin", &branch])?;
            if out2.code != 0 {
                return Err(anyhow!(out2.combined()));
            }
            return Ok(out2.combined());
        }
    }
    Err(anyhow!(out.combined()))
}

// ---------------------------------------------------------------------------
// 菜单命令：提交 / 变基 / 拉取推送 / 分支
// 失败时统一返回 git 的 stderr 原文（由 Git::run_msg 保证）
// ---------------------------------------------------------------------------

/// 提交全部改动：先 git add -A，再 git commit -m <message> [--amend] [--signoff]
pub fn commit_all(git: &Git, message: &str, amend: bool, signed_off: bool) -> Result<String> {
    git.run_msg(&["add", "-A"])?;

    let mut args = vec!["commit", "-m", message];
    if amend {
        args.push("--amend");
    }
    if signed_off {
        args.push("--signoff");
    }
    git.run_msg(&args)
}

/// 撤销上一次提交（改动保留在暂存区）：git reset --soft HEAD~1
pub fn commit_undo(git: &Git) -> Result<String> {
    git.run_msg(&["reset", "--soft", "HEAD~1"])
}

/// 中止进行中的变基：git rebase --abort
pub fn rebase_abort(git: &Git) -> Result<String> {
    git.run_msg(&["rebase", "--abort"])
}

/// 以变基方式拉取：git pull --rebase
pub fn pull_rebase(git: &Git) -> Result<String> {
    git.run_msg(&["pull", "--rebase"])
}

/// 从指定远程的分支拉取：git pull <remote> <branch>
pub fn pull_from(git: &Git, remote: &str, branch: &str) -> Result<String> {
    git.run_msg(&["pull", remote, branch])
}

/// 推送到指定远程分支：git push <remote> HEAD:<branch>
pub fn push_to(git: &Git, remote: &str, branch: &str) -> Result<String> {
    git.run_msg(&["push", remote, &format!("HEAD:{}", branch)])
}

/// 抓取并剪除远程已删除的引用：git fetch --prune
pub fn fetch_prune(git: &Git) -> Result<String> {
    git.run_msg(&["fetch", "--prune"])
}

/// 合并指定分支：git merge <branch>（冲突等失败时返回 stderr 原文）
pub fn merge_branch(git: &Git, branch: &str) -> Result<String> {
    git.run_msg(&["merge", branch])
}

/// 变基到指定分支：git rebase <branch>
pub fn rebase_branch(git: &Git, branch: &str) -> Result<String> {
    git.run_msg(&["rebase", branch])
}

/// 重命名当前分支：git branch -m <new_name>
pub fn rename_branch(git: &Git, new_name: &str) -> Result<String> {
    git.run_msg(&["branch", "-m", new_name])
}

/// 删除本地分支：force=false 用 -d（仅已合并），true 用 -D（强制）
pub fn delete_branch(git: &Git, name: &str, force: bool) -> Result<String> {
    git.run_msg(&["branch", if force { "-D" } else { "-d" }, name])
}

/// 删除远程分支：git push <remote> --delete <branch>
pub fn delete_remote_branch(git: &Git, remote: &str, branch: &str) -> Result<String> {
    git.run_msg(&["push", remote, "--delete", branch])
}

/// 发布分支（推送当前分支并建立跟踪）：git push -u <remote> HEAD
pub fn publish_branch(git: &Git, remote: &str) -> Result<String> {
    git.run_msg(&["push", "-u", remote, "HEAD"])
}

fn blob_exists_in_head(git: &Git, path: &str) -> bool {
    git.run_raw(&["cat-file", "-e", &format!("HEAD:{}", path)])
        .map(|o| o.code == 0)
        .unwrap_or(false)
}

fn list_tracked(git: &Git, paths: &[String]) -> Result<Vec<String>> {
    let mut args = vec!["ls-files".to_string(), "-z".to_string(), "--".to_string()];
    args.extend(paths.iter().cloned());
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let out = git.run_ok(&refs)?;
    let mut result = Vec::new();
    for part in out.stdout.split(|&b| b == 0) {
        if part.is_empty() {
            continue;
        }
        result.push(String::from_utf8_lossy(part).into_owned());
    }
    Ok(result)
}

fn remove_worktree_path(git: &Git, path: &str) {
    let abs = git.root.join(path);
    if abs.is_dir() {
        let _ = fs::remove_dir_all(&abs);
    } else if abs.exists() {
        let _ = fs::remove_file(&abs);
    }
}
