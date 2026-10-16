use anyhow::{anyhow, Result};

use super::exec::Git;
use super::types::{CommitFile, CommitInfo, CommitStats};

/// 读取提交历史。
/// 字段分隔用 0x1f（unit separator），条目分隔用 -z 的 \0。
/// `%D` 形如 "HEAD -> main, origin/main, tag: v1.0"。
/// `refs`：None/空 → 只看 HEAD；含 "--all" → 全部引用；其余每个元素作为 <commit> 参数。
pub fn get_log(
    git: &Git,
    limit: u32,
    skip: u32,
    refs: Option<Vec<String>>,
) -> Result<Vec<CommitInfo>> {
    let format = "%H\u{1f}%h\u{1f}%an\u{1f}%ae\u{1f}%at\u{1f}%s\u{1f}%D\u{1f}%P";
    let max_count = format!("--max-count={}", limit);
    let skip_arg = format!("--skip={}", skip);
    let format_arg = format!("--format={}", format);

    // 规范化引用参数：去空白后，空 → HEAD；"--all" 由 git log 识别为选项，其余按 <commit> 处理
    let ref_args: Vec<&str> = refs
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .map(|r| r.trim())
        .filter(|r| !r.is_empty())
        .collect();

    let mut args: Vec<&str> = vec!["log", "-z", "--no-color", &max_count, &skip_arg, &format_arg];
    if ref_args.is_empty() {
        args.push("HEAD");
    } else {
        args.extend(ref_args);
    }

    let out = git.run_raw(&args)?;

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

/// 读取某个提交中变更的文件列表（供历史视图展开提交）。
/// 每行形如 "M\tpath"；--no-renames 避免 rename 输出 R100 双路径。
pub fn get_commit_files(git: &Git, hash: &str) -> Result<Vec<CommitFile>> {
    let out = git.run_raw(&[
        "-c",
        "core.quotepath=false",
        "show",
        "--format=",
        "--name-status",
        "--no-renames",
        hash,
    ])?;
    if out.code != 0 {
        return Err(anyhow!(out.combined()));
    }

    let mut files: Vec<CommitFile> = Vec::new();
    for line in out.stdout_string().lines() {
        // 跳过 --format= 产生的空行
        let line = line.trim_end();
        if line.is_empty() {
            continue;
        }
        let mut fields = line.splitn(2, '\t');
        let status = fields.next().unwrap_or("").trim();
        let path = fields.next().unwrap_or("").trim();
        if status.is_empty() || path.is_empty() {
            continue;
        }
        files.push(CommitFile {
            path: path.to_string(),
            // 单字母状态：M/A/D/R/C…（rename 分数等只取首字符）
            status: status.chars().next().map(|c| c.to_string()).unwrap_or_default(),
        });
    }

    Ok(files)
}

/// 从 shortstat 行的某个逗号分段（如 "1172 insertions(+)"）提取开头数字；
/// 找不到该分段或解析失败时按 0 处理（兼容 "1,172" 千分位写法）。
fn shortstat_number(line: &str, keyword: &str) -> u32 {
    for part in line.split(',') {
        let part = part.trim();
        if !part.contains(keyword) {
            continue;
        }
        let digits: String = part
            .chars()
            .take_while(|c| c.is_ascii_digit() || *c == ',')
            .filter(|c| *c != ',')
            .collect();
        return digits.parse().unwrap_or(0);
    }
    0
}

/// 读取某个提交的变更统计（对照 VS Code 悬浮卡片的 N files changed / +X / -Y）。
/// git show --shortstat 输出形如 " 35 files changed, 1172 insertions(+), 149 deletions(-)"，
/// 三项可能只有部分出现（如 "1 file changed, 1 deletion(-)"）；merge / 空提交无输出 → 三项均 0。
pub fn get_commit_stats(git: &Git, hash: &str) -> Result<CommitStats> {
    let out = git.run_raw(&["show", "--shortstat", "--format=", hash])?;
    if out.code != 0 {
        return Err(anyhow!(out.combined()));
    }

    let mut stats = CommitStats {
        files: 0,
        insertions: 0,
        deletions: 0,
    };
    for line in out.stdout_string().lines() {
        let line = line.trim();
        if line.is_empty() || !line.contains("changed") {
            continue;
        }
        stats.files = shortstat_number(line, "file");
        stats.insertions = shortstat_number(line, "insertion");
        stats.deletions = shortstat_number(line, "deletion");
    }

    Ok(stats)
}
