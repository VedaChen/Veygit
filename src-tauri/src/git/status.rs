use anyhow::Result;

use super::exec::Git;
use super::types::{FileChange, RepositoryStatus};

/// 读取仓库状态。
///
/// 对照 VS Code extensions/git/src/git.ts 的 getStatus()：
/// `git status -z --porcelain=v2 --branch --untracked-files=all`
/// 解析 porcelain v2 格式，产出四组变更：
/// merge（冲突）/ index（已暂存）/ workingTree（未暂存）/ untracked。
pub fn get_status(git: &Git) -> Result<RepositoryStatus> {
    let out = git.run_raw(&[
        "-c",
        "core.quotepath=false",
        "status",
        "-z",
        "--porcelain=v2",
        "--branch",
        "--untracked-files=all",
        "--ignore-submodules=none",
    ])?;

    if out.code != 0 {
        anyhow::bail!("git status failed:\n{}", out.combined());
    }

    let root = git.root.to_string_lossy().replace('\\', "/");
    parse(&out.stdout, &root)
}

fn find_byte(data: &[u8], from: usize, needle: u8) -> usize {
    data[from..]
        .iter()
        .position(|&c| c == needle)
        .map(|p| from + p)
        .unwrap_or(data.len())
}

fn parse(data: &[u8], root: &str) -> Result<RepositoryStatus> {
    let mut head: Option<String> = None;
    let mut branch: Option<String> = None;
    let mut upstream: Option<String> = None;
    let mut ahead: u32 = 0;
    let mut behind: u32 = 0;

    let mut merge_changes: Vec<FileChange> = Vec::new();
    let mut index_changes: Vec<FileChange> = Vec::new();
    let mut working_tree_changes: Vec<FileChange> = Vec::new();
    let mut untracked_changes: Vec<FileChange> = Vec::new();

    let mut i = 0usize;
    while i < data.len() {
        match data[i] {
            b'#' => {
                // header 行以 \n 结束
                let end = find_byte(data, i, b'\n');
                let line = String::from_utf8_lossy(&data[i..end]).into_owned();
                i = end + 1;

                if let Some(rest) = line.strip_prefix("# branch.oid ") {
                    let oid = rest.trim();
                    let is_zero = !oid.is_empty() && oid.chars().all(|c| c == '0');
                    if !oid.is_empty() && oid != "(initial)" && !is_zero {
                        head = Some(oid.to_string());
                    }
                } else if let Some(rest) = line.strip_prefix("# branch.head ") {
                    let name = rest.trim();
                    if !name.is_empty() && name != "(detached)" && name != "(unknown)" {
                        branch = Some(name.to_string());
                    }
                } else if let Some(rest) = line.strip_prefix("# branch.upstream ") {
                    let name = rest.trim();
                    if !name.is_empty() {
                        upstream = Some(name.to_string());
                    }
                } else if let Some(rest) = line.strip_prefix("# branch.ab ") {
                    for token in rest.split_whitespace() {
                        if let Some(v) = token.strip_prefix('+') {
                            ahead = v.parse().unwrap_or(0);
                        } else if let Some(v) = token.strip_prefix('-') {
                            behind = v.parse().unwrap_or(0);
                        }
                    }
                }
            }
            b'1' => {
                // 普通变更 entry，以 \0 结束
                let end = find_byte(data, i, 0);
                let line = String::from_utf8_lossy(&data[i..end]).into_owned();
                i = end + 1;
                parse_ordinary(&line, &mut index_changes, &mut working_tree_changes);
            }
            b'2' => {
                // rename / copy entry：<...> <path> NUL <origPath> NUL
                let end = find_byte(data, i, 0);
                let line = String::from_utf8_lossy(&data[i..end]).into_owned();
                let end2 = find_byte(data, end + 1, 0);
                let orig = String::from_utf8_lossy(&data[end + 1..end2]).into_owned();
                i = end2 + 1;
                parse_rename(&line, &orig, &mut index_changes, &mut working_tree_changes);
            }
            b'u' => {
                // 冲突 entry
                let end = find_byte(data, i, 0);
                let line = String::from_utf8_lossy(&data[i..end]).into_owned();
                i = end + 1;
                if let Some(path) = field_at(&line, 10) {
                    merge_changes.push(FileChange {
                        path,
                        status: "U".to_string(),
                        original_path: None,
                        staged: false,
                    });
                }
            }
            b'?' => {
                // untracked entry：`? <path>`
                let end = find_byte(data, i, 0);
                let path = String::from_utf8_lossy(&data[i + 2..end]).into_owned();
                i = end + 1;
                untracked_changes.push(FileChange {
                    path,
                    status: "?".to_string(),
                    original_path: None,
                    staged: false,
                });
            }
            b'!' => {
                // ignored entry：跳过
                let end = find_byte(data, i, 0);
                i = end + 1;
            }
            _ => break,
        }
    }

    Ok(RepositoryStatus {
        root: root.to_string(),
        head,
        branch,
        upstream,
        ahead,
        behind,
        merge_changes,
        index_changes,
        working_tree_changes,
        untracked_changes,
    })
}

fn parse_ordinary(
    line: &str,
    index_changes: &mut Vec<FileChange>,
    working_tree_changes: &mut Vec<FileChange>,
) {
    // 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
    let fields: Vec<&str> = line.splitn(9, ' ').collect();
    if fields.len() < 9 {
        return;
    }
    let xy = fields[1];
    let path = fields[8].to_string();
    push_xy(xy, &path, None, index_changes, working_tree_changes);
}

fn parse_rename(
    line: &str,
    orig: &str,
    index_changes: &mut Vec<FileChange>,
    working_tree_changes: &mut Vec<FileChange>,
) {
    // 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>
    let fields: Vec<&str> = line.splitn(10, ' ').collect();
    if fields.len() < 10 {
        return;
    }
    let xy = fields[1];
    let path = fields[9].to_string();
    let orig_path = if orig.is_empty() {
        None
    } else {
        Some(orig.to_string())
    };
    push_xy(xy, &path, orig_path, index_changes, working_tree_changes);
}

fn push_xy(
    xy: &str,
    path: &str,
    original_path: Option<String>,
    index_changes: &mut Vec<FileChange>,
    working_tree_changes: &mut Vec<FileChange>,
) {
    let mut chars = xy.chars();
    let x = chars.next().unwrap_or('.');
    let y = chars.next().unwrap_or('.');

    // X：index 相对 HEAD 的变化 → 已暂存
    if x != '.' {
        index_changes.push(FileChange {
            path: path.to_string(),
            status: x.to_uppercase().to_string(),
            original_path: original_path.clone(),
            staged: true,
        });
    }
    // Y：工作区相对 index 的变化 → 未暂存
    if y != '.' {
        working_tree_changes.push(FileChange {
            path: path.to_string(),
            status: y.to_uppercase().to_string(),
            original_path,
            staged: false,
        });
    }
}

fn field_at(line: &str, index: usize) -> Option<String> {
    line.splitn(index + 1, ' ')
        .nth(index)
        .map(|s| s.to_string())
}
