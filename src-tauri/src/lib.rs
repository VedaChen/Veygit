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
            commands::get_log,
            commands::get_commit_patch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
