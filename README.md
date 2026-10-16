<div align="center">
  <img src="public/logo.png" width="96" alt="Veygit" />
  <h1>Veygit</h1>
  <p>把 VS Code 的源代码管理（SCM）面板"提取"出来做成的独立 Git 桌面客户端</p>
  <p>
    <img src="https://github.com/VedaChen/Veygit/actions/workflows/build.yml/badge.svg" alt="Build" />
  </p>
</div>

---

**Veygit** 用 **Tauri 2 + Rust + React** 复刻 VS Code 的源代码管理面板体验：多仓库、变更四组、级联菜单、提交图表、Monaco 双栏 diff、外观模式……核心 git 行为（命令参数、porcelain 输出解析、菜单结构）对照
[VS Code 源码仓库](https://github.com/microsoft/vscode) 的 `extensions/git` 实现重写，UI 视觉对齐 VS Code（codicons + 深浅双主题）。

## ✨ 功能

**源代码管理**
- **多仓库**：同时打开任意数量的仓库，点击切换；列表持久化，重启自动恢复
- **更改区**：合并更改 / 暂存的更改 / 已跟踪的更改 / 未跟踪的更改，目录树与列表双模式（可切换），排序（路径/名称/状态）
- 文件行操作：打开文件（diff）、放弃更改、暂存/取消暂存；悬浮气泡提示
- 文件行右键：**复制相对路径 / 复制绝对路径**
- 提交框：单行自适应输入（Ctrl+Enter 提交）、split 按钮下拉（提交(修改)）
- 分支快速选择器：搜索、创建新分支（基于当前）、从现有来源创建、签出已分离、本地/远程分支列表
- 存储库行：分支徽章、**同步按钮（⟳ + ↑待推送 / ↓待拉取计数）**、更多操作

**⋯ 菜单（全部可用）**
- 拉取 / 推送 / 克隆 / 签出到… / 抓取（含剪除、所有远程）
- 提交全系：全部提交、撤销上次提交、提交(修改/署名)变体、中止变基
- 更改全量：暂存 / 取消暂存 / 放弃所有
- 拉取，推送：同步 / 拉取(变基) / 拉取自… / 推送到… / 抓取(剪除)
- 分支：合并 / 变基 / 创建 / 重命名 / 删除（未合并二次确认）/ 删除远程 / 发布
- 远程管理、储藏全套（含查看条目）、标记全套、创建工作树
- **显示 GIT 输出**：底部输出面板记录每次命令与结果

**图表（SCM Graph）**
- 提交历史带车道线（merge 空心节点、汇合曲线），列表/树双模式
- 存储库选择 + 历史记录项引用多选过滤（全部 / 自动 / 本地分支 / 远程分支）
- 点击提交展开变更文件列表 → 点文件看**双栏 diff**（父版本 ↔ 该提交版本）
- **悬浮卡片**：作者 / 绝对·相对时间 / 完整描述 / 文件数与增删行统计 / refs 徽章 / 复制哈希
- 转到当前提交、从所有远程抓取、拉取、推送、刷新

**diff 与外观**
- Monaco 双栏 diff（未提交：索引 ↔ 工作区；提交：父版本 ↔ 提交版本），标签栏可关闭
- **外观模式**：自动（跟随系统）/ 浅色 / 暗色（对照 VS Code Light+/Dark+，Monaco 主题联动），持久化、启动防闪屏
- 侧栏宽度可拖拽（sash），窗口无边框 + 自绘标题栏（拖动 / 双击最大化 / －□×）

## 🧱 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Tauri 2（Windows / macOS / Linux） |
| 后端 | Rust（直调 git CLI，无 Node 运行时；notify 文件监听 + 防抖） |
| 前端 | React 19 + TypeScript + zustand + Vite |
| 编辑器 | Monaco Editor（本地打包，无 CDN） |

## 🚀 开发

前置：Rust（stable）、Node 20+、git；Windows 需 WebView2（Win10/11 自带）。

```bash
npm install
npm run tauri dev     # 开发模式（前端热重载 + Rust 自动重编译）
npm run tauri build   # 本机打包（src-tauri/target/release/bundle/）
```

常用校验：

```bash
cd src-tauri && cargo check   # Rust 侧
npm run build                 # 前端 tsc + vite
```

## 📦 CI / 发布构建

推送到 `master` 或手动触发 `Build` workflow，自动在三个平台构建并上传产物（Actions → 对应 run → Artifacts）：

| 平台 | Runner | 产物 |
|---|---|---|
| Windows x64 | `windows-latest` | `.msi` / `.exe`（NSIS） |
| macOS arm64 | `macos-latest` | `.dmg` / `.app` |
| Linux x64 | `ubuntu-22.04` | `.deb` / `.rpm` / `.AppImage` |

## 🗂 架构

```
WebView (React + Monaco)
    │  invoke: open_repository / get_status / stage / commit / get_diff ...（全部带 repo 参数）
    ▲  event: repo-changed（每个仓库独立文件监听，payload = 仓库根路径）
Rust Core
 ├─ git/exec.rs      spawn git CLI（argv 数组、不经 shell）
 ├─ git/status.rs    porcelain v2 解析 → 四组变更（merge/index/workingTree/untracked）
 ├─ git/ops.rs       stage / commit / checkout / merge / rebase / 分支管理 …
 ├─ git/refs.rs      分支列表（for-each-ref + upstream 跟踪）
 ├─ git/log.rs       提交历史 / 提交文件列表 / 变更统计
 ├─ git/diff.rs      diff 两侧内容 + 提交 patch（供 Monaco 渲染）
 ├─ git/{stash,tags,remotes,worktree,clone}.rs   储藏 / 标记 / 远程 / 工作树 / 克隆
 └─ state.rs         多仓库会话（每仓库一个 notify watcher + 防抖）
```

<details>
<summary>与 VS Code 源码的对应关系</summary>

| VS Code | Veygit | 说明 |
|---|---|---|
| `extensions/git/src/git.ts` | `src-tauri/src/git/*.rs` | CLI 调用方式与 porcelain 解析对照重写（Rust 无 Node 运行时） |
| `extensions/git/src/repository.ts` | `git/status.rs` + `src/store.ts` | Repository / Resource / ResourceGroup → 多仓库 `RepoState` + 四组 `FileChange` |
| `extensions/git/src/commands.ts` | `git/ops.rs` + `src/actions.ts` | 交互重写，业务逻辑借鉴 |
| `scmViewPane.ts` / `scmGraph` | `src/components/*.tsx` | 面板 UI 视觉复刻（存储库 / 更改 / 图表 / 提交框） |
| Monaco diff 编辑器 | `src/components/DiffViewer.tsx` | 本地打包 monaco-editor，无 CDN |

</details>

## 📄 License

MIT（核心解析逻辑参照 VS Code，其 git 扩展同为 MIT 许可）。
