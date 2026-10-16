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

pub fn fetch(git: &Git) -> Result<String> {
    let out = git.run_raw(&["fetch", "--all", "--prune"])?;
    if out.code != 0 {
        return Err(anyhow!(out.combined()));
    }
    Ok(out.combined())
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
