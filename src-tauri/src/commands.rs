use tauri::State;

use crate::git::types::*;
use crate::git::{clone, diff, exec::Git, log, ops, refs, remotes, stash, status, tags, worktree};
use crate::state::{start_watcher, AppState, RepoSession};

type CmdResult<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// 在指定仓库上执行操作（repo = 仓库根路径，由 open_repository 返回）
fn with_repo<T>(
    state: &State<'_, AppState>,
    repo: &str,
    f: impl FnOnce(&Git) -> anyhow::Result<T>,
) -> CmdResult<T> {
    let guard = state.repos.lock().map_err(err)?;
    let session = guard
        .iter()
        .find(|s| s.root == repo)
        .ok_or_else(|| format!("仓库未打开: {}", repo))?;
    f(&session.git).map_err(err)
}

/// 打开仓库：path 可以是仓库内的任意目录，自动向上寻找仓库根。幂等。
#[tauri::command]
pub async fn open_repository(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> CmdResult<RepoInfo> {
    let probe = Git::new(path.clone());
    let out = probe.run_raw(&["rev-parse", "--show-toplevel"]).map_err(err)?;
    if out.code != 0 {
        return Err(format!(
            "不是 Git 仓库: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    let root = out.stdout_string().trim().to_string();
    let root_path = std::path::PathBuf::from(&root);
    let name = root_path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| root.clone());

    // 已经打开过则直接返回现有会话信息
    {
        let guard = state.repos.lock().map_err(err)?;
        if let Some(existing) = guard.iter().find(|s| s.root == root) {
            let version = existing
                .git
                .run_stdout(&["--version"])
                .unwrap_or_default()
                .trim()
                .to_string();
            return Ok(RepoInfo {
                root: existing.root.clone(),
                name,
                git_version: version,
            });
        }
    }

    let git = Git::new(&root_path);
    let version = git
        .run_stdout(&["--version"])
        .unwrap_or_default()
        .trim()
        .to_string();

    let watcher = start_watcher(app.clone(), root_path.clone()).ok();

    let mut guard = state.repos.lock().map_err(err)?;
    guard.push(RepoSession {
        root: root.clone(),
        git,
        _watcher: watcher,
    });

    Ok(RepoInfo {
        root,
        name,
        git_version: version,
    })
}

/// 关闭仓库（停止其文件监听）
#[tauri::command]
pub async fn close_repository(state: State<'_, AppState>, repo: String) -> CmdResult<()> {
    let mut guard = state.repos.lock().map_err(err)?;
    guard.retain(|s| s.root != repo);
    Ok(())
}

#[tauri::command]
pub async fn get_status(state: State<'_, AppState>, repo: String) -> CmdResult<RepositoryStatus> {
    with_repo(&state, &repo, status::get_status)
}

#[tauri::command]
pub async fn stage(state: State<'_, AppState>, repo: String, paths: Vec<String>) -> CmdResult<()> {
    with_repo(&state, &repo, |git| ops::stage(git, &paths))
}

#[tauri::command]
pub async fn unstage(state: State<'_, AppState>, repo: String, paths: Vec<String>) -> CmdResult<()> {
    with_repo(&state, &repo, |git| ops::unstage(git, &paths))
}

#[tauri::command]
pub async fn discard_changes(
    state: State<'_, AppState>,
    repo: String,
    paths: Vec<String>,
    staged: bool,
) -> CmdResult<()> {
    with_repo(&state, &repo, |git| ops::discard(git, &paths, staged))
}

#[tauri::command]
pub async fn commit(
    state: State<'_, AppState>,
    repo: String,
    message: String,
    amend: bool,
) -> CmdResult<String> {
    with_repo(&state, &repo, |git| ops::commit(git, &message, amend))
}

#[tauri::command]
pub async fn get_diff(
    state: State<'_, AppState>,
    repo: String,
    path: String,
    staged: bool,
    original_path: Option<String>,
) -> CmdResult<DiffContent> {
    with_repo(&state, &repo, |git| {
        diff::get_diff(git, &path, staged, original_path.as_deref())
    })
}

#[tauri::command]
pub async fn list_branches(
    state: State<'_, AppState>,
    repo: String,
) -> CmdResult<Vec<BranchInfo>> {
    with_repo(&state, &repo, refs::list_branches)
}

#[tauri::command]
pub async fn checkout_branch(
    state: State<'_, AppState>,
    repo: String,
    name: String,
    create: bool,
) -> CmdResult<String> {
    with_repo(&state, &repo, |git| ops::checkout_branch(git, &name, create))
}

/// 基于 base 创建新分支（base 为空时基于当前 HEAD）
#[tauri::command]
pub async fn create_branch(
    state: State<'_, AppState>,
    repo: String,
    name: String,
    base: Option<String>,
) -> CmdResult<String> {
    with_repo(&state, &repo, |git| ops::create_branch(git, &name, base.as_deref()))
}

/// 签出已分离（Detached HEAD）
#[tauri::command]
pub async fn checkout_detached(
    state: State<'_, AppState>,
    repo: String,
    reference: String,
) -> CmdResult<String> {
    with_repo(&state, &repo, |git| ops::checkout_detached(git, &reference))
}

#[tauri::command]
pub async fn fetch_all(state: State<'_, AppState>, repo: String) -> CmdResult<String> {
    with_repo(&state, &repo, ops::fetch)
}

#[tauri::command]
pub async fn pull(state: State<'_, AppState>, repo: String) -> CmdResult<String> {
    with_repo(&state, &repo, ops::pull)
}

#[tauri::command]
pub async fn push(state: State<'_, AppState>, repo: String) -> CmdResult<String> {
    with_repo(&state, &repo, ops::push)
}

// ---------------------------------------------------------------------------
// 菜单命令：提交 / 变基 / 拉取推送 / 分支
// ---------------------------------------------------------------------------

/// 提交全部改动（先 git add -A 再 commit），支持 --amend 与 --signoff
#[tauri::command]
pub async fn commit_all(
    state: State<'_, AppState>,
    repo: String,
    message: String,
    amend: bool,
    signed_off: bool,
) -> CmdResult<String> {
    with_repo(&state, &repo, |git| {
        ops::commit_all(git, &message, amend, signed_off)
    })
}

/// 撤销上一次提交（git reset --soft HEAD~1，改动回到暂存区）
#[tauri::command]
pub async fn commit_undo(state: State<'_, AppState>, repo: String) -> CmdResult<String> {
    with_repo(&state, &repo, ops::commit_undo)
}

/// 中止进行中的变基（git rebase --abort）
#[tauri::command]
pub async fn rebase_abort(state: State<'_, AppState>, repo: String) -> CmdResult<String> {
    with_repo(&state, &repo, ops::rebase_abort)
}

/// 以变基方式拉取（git pull --rebase）
#[tauri::command]
pub async fn pull_rebase(state: State<'_, AppState>, repo: String) -> CmdResult<String> {
    with_repo(&state, &repo, ops::pull_rebase)
}

/// 从指定远程的分支拉取（git pull <remote> <branch>）
#[tauri::command]
pub async fn pull_from(
    state: State<'_, AppState>,
    repo: String,
    remote: String,
    branch: String,
) -> CmdResult<String> {
    with_repo(&state, &repo, |git| ops::pull_from(git, &remote, &branch))
}

/// 推送到指定远程分支（git push <remote> HEAD:<branch>）
#[tauri::command]
pub async fn push_to(
    state: State<'_, AppState>,
    repo: String,
    remote: String,
    branch: String,
) -> CmdResult<String> {
    with_repo(&state, &repo, |git| ops::push_to(git, &remote, &branch))
}

/// 抓取并剪除远程已删除的引用（git fetch --prune）
#[tauri::command]
pub async fn fetch_prune(state: State<'_, AppState>, repo: String) -> CmdResult<String> {
    with_repo(&state, &repo, ops::fetch_prune)
}

/// 合并指定分支（git merge <branch>，冲突时返回 git 的 stderr 原文）
#[tauri::command]
pub async fn merge_branch(
    state: State<'_, AppState>,
    repo: String,
    branch: String,
) -> CmdResult<String> {
    with_repo(&state, &repo, |git| ops::merge_branch(git, &branch))
}

/// 变基到指定分支（git rebase <branch>）
#[tauri::command]
pub async fn rebase_branch(
    state: State<'_, AppState>,
    repo: String,
    branch: String,
) -> CmdResult<String> {
    with_repo(&state, &repo, |git| ops::rebase_branch(git, &branch))
}

/// 重命名当前分支（git branch -m <new_name>）
#[tauri::command]
pub async fn rename_branch(
    state: State<'_, AppState>,
    repo: String,
    new_name: String,
) -> CmdResult<String> {
    with_repo(&state, &repo, |git| ops::rename_branch(git, &new_name))
}

/// 删除本地分支（force=false 用 -d，true 用 -D）
#[tauri::command]
pub async fn delete_branch(
    state: State<'_, AppState>,
    repo: String,
    name: String,
    force: bool,
) -> CmdResult<String> {
    with_repo(&state, &repo, |git| ops::delete_branch(git, &name, force))
}

/// 删除远程分支（git push <remote> --delete <branch>）
#[tauri::command]
pub async fn delete_remote_branch(
    state: State<'_, AppState>,
    repo: String,
    remote: String,
    branch: String,
) -> CmdResult<String> {
    with_repo(&state, &repo, |git| {
        ops::delete_remote_branch(git, &remote, &branch)
    })
}

/// 发布分支：推送当前分支并建立跟踪（git push -u <remote> HEAD）
#[tauri::command]
pub async fn publish_branch(
    state: State<'_, AppState>,
    repo: String,
    remote: String,
) -> CmdResult<String> {
    with_repo(&state, &repo, |git| ops::publish_branch(git, &remote))
}

// ---------------------------------------------------------------------------
// 菜单命令：远端管理
// ---------------------------------------------------------------------------

/// 列出已配置的远程名（git remote，逐行）
#[tauri::command]
pub async fn list_remotes(state: State<'_, AppState>, repo: String) -> CmdResult<Vec<String>> {
    with_repo(&state, &repo, remotes::list_remotes)
}

/// 添加远程（git remote add <name> <url>）
#[tauri::command]
pub async fn remote_add(
    state: State<'_, AppState>,
    repo: String,
    name: String,
    url: String,
) -> CmdResult<String> {
    with_repo(&state, &repo, |git| remotes::remote_add(git, &name, &url))
}

/// 删除远程（git remote remove <name>）
#[tauri::command]
pub async fn remote_remove(
    state: State<'_, AppState>,
    repo: String,
    name: String,
) -> CmdResult<String> {
    with_repo(&state, &repo, |git| remotes::remote_remove(git, &name))
}

// ---------------------------------------------------------------------------
// 菜单命令：储藏
// ---------------------------------------------------------------------------

/// 储藏当前改动（git stash push [-u] [--staged]）
#[tauri::command]
pub async fn stash_push(
    state: State<'_, AppState>,
    repo: String,
    include_untracked: bool,
    staged: bool,
) -> CmdResult<String> {
    with_repo(&state, &repo, |git| {
        stash::stash_push(git, include_untracked, staged)
    })
}

/// 列出储藏条目（结构化 JSON：Vec<StashInfo>）
#[tauri::command]
pub async fn stash_list(state: State<'_, AppState>, repo: String) -> CmdResult<Vec<StashInfo>> {
    with_repo(&state, &repo, stash::stash_list)
}

/// 应用储藏（git stash apply <reference>，条目保留）
#[tauri::command]
pub async fn stash_apply(
    state: State<'_, AppState>,
    repo: String,
    reference: String,
) -> CmdResult<String> {
    with_repo(&state, &repo, |git| stash::stash_apply(git, &reference))
}

/// 弹出储藏（git stash pop <reference>，应用后删除条目）
#[tauri::command]
pub async fn stash_pop(
    state: State<'_, AppState>,
    repo: String,
    reference: String,
) -> CmdResult<String> {
    with_repo(&state, &repo, |git| stash::stash_pop(git, &reference))
}

/// 删除单个储藏条目（git stash drop <reference>）
#[tauri::command]
pub async fn stash_drop(
    state: State<'_, AppState>,
    repo: String,
    reference: String,
) -> CmdResult<String> {
    with_repo(&state, &repo, |git| stash::stash_drop(git, &reference))
}

/// 清空所有储藏条目（git stash clear）
#[tauri::command]
pub async fn stash_clear(state: State<'_, AppState>, repo: String) -> CmdResult<String> {
    with_repo(&state, &repo, stash::stash_clear)
}

/// 以 patch 形式查看储藏内容（git stash show -p <reference>）
#[tauri::command]
pub async fn stash_show(
    state: State<'_, AppState>,
    repo: String,
    reference: String,
) -> CmdResult<String> {
    with_repo(&state, &repo, |git| stash::stash_show(git, &reference))
}

// ---------------------------------------------------------------------------
// 菜单命令：标签
// ---------------------------------------------------------------------------

/// 创建轻量标签（git tag <name>）
#[tauri::command]
pub async fn tag_create(
    state: State<'_, AppState>,
    repo: String,
    name: String,
) -> CmdResult<String> {
    with_repo(&state, &repo, |git| tags::tag_create(git, &name))
}

/// 删除本地标签（git tag -d <name>）
#[tauri::command]
pub async fn tag_delete(
    state: State<'_, AppState>,
    repo: String,
    name: String,
) -> CmdResult<String> {
    with_repo(&state, &repo, |git| tags::tag_delete(git, &name))
}

/// 删除远程标签（git push <remote> --delete refs/tags/<name>）
#[tauri::command]
pub async fn tag_delete_remote(
    state: State<'_, AppState>,
    repo: String,
    remote: String,
    name: String,
) -> CmdResult<String> {
    with_repo(&state, &repo, |git| {
        tags::tag_delete_remote(git, &remote, &name)
    })
}

/// 推送所有本地标签（git push <remote> --tags）
#[tauri::command]
pub async fn tag_push(
    state: State<'_, AppState>,
    repo: String,
    remote: String,
) -> CmdResult<String> {
    with_repo(&state, &repo, |git| tags::tag_push(git, &remote))
}

// ---------------------------------------------------------------------------
// 菜单命令：工作树 / 克隆
// ---------------------------------------------------------------------------

/// 创建工作树（git worktree add <path>）
#[tauri::command]
pub async fn worktree_add(
    state: State<'_, AppState>,
    repo: String,
    path: String,
) -> CmdResult<String> {
    with_repo(&state, &repo, |git| worktree::worktree_add(git, &path))
}

/// 克隆远程仓库（git clone <url> <target>，target 为完整本地路径）
#[tauri::command]
pub async fn clone_repository(url: String, target: String) -> CmdResult<String> {
    clone::clone_repository(&url, &target).map_err(err)
}

/// 读取提交历史。refs 为空时只看 HEAD；可传 ["--all"] 或分支/引用名（如 "origin/dev"）
#[tauri::command]
pub async fn get_log(
    state: State<'_, AppState>,
    repo: String,
    limit: Option<u32>,
    skip: Option<u32>,
    refs: Option<Vec<String>>,
) -> CmdResult<Vec<CommitInfo>> {
    with_repo(&state, &repo, |git| {
        log::get_log(git, limit.unwrap_or(100), skip.unwrap_or(0), refs)
    })
}

/// 某个提交中变更的文件列表（供历史视图展开提交）
#[tauri::command]
pub async fn get_commit_files(
    state: State<'_, AppState>,
    repo: String,
    hash: String,
) -> CmdResult<Vec<CommitFile>> {
    with_repo(&state, &repo, |git| log::get_commit_files(git, &hash))
}

/// 某个提交的变更统计（供提交悬浮卡片显示 files / insertions / deletions）
#[tauri::command]
pub async fn get_commit_stats(
    state: State<'_, AppState>,
    repo: String,
    hash: String,
) -> CmdResult<CommitStats> {
    with_repo(&state, &repo, |git| log::get_commit_stats(git, &hash))
}

/// 单个提交的 patch；指定 path 时只看该提交对指定文件的改动
#[tauri::command]
pub async fn get_commit_patch(
    state: State<'_, AppState>,
    repo: String,
    hash: String,
    path: Option<String>,
) -> CmdResult<String> {
    with_repo(&state, &repo, |git| {
        diff::commit_patch(git, &hash, path.as_deref())
    })
}

/// 某提交中某文件的双栏对比内容（父提交版本 vs 该提交版本），供 Monaco diff 编辑器渲染
#[tauri::command]
pub async fn get_commit_file_diff(
    state: State<'_, AppState>,
    repo: String,
    hash: String,
    path: String,
) -> CmdResult<DiffContent> {
    with_repo(&state, &repo, |git| {
        diff::get_commit_file_diff(git, &hash, &path)
    })
}
