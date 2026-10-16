# vscode-git-panel

把 VS Code 的 Git / 源代码管理面板"提取"出来做成的**独立桌面 Git 客户端**。

技术栈：**Tauri 2 + React + Rust**。核心的 git 行为逻辑（命令参数、porcelain 输出解析、四组变更的划分）对照
[VS Code 源码仓库](https://github.com/microsoft/vscode) 的 `extensions/git` 实现重写，
UI 视觉复刻 VS Code 的 SCM 面板（Dark+ 配色 + codicons 图标）。

## 架构

```
WebView (React + Monaco)
    │  invoke: get_status / stage / commit / get_diff ...
    ▲  event: repo-changed（文件监听推送）
Rust Core
 ├─ git/exec.rs      spawn git CLI（argv 数组、不经 shell；GIT_OPTIONAL_LOCKS=0 等）
 ├─ git/status.rs    porcelain v2 解析 → 四组变更（merge/index/workingTree/untracked）
 ├─ git/ops.rs       stage / unstage / discard / commit / checkout / fetch / pull / push
 ├─ git/refs.rs      分支列表（for-each-ref）
 ├─ git/log.rs       提交历史（log -z + %x1f 字段分隔）
 ├─ git/diff.rs      diff 两侧内容 + 提交 patch（供 Monaco 渲染）
 └─ state.rs         notify 文件监听 + 400ms 防抖 → 推送 repo-changed
```

### 与 VS Code 源码的对应关系

| VS Code | 本项目 | 说明 |
|---|---|---|
| `extensions/git/src/git.ts` | `src-tauri/src/git/*.rs` | CLI 调用方式与 porcelain 解析逻辑对照重写（Rust 无 Node 运行时） |
| `extensions/git/src/repository.ts` | `git/status.rs` + `src/store.ts` | Resource / ResourceGroup 模型 → 四组 `FileChange` + 前端 store |
| `extensions/git/src/commands.ts` | `git/ops.rs` + `src/store.ts` actions | 交互重写，业务逻辑借鉴 |
| `src/vs/workbench/contrib/scm/browser/scmViewPane.ts` | `src/components/ChangesList.tsx` 等 | 面板 UI 视觉复刻（codicons + Dark+ token 配色） |
| Monaco diff 编辑器 | `src/components/DiffViewer.tsx` | 本地打包（monaco-editor 0.57，无 CDN） |

> 说明：VS Code 的面板渲染深度耦合 Workbench（DI、上下文键、菜单、列表控件等），
> 无法整体搬运，所以 UI 层为重建，而 git 行为层严格对照官方实现。

## 功能

- 打开任意目录（自动向上寻找仓库根），文件监听自动刷新
- 变更面板四组：Merge Changes / Staged Changes / Changes / Untracked Changes
- 文件级操作：暂存 / 取消暂存 / 丢弃（带确认）；分组级批量操作
- 提交框（Ctrl+Enter 提交、Amend 支持）
- Monaco diff 预览：工作区 ↔ index、index ↔ HEAD；二进制 / 超大文件保护
- 分支栏：当前分支、ahead/behind、切换 / 创建 / 远程分支 checkout
- 同步：fetch / pull / push（无 upstream 时自动 `-u origin <branch>`）
- 提交历史（100 条）与单提交 patch 查看

## 开发

前置：Rust（MSRV ≥ 1.90）、Node 20+、git、Windows WebView2。

```bash
npm install
npm run tauri dev     # 开发模式（热重载前端 + Rust 自动重编译）
npm run tauri build   # 打包（--no-bundle 可只产出 exe）
```

常用校验：

```bash
cd src-tauri && cargo check   # Rust 侧
npm run build                 # 前端 tsc + vite build
```

## 已知限制

- fetch / pull / push 的凭据交互依赖系统 git 凭据管理器（GIT_TERMINAL_PROMPT=0，终端式提问会被拒绝并以错误信息呈现）
- 冲突文件暂不支持 "Open Merge Editor" 与 ours/theirs 放弃策略
- 历史视图不画 commit graph、不支持分页加载更多
- 仓库只支持单个同时打开（与 VS Code 的多仓库模型不同）

## 目录结构

```
vscode-git-panel/
├── index.html
├── package.json
├── src/                      # 前端（React + zustand + Monaco）
│   ├── api.ts                # Tauri invoke 封装
│   ├── store.ts              # 应用状态与全部操作逻辑
│   ├── monaco-setup.ts       # Monaco 主题 / 语言映射
│   ├── types.ts              # 与 Rust serde 对齐的类型
│   ├── styles.css / theme.css
│   └── components/           # Toolbar / BranchMenu / CommitBox / ChangesList ...
└── src-tauri/                # Rust 后端
    ├── src/
    │   ├── commands.rs       # #[tauri::command] 全集
    │   ├── state.rs          # AppState + notify 监听
    │   └── git/              # 对照 VS Code 的 git 行为层
    └── tauri.conf.json
```

## License

MIT（核心解析逻辑参照 VS Code，其 git 扩展同为 MIT 许可）。
