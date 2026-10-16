use std::path::PathBuf;
use std::process::{Command, Stdio};

use anyhow::{anyhow, Context, Result};

pub struct GitOutput {
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub code: i32,
}

impl GitOutput {
    pub fn stdout_string(&self) -> String {
        String::from_utf8_lossy(&self.stdout).into_owned()
    }

    pub fn stderr_string(&self) -> String {
        String::from_utf8_lossy(&self.stderr).into_owned()
    }

    /// stdout + stderr 合并后的可读文本（git 的进度信息走 stderr）
    pub fn combined(&self) -> String {
        let mut s = self.stdout_string();
        let err = self.stderr_string();
        if !s.is_empty() && !err.is_empty() {
            s.push('\n');
        }
        s.push_str(&err);
        s.trim().to_string()
    }
}

/// git 命令执行器。
///
/// 调用方式对齐 VS Code 扩展的做法（extensions/git/src/git.ts）：
/// 直接 spawn git 可执行文件、argv 数组传参、不经 shell、
/// 设置 GIT_OPTIONAL_LOCKS=0 等环境变量。
#[derive(Clone, Debug)]
pub struct Git {
    pub root: PathBuf,
}

impl Git {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    fn command(&self) -> Command {
        let mut cmd = Command::new("git");
        cmd.current_dir(&self.root)
            .stdin(Stdio::null())
            .env("GIT_OPTIONAL_LOCKS", "0")
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GIT_PAGER", "cat");
        cmd
    }

    /// 执行 git 命令，不检查退出码
    pub fn run_raw(&self, args: &[&str]) -> Result<GitOutput> {
        let mut cmd = self.command();
        cmd.args(args);
        let out = cmd
            .output()
            .with_context(|| format!("failed to spawn git: {:?}", self.root))?;
        Ok(GitOutput {
            stdout: out.stdout,
            stderr: out.stderr,
            code: out.status.code().unwrap_or(-1),
        })
    }

    /// 执行 git 命令，非零退出码视为错误
    pub fn run_ok(&self, args: &[&str]) -> Result<GitOutput> {
        let out = self.run_raw(args)?;
        if out.code != 0 {
            return Err(anyhow!("git {} failed:\n{}", args.join(" "), out.combined()));
        }
        Ok(out)
    }

    /// 执行并返回 stdout 文本（用于短输出）
    pub fn run_stdout(&self, args: &[&str]) -> Result<String> {
        Ok(self.run_ok(args)?.stdout_string())
    }

    /// 执行 git 命令并返回 stdout + stderr 合并文本（菜单类命令的通用封装）。
    /// 非零退出码时把 stderr 原文（trim 后）作为错误返回，便于前端直接展示 git 的提示；
    /// stderr 为空时回退到 stdout / 退出码说明。
    pub fn run_msg(&self, args: &[&str]) -> Result<String> {
        let out = self.run_raw(args)?;
        if out.code == 0 {
            return Ok(out.combined());
        }
        let stderr = out.stderr_string();
        let stderr = stderr.trim();
        if !stderr.is_empty() {
            return Err(anyhow!(stderr.to_string()));
        }
        let combined = out.combined();
        if combined.is_empty() {
            return Err(anyhow!("git {} 失败（退出码 {}）", args.join(" "), out.code));
        }
        Err(anyhow!(combined))
    }
}
