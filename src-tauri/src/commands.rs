use tauri::State;

use crate::git::types::*;
use crate::git::{diff, exec::Git, log, ops, refs, status};
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

#[tauri::command]
pub async fn get_log(
    state: State<'_, AppState>,
    repo: String,
    limit: Option<u32>,
    skip: Option<u32>,
) -> CmdResult<Vec<CommitInfo>> {
    with_repo(&state, &repo, |git| {
        log::get_log(git, limit.unwrap_or(100), skip.unwrap_or(0))
    })
}

#[tauri::command]
pub async fn get_commit_patch(
    state: State<'_, AppState>,
    repo: String,
    hash: String,
) -> CmdResult<String> {
    with_repo(&state, &repo, |git| diff::commit_patch(git, &hash))
}
