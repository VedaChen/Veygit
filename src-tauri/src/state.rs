use std::path::{Path, PathBuf};
use std::sync::mpsc::RecvTimeoutError;
use std::sync::Mutex;
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

use crate::git::exec::Git;

/// 单个已打开仓库的会话：git 执行器 + 文件监听器
pub struct RepoSession {
    /// 仓库根（正斜杠形式，与 `git rev-parse --show-toplevel` 输出一致）
    pub root: String,
    pub git: Git,
    /// watcher 一旦被 drop 即停止监听，这里仅为持有生命周期
    pub _watcher: Option<RecommendedWatcher>,
}

/// 可以同时打开多个仓库（对照 VS Code 的 repositories 列表）
pub struct AppState {
    pub repos: Mutex<Vec<RepoSession>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            repos: Mutex::new(Vec::new()),
        }
    }
}

/// 启动文件监听：工作区 / .git 有变化时向前端推送 `repo-changed` 事件（payload = 仓库根路径）。
///
/// 每个仓库一个 watcher；收到事件后做 400ms 防抖再通知前端。
pub fn start_watcher(app: AppHandle, root: PathBuf) -> notify::Result<RecommendedWatcher> {
    let (tx, rx) = std::sync::mpsc::channel::<()>();
    let root_label = root.to_string_lossy().replace('\\', "/");

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            let relevant = event.paths.iter().any(|p| !should_ignore(p));
            if relevant {
                let _ = tx.send(());
            }
        }
    })?;

    watcher.watch(&root, RecursiveMode::Recursive)?;

    std::thread::spawn(move || {
        loop {
            // 阻塞等待第一个事件
            if rx.recv().is_err() {
                return;
            }
            // 防抖：静默 400ms 之后再通知前端
            loop {
                match rx.recv_timeout(Duration::from_millis(400)) {
                    Ok(_) => continue,
                    Err(RecvTimeoutError::Timeout) => break,
                    Err(RecvTimeoutError::Disconnected) => return,
                }
            }
            let _ = app.emit("repo-changed", root_label.clone());
        }
    });

    Ok(watcher)
}

fn should_ignore(path: &Path) -> bool {
    let s = path.to_string_lossy().replace('\\', "/");
    s.contains("/.git/objects/")
        || s.contains("/.git/logs/")
        || s.contains("/.git/lfs/")
        || s.ends_with("/.git/index.lock")
}
