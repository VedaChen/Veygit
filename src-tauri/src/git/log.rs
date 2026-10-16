use anyhow::Result;

use super::exec::Git;
use super::types::CommitInfo;

/// 读取提交历史。
/// 字段分隔用 0x1f（unit separator），条目分隔用 -z 的 \0。
/// `%D` 形如 "HEAD -> main, origin/main, tag: v1.0"。
pub fn get_log(git: &Git, limit: u32, skip: u32) -> Result<Vec<CommitInfo>> {
    let format = "%H\u{1f}%h\u{1f}%an\u{1f}%ae\u{1f}%at\u{1f}%s\u{1f}%D\u{1f}%P";
    let max_count = format!("--max-count={}", limit);
    let skip_arg = format!("--skip={}", skip);
    let format_arg = format!("--format={}", format);

    let out = git.run_raw(&[
        "log",
        "-z",
        "--no-color",
        &max_count,
        &skip_arg,
        &format_arg,
    ])?;

    // 空仓库（还没有任何提交）时 git log 失败，返回空列表
    if out.code != 0 {
        return Ok(Vec::new());
    }

    let text = out.stdout_string();
    let mut commits: Vec<CommitInfo> = Vec::new();

    for record in text.split('\u{0}') {
        if record.is_empty() {
            continue;
        }
        let fields: Vec<&str> = record.split('\u{1f}').collect();
        if fields.len() < 8 {
            continue;
        }

        let refs: Vec<String> = fields[6]
            .split(", ")
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        let parents: Vec<String> = fields[7]
            .split_whitespace()
            .map(|s| s.to_string())
            .collect();

        commits.push(CommitInfo {
            hash: fields[0].to_string(),
            short_hash: fields[1].to_string(),
            author: fields[2].to_string(),
            email: fields[3].to_string(),
            timestamp: fields[4].parse().unwrap_or(0),
            subject: fields[5].to_string(),
            refs,
            parents,
        });
    }

    Ok(commits)
}
