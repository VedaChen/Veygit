mod commands;
mod git;
mod state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(state::AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::open_repository,
            commands::close_repository,
            commands::get_status,
            commands::stage,
            commands::unstage,
            commands::discard_changes,
            commands::commit,
            commands::get_diff,
            commands::list_branches,
            commands::checkout_branch,
            commands::create_branch,
            commands::checkout_detached,
            commands::fetch_all,
            commands::pull,
            commands::push,
            commands::commit_all,
            commands::commit_undo,
            commands::rebase_abort,
            commands::pull_rebase,
            commands::pull_from,
            commands::push_to,
            commands::fetch_prune,
            commands::merge_branch,
            commands::rebase_branch,
            commands::rename_branch,
            commands::delete_branch,
            commands::delete_remote_branch,
            commands::publish_branch,
            commands::list_remotes,
            commands::remote_add,
            commands::remote_remove,
            commands::stash_push,
            commands::stash_list,
            commands::stash_apply,
            commands::stash_pop,
            commands::stash_drop,
            commands::stash_clear,
            commands::stash_show,
            commands::tag_create,
            commands::tag_delete,
            commands::tag_delete_remote,
            commands::tag_push,
            commands::worktree_add,
            commands::clone_repository,
            commands::get_log,
            commands::get_commit_files,
            commands::get_commit_patch,
            commands::get_commit_file_diff,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
