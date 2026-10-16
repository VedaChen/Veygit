use std::path::{Path, PathBuf};
use std::sync::mpsc::RecvTimeoutError;
use std::sync::Mutex;
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

use crate::git::exec::Git;

/// 当前打开的仓库会话：git 执行器 + 文件监听器
pub struct RepoSession {
    pub git: Git,
    /// watcher 一旦被 drop 即停止监听，这里仅为持有生命周期
    pub _watcher: Option<RecommendedWatcher>,
}

pub struct AppState {
    pub session: Mutex<Option<RepoSession>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            session: Mutex::new(None),
        }
    }
}

/// 启动文件监听：工作区 / .git 有变化时向前端推送 `repo-changed` 事件。
///
/// 对齐 VS Code 的行为（repository.ts 里 watch 工作区与 .git 目录），
/// 但做了简化：全仓库递归监听 + 忽略 git 内部噪音目录 + 400ms 防抖。
pub fn start_watcher(app: AppHandle, root: PathBuf) -> notify::Result<RecommendedWatcher> {
    let (tx, rx) = std::sync::mpsc::channel::<()>();

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
            let _ = app.emit("repo-changed", ());
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
