use tauri::State;

use crate::git::types::*;
use crate::git::{diff, exec::Git, log, ops, refs, status};
use crate::state::{start_watcher, AppState, RepoSession};

type CmdResult<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn with_session<T>(
    state: &State<'_, AppState>,
    f: impl FnOnce(&Git) -> anyhow::Result<T>,
) -> CmdResult<T> {
    let guard = state.session.lock().map_err(err)?;
    let session = guard
        .as_ref()
        .ok_or_else(|| "No repository is open".to_string())?;
    f(&session.git).map_err(err)
}

/// 打开仓库：path 可以是仓库内的任意目录，向上查找仓库根
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
            "Not a git repository: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    let root = out.stdout_string().trim().to_string();
    let root_path = std::path::PathBuf::from(&root);

    let git = Git::new(&root_path);
    let version = git
        .run_stdout(&["--version"])
        .unwrap_or_default()
        .trim()
        .to_string();

    let watcher = start_watcher(app.clone(), root_path.clone()).ok();

    let name = root_path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| root.clone());

    let mut guard = state.session.lock().map_err(err)?;
    *guard = Some(RepoSession {
        git,
        _watcher: watcher,
    });

    Ok(RepoInfo {
        root,
        name,
        git_version: version,
    })
}

#[tauri::command]
pub async fn get_status(state: State<'_, AppState>) -> CmdResult<RepositoryStatus> {
    with_session(&state, status::get_status)
}

#[tauri::command]
pub async fn stage(state: State<'_, AppState>, paths: Vec<String>) -> CmdResult<()> {
    with_session(&state, |git| ops::stage(git, &paths))
}

#[tauri::command]
pub async fn unstage(state: State<'_, AppState>, paths: Vec<String>) -> CmdResult<()> {
    with_session(&state, |git| ops::unstage(git, &paths))
}

#[tauri::command]
pub async fn discard_changes(
    state: State<'_, AppState>,
    paths: Vec<String>,
    staged: bool,
) -> CmdResult<()> {
    with_session(&state, |git| ops::discard(git, &paths, staged))
}

#[tauri::command]
pub async fn commit(
    state: State<'_, AppState>,
    message: String,
    amend: bool,
) -> CmdResult<String> {
    with_session(&state, |git| ops::commit(git, &message, amend))
}

#[tauri::command]
pub async fn get_diff(
    state: State<'_, AppState>,
    path: String,
    staged: bool,
    original_path: Option<String>,
) -> CmdResult<DiffContent> {
    with_session(&state, |git| {
        diff::get_diff(git, &path, staged, original_path.as_deref())
    })
}

#[tauri::command]
pub async fn list_branches(state: State<'_, AppState>) -> CmdResult<Vec<BranchInfo>> {
    with_session(&state, refs::list_branches)
}

#[tauri::command]
pub async fn checkout_branch(
    state: State<'_, AppState>,
    name: String,
    create: bool,
) -> CmdResult<String> {
    with_session(&state, |git| ops::checkout_branch(git, &name, create))
}

#[tauri::command]
pub async fn fetch_all(state: State<'_, AppState>) -> CmdResult<String> {
    with_session(&state, ops::fetch)
}

#[tauri::command]
pub async fn pull(state: State<'_, AppState>) -> CmdResult<String> {
    with_session(&state, ops::pull)
}

#[tauri::command]
pub async fn push(state: State<'_, AppState>) -> CmdResult<String> {
    with_session(&state, ops::push)
}

#[tauri::command]
pub async fn get_log(
    state: State<'_, AppState>,
    limit: Option<u32>,
    skip: Option<u32>,
) -> CmdResult<Vec<CommitInfo>> {
    with_session(&state, |git| {
        log::get_log(git, limit.unwrap_or(50), skip.unwrap_or(0))
    })
}

#[tauri::command]
pub async fn get_commit_patch(state: State<'_, AppState>, hash: String) -> CmdResult<String> {
    with_session(&state, |git| diff::commit_patch(git, &hash))
}
