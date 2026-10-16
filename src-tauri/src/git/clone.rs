use anyhow::{Context, Result};

use super::exec::Git;

/// 克隆远程仓库到本地：git clone <url> <target>（target 为完整本地路径）。
///
/// 该命令不依附任何已打开仓库，在进程当前工作目录下执行；
/// 相对 target 也会随之解析为相对当前工作目录。
pub fn clone_repository(url: &str, target: &str) -> Result<String> {
    let cwd = std::env::current_dir().context("无法获取当前工作目录")?;
    let git = Git::new(cwd);
    git.run_msg(&["clone", url, target])
}
