use anyhow::{anyhow, Result};

use super::exec::Git;
use super::ops::has_head;
use super::types::DiffContent;

const MAX_SIZE: u64 = 4 * 1024 * 1024;

enum Loaded {
    Content(Vec<u8>),
    Missing,
    TooLarge,
}

impl Loaded {
    fn into_bytes(self) -> Vec<u8> {
        match self {
            Loaded::Content(data) => data,
            _ => Vec::new(),
        }
    }
}

/// 提取文件 diff 的两侧内容，交给前端 Monaco 渲染。
///
/// staged=true  ：HEAD 版本 vs index 版本
/// staged=false ：index 版本 vs 工作区文件
pub fn get_diff(
    git: &Git,
    path: &str,
    staged: bool,
    original_path: Option<&str>,
) -> Result<DiffContent> {
    let (original, modified) = if staged {
        let orig = if has_head(git) {
            let spec = format!("HEAD:{}", original_path.unwrap_or(path));
            load_blob(git, &spec)?
        } else {
            Loaded::Missing
        };
        let modified = load_blob(git, &format!(":{}", path))?;
        (orig, modified)
    } else {
        let original = load_blob(git, &format!(":{}", path))?;
        let modified = load_worktree(git, path);
        (original, modified)
    };

    if matches!(original, Loaded::TooLarge) || matches!(modified, Loaded::TooLarge) {
        return Ok(DiffContent {
            kind: "tooLarge".to_string(),
            original: String::new(),
            modified: String::new(),
        });
    }

    let original = original.into_bytes();
    let modified = modified.into_bytes();

    if is_binary(&original) || is_binary(&modified) {
        return Ok(DiffContent {
            kind: "binary".to_string(),
            original: String::new(),
            modified: String::new(),
        });
    }

    Ok(DiffContent {
        kind: "text".to_string(),
        original: String::from_utf8_lossy(&original).into_owned(),
        modified: String::from_utf8_lossy(&modified).into_owned(),
    })
}

/// 单个提交的 patch（含 commit 头部信息），供历史视图展示。
/// 指定 path 时通过 `-- <path>` 只输出该提交对指定文件的补丁。
pub fn commit_patch(git: &Git, hash: &str, path: Option<&str>) -> Result<String> {
    let mut args: Vec<&str> = vec!["show", "--no-color", "--patch", hash];
    if let Some(path) = path {
        args.push("--");
        args.push(path);
    }
    let out = git.run_raw(&args)?;
    if out.code != 0 {
        return Err(anyhow!(out.combined()));
    }
    let mut text = out.stdout_string();
    if text.len() > MAX_SIZE as usize {
        text.truncate(MAX_SIZE as usize);
        text.push_str("\n\n... (patch truncated)");
    }
    Ok(text)
}

fn load_blob(git: &Git, spec: &str) -> Result<Loaded> {
    // 先查对象大小，避免把巨型 blob 读进内存
    let size_out = git.run_raw(&["cat-file", "-s", spec])?;
    if size_out.code != 0 {
        return Ok(Loaded::Missing);
    }
    let size: u64 = size_out.stdout_string().trim().parse().unwrap_or(0);
    if size > MAX_SIZE {
        return Ok(Loaded::TooLarge);
    }

    let out = git.run_raw(&["cat-file", "blob", spec])?;
    if out.code == 0 {
        Ok(Loaded::Content(out.stdout))
    } else {
        Ok(Loaded::Missing)
    }
}

fn load_worktree(git: &Git, path: &str) -> Loaded {
    let abs = git.root.join(path);
    if let Ok(meta) = std::fs::metadata(&abs) {
        if meta.len() > MAX_SIZE {
            return Loaded::TooLarge;
        }
    }
    match std::fs::read(&abs) {
        Ok(data) => Loaded::Content(data),
        // 文件不存在（被删除）以空内容呈现
        Err(_) => Loaded::Missing,
    }
}

fn is_binary(data: &[u8]) -> bool {
    data.iter().take(8000).any(|&b| b == 0)
}
