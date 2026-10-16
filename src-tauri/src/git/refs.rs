use anyhow::Result;

use super::exec::Git;
use super::types::BranchInfo;

/// 列出本地与远程分支（含尖端提交摘要与 upstream 领先/落后）。
/// 对应 VS Code git.ts 的 getRefs()，这里简化为一次 for-each-ref。
pub fn list_branches(git: &Git) -> Result<Vec<BranchInfo>> {
    let out = git.run_stdout(&[
        "for-each-ref",
        "--format=%(refname)%1f%(objectname)%1f%(HEAD)%1f%(subject)%1f%(authorname)%1f%(committerdate:unix)%1f%(upstream:track)",
        "refs/heads/",
        "refs/remotes/",
    ])?;

    let mut result: Vec<BranchInfo> = Vec::new();
    for line in out.lines() {
        let mut fields = line.split('\u{1f}');
        let full = fields.next().unwrap_or("");
        if full.is_empty() {
            continue;
        }
        // 跳过 origin/HEAD 这类符号引用
        if full.starts_with("refs/remotes/") && full.ends_with("/HEAD") {
            continue;
        }

        let objectname = fields.next().unwrap_or("").to_string();
        let head_mark = fields.next().unwrap_or("");
        let subject = fields.next().unwrap_or("").to_string();
        let author = fields.next().unwrap_or("").to_string();
        let timestamp = fields.next().unwrap_or("0").trim().parse::<i64>().unwrap_or(0);
        let track = fields.next().unwrap_or("");

        let is_remote = full.starts_with("refs/remotes/");
        let name = full
            .strip_prefix("refs/heads/")
            .or_else(|| full.strip_prefix("refs/remotes/"))
            .unwrap_or(full)
            .to_string();

        let (ahead, behind, has_upstream) = parse_track(track);

        result.push(BranchInfo {
            name,
            is_remote,
            is_head: head_mark.trim() == "*",
            commit: objectname,
            subject,
            author,
            timestamp,
            ahead,
            behind,
            has_upstream,
        });
    }

    // 本地分支在前，其余按名字排序
    result.sort_by(|a, b| (a.is_remote, &a.name).cmp(&(b.is_remote, &b.name)));
    Ok(result)
}

/// 解析 %(upstream:track)：
/// ""（无 upstream）/"[ahead 1]"/"[behind 2]"/"[ahead 1, behind 2]"/"[gone]"
fn parse_track(track: &str) -> (u32, u32, bool) {
    let t = track.trim();
    if t.is_empty() {
        return (0, 0, false);
    }
    let inner = t.trim_start_matches('[').trim_end_matches(']');
    if inner == "gone" {
        return (0, 0, false);
    }
    let mut ahead = 0u32;
    let mut behind = 0u32;
    for part in inner.split(',') {
        let part = part.trim();
        if let Some(v) = part.strip_prefix("ahead ") {
            ahead = v.trim().parse().unwrap_or(0);
        } else if let Some(v) = part.strip_prefix("behind ") {
            behind = v.trim().parse().unwrap_or(0);
        }
    }
    (ahead, behind, true)
}
