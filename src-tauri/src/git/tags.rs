use anyhow::Result;

use super::exec::Git;

/// 创建轻量标签（指向当前 HEAD）：git tag <name>
pub fn tag_create(git: &Git, name: &str) -> Result<String> {
    git.run_msg(&["tag", name])
}

/// 删除本地标签：git tag -d <name>
pub fn tag_delete(git: &Git, name: &str) -> Result<String> {
    git.run_msg(&["tag", "-d", name])
}

/// 删除远程标签：git push <remote> --delete refs/tags/<name>
/// 用 refs/tags/ 全名精确指向标签，避免误删同名的远程分支。
pub fn tag_delete_remote(git: &Git, remote: &str, name: &str) -> Result<String> {
    let ref_name = if name.starts_with("refs/tags/") {
        name.to_string()
    } else {
        format!("refs/tags/{}", name)
    };
    git.run_msg(&["push", remote, "--delete", &ref_name])
}

/// 推送所有本地标签到远程：git push <remote> --tags
pub fn tag_push(git: &Git, remote: &str) -> Result<String> {
    git.run_msg(&["push", remote, "--tags"])
}
