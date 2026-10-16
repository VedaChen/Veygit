import { confirm, open } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { api } from './api';
import {
  clearGitHubClientId,
  clearGitHubToken,
  fetchGitHubLogin,
  fetchGitHubRepos,
  loadGitHubClientId,
  loadGitHubToken,
  pollAccessToken,
  requestDeviceCode,
  saveGitHubClientId,
  saveGitHubToken,
  type DeviceCode,
} from './github';
import { useStore } from './store';

/**
 * Git 菜单动作的统一分发器：菜单里所有功能项（action id）的真正实现。
 *
 * 约定：
 * - 所有动作先检查 store.busy（防重入），动作执行期间置 busy；
 * - 成功时向 GIT 输出面板追加命令概要 + 输出，并刷新仓库状态；
 * - 失败时输出面板与顶部通知同时上报；所有异常都被捕捉，永不向外抛出
 *   （外呼方 fire-and-forget：`void runGitAction(action, repo)`）。
 */

/** 与 store.ts 的 STORAGE_KEY 一致：clone 打开的新仓库需要立即持久化 */
const REPOS_STORAGE_KEY = 'vscode-git-panel.repos';

function append(text: string): void {
  useStore.getState().appendOutput(text);
}

/** 上报错误：GIT 输出面板 + 顶部通知；返回 null 便于 `return showError(...)` */
function showError(text: string): null {
  append(text);
  useStore.setState({ notice: { level: 'error', text } });
  return null;
}

/** 上报轻量提示（如空集合的无操作场景） */
function showInfo(text: string): void {
  useStore.setState({ notice: { level: 'info', text } });
}

/**
 * 动作执行包装：置 busy → 执行 → 成功记录输出 / 失败上报。
 * fn 返回 string 表示 git 输出（空串 = 仅记录命令概要），null 表示无需输出（用户取消等）。
 */
async function run(desc: string, fn: () => Promise<string | null>): Promise<void> {
  if (useStore.getState().busy) {
    return;
  }
  useStore.setState({ busy: true });
  try {
    const out = await fn();
    if (out !== null) {
      const trimmed = out.trim();
      append(trimmed ? `> git ${desc}\n${trimmed}` : `> git ${desc}`);
    }
  } catch (e) {
    const text = String(e);
    append(`> git ${desc}\n${text}`);
    useStore.setState({ notice: { level: 'error', text } });
  } finally {
    useStore.setState({ busy: false });
  }
}

/** 刷新状态 + 分支列表（远程/本地分支集合变化） */
async function refreshBranches(repo: string): Promise<void> {
  await useStore.getState().refresh(repo);
  await useStore.getState().loadBranches(repo);
}

/** 刷新状态 + 分支 + 提交历史（提交/分支/储藏/标签等状态类操作） */
async function refreshHistory(repo: string): Promise<void> {
  await useStore.getState().refresh(repo);
  await useStore.getState().loadBranches(repo);
  await useStore.getState().loadHistory(repo);
}

/** 读取仓库上下文：当前提交消息、已暂存文件数、amend 标记、当前分支名 */
function repoContext(repo: string): {
  message: string;
  stagedCount: number;
  amend: boolean;
  branch: string;
} | null {
  const r = useStore.getState().repos.find((x) => x.info.root === repo);
  if (!r) {
    return null;
  }
  return {
    message: r.message.trim(),
    stagedCount: (r.status?.indexChanges.length ?? 0) + (r.status?.mergeChanges.length ?? 0),
    amend: r.amend,
    branch: r.status?.branch ?? '',
  };
}

/** 提交成功后：复位提交框、提示成功、收起已失效的文件 diff 选择 */
function finishCommit(repo: string): void {
  const s = useStore.getState();
  s.setMessage(repo, '');
  s.setAmend(repo, false);
  const sel = s.selection;
  if (sel?.kind === 'change' && sel.repo === repo) {
    useStore.setState({ selection: null, diff: null });
  }
  useStore.setState({ notice: { level: 'success', text: '提交成功' } });
}

/** 提交已暂存内容（commit / commitStaged / commitAmend / commitStagedAmend） */
async function commitIndex(
  repo: string,
  amendOverride: boolean | null,
  requireStaged: boolean,
): Promise<string | null> {
  const ctx = repoContext(repo);
  if (!ctx) {
    return showError('仓库未打开');
  }
  if (!ctx.message) {
    return showError('请输入提交消息');
  }
  if (requireStaged && ctx.stagedCount === 0) {
    return showError('没有已暂存的更改');
  }
  const out = await api.commit(repo, ctx.message, amendOverride ?? ctx.amend);
  finishCommit(repo);
  await refreshHistory(repo);
  return out;
}

/** 全部提交（commitAll / commitAllAmend / commitAllSignedOff） */
async function commitEverything(
  repo: string,
  amend: boolean,
  signedOff: boolean,
): Promise<string | null> {
  const ctx = repoContext(repo);
  if (!ctx) {
    return showError('仓库未打开');
  }
  if (!ctx.message) {
    return showError('请输入提交消息');
  }
  const out = await api.commitAll(repo, ctx.message, amend, signedOff);
  finishCommit(repo);
  await refreshHistory(repo);
  return out;
}

/**
 * 署名提交（commitSignedOff / commitStagedSignedOff）：简化实现。
 * 后端只提供 commit_all（提交全部），这里保持"需先有已暂存内容"的前置校验，
 * 通过后调用 commitAll(..., signedOff = true)（等价全提 + 署名）。
 */
async function commitSignedOffOnly(repo: string): Promise<string | null> {
  const ctx = repoContext(repo);
  if (!ctx) {
    return showError('仓库未打开');
  }
  if (!ctx.message) {
    return showError('请输入提交消息');
  }
  if (ctx.stagedCount === 0) {
    return showError('没有已暂存的更改');
  }
  const out = await api.commitAll(repo, ctx.message, false, true);
  finishCommit(repo);
  await refreshHistory(repo);
  return out;
}

/** 委托 store 现有的同步实现（内部自行管理 busy / 刷新 / notice） */
async function storeSync(repo: string, op: 'fetch' | 'pull' | 'push' | 'sync'): Promise<string> {
  await useStore.getState().sync(repo, op);
  return '';
}

/** 从远程列表选一个（仅一个时直接采用，多个时弹列表） */
async function pickRemote(remotes: string[], title: string): Promise<string | null> {
  if (remotes.length === 1) {
    return remotes[0];
  }
  return useStore.getState().promptPick({
    title,
    placeholder: '远程仓库名称',
    items: remotes.map((r) => ({ label: r, value: r })),
  });
}

/** 选择本地分支（排除当前分支）；没有可选项时提示并返回 null */
async function pickLocalBranch(repo: string, title: string): Promise<string | null> {
  const s = useStore.getState();
  await s.loadBranches(repo);
  const branches = (useStore.getState().repos.find((r) => r.info.root === repo)?.branches ?? [])
    .filter((b) => !b.isRemote && !b.isHead);
  if (branches.length === 0) {
    return showError('没有可用的本地分支');
  }
  return s.promptPick({
    title,
    placeholder: '分支名称',
    items: branches.map((b) => ({
      label: b.name,
      description: b.subject,
      value: b.name,
    })),
  });
}

/** 选择指定远程上的分支（返回短名）；分支列表为空时退回手动输入 */
async function pickRemoteBranch(repo: string, remote: string, title: string): Promise<string | null> {
  const s = useStore.getState();
  await s.loadBranches(repo);
  const prefix = `${remote}/`;
  const branches = (useStore.getState().repos.find((r) => r.info.root === repo)?.branches ?? [])
    .filter((b) => b.isRemote && b.name.startsWith(prefix));
  if (branches.length === 0) {
    const current = repoContext(repo)?.branch ?? '';
    const input = await s.promptInput({ title, placeholder: '分支名称', value: current });
    const trimmed = input?.trim();
    return trimmed ? trimmed : null;
  }
  return s.promptPick({
    title,
    placeholder: '分支名称',
    items: branches.map((b) => ({
      label: b.name.slice(prefix.length),
      description: b.subject,
      value: b.name.slice(prefix.length),
    })),
  });
}

/** 选择储藏条目（返回 reference）；没有储藏时提示并返回 null */
async function pickStashReference(repo: string, title: string): Promise<string | null> {
  const stashes = await api.stashList(repo);
  if (stashes.length === 0) {
    return showError('没有储藏条目');
  }
  return useStore.getState().promptPick({
    title,
    placeholder: '储藏条目',
    items: stashes.map((st) => ({
      label: st.message || st.reference,
      description: st.reference,
      value: st.reference,
    })),
  });
}

/**
 * GitHub 授权登录（Device Flow，对照 VS Code 的 GitHub 授权体验）：
 * 已有有效 token 直接复用；否则显示验证码 + 打开浏览器授权 + 轮询自动完成。
 * 返回 token 与登录名；用户取消 / 失败返回 null。
 */
async function ensureGitHubAuth(): Promise<{ token: string; login: string } | null> {
  const s = useStore.getState();
  const cached = loadGitHubToken();
  if (cached) {
    try {
      const login = await fetchGitHubLogin(cached);
      saveGitHubToken(cached, login);
      return { token: cached, login };
    } catch {
      clearGitHubToken();
    }
  }
  // 首次使用需要 OAuth App 的 Client ID（Device Flow 无需 client_secret）
  let clientId = loadGitHubClientId();
  if (!clientId) {
    const input = await s.promptInput({
      title: 'GitHub 授权',
      placeholder: 'OAuth 应用 Client ID',
      description:
        '首次使用需配置：GitHub → Settings → Developer settings → OAuth Apps → 新建应用并勾选 Enable Device Flow，然后将 Client ID 粘贴到这里',
    });
    clientId = input?.trim() ?? '';
    if (!clientId) {
      return null;
    }
    saveGitHubClientId(clientId);
  }
  let dc: DeviceCode;
  try {
    dc = await requestDeviceCode(clientId);
  } catch (e) {
    clearGitHubClientId();
    return showError(`GitHub 授权失败：${String(e)}（请检查 Client ID 是否正确）`);
  }
  // 打开浏览器 + 显示验证码等待弹窗；轮询成功时自动关闭弹窗继续
  void openUrl(dc.verification_uri).catch(() => undefined);
  let finished = false;
  const token = await new Promise<string | null>((resolve) => {
    void pollAccessToken(clientId, dc.device_code, dc.interval, dc.expires_in, () => finished)
      .then((t) => {
        s.resolvePrompt(dc.user_code);
        if (!finished) {
          finished = true;
          resolve(t);
        }
      })
      .catch((e) => {
        s.resolvePrompt(null);
        if (!finished) {
          finished = true;
          showError(`GitHub 授权失败：${String(e)}`);
          resolve(null);
        }
      });
    void s
      .promptInput({
        title: 'GitHub 授权',
        placeholder: '验证码',
        value: dc.user_code,
        description: `已在浏览器打开 ${dc.verification_uri}：请输入验证码并授权（授权完成后自动继续，按 Esc 取消）`,
      })
      .then(() => {
        if (!finished) {
          finished = true;
          resolve(null);
        }
      });
  });
  if (!token) {
    return null;
  }
  try {
    const login = await fetchGitHubLogin(token);
    saveGitHubToken(token, login);
    return { token, login };
  } catch (e) {
    return showError(`GitHub 授权失败：${String(e)}`);
  }
}

/**
 * 从 GitHub 添加远程存储库（对照 VS Code）：授权登录 → 列出账号仓库 →
 * 选择仓库 → 询问远程名称 → 添加远程并保存凭据（后续 push/pull 免登录）。
 */
async function addRemoteFromGitHub(repo: string): Promise<string | null> {
  const s = useStore.getState();
  const auth = await ensureGitHubAuth();
  if (!auth) {
    return null;
  }
  let repos;
  try {
    repos = await fetchGitHubRepos(auth.token);
  } catch (e) {
    return showError(String(e));
  }
  if (repos.length === 0) {
    return showError('GitHub 账号下没有可用仓库');
  }
  const picked = await s.promptPick({
    title: '',
    placeholder: '选择要添加为远程存储库的 GitHub 仓库',
    items: repos.map((r) => ({
      label: r.full_name,
      description: [r.private ? '私有' : '公开', r.description ?? ''].filter(Boolean).join(' · '),
      icon: r.private ? 'codicon-lock' : 'codicon-repo',
      value: r.full_name,
    })),
  });
  if (!picked) {
    return null;
  }
  const target = repos.find((r) => r.full_name === picked);
  if (!target) {
    return null;
  }
  // 远程名称（默认 origin，对照 VS Code）
  const name = await s.promptInput({
    title: '',
    placeholder: '远程名称',
    value: 'origin',
    description: '提供远程存储库的名称 (按 "Enter" 以确认或按 "Esc" 以取消)',
  });
  const remoteName = name?.trim();
  if (!remoteName) {
    return null;
  }
  const out = await api.remoteAdd(repo, remoteName, target.clone_url);
  // 授权 token 存入凭据管理器：后续 push/pull 直接复用（HTTPS 认证）
  await api
    .storeCredentials(repo, 'https', 'github.com', auth.login, auth.token)
    .catch(() => undefined);
  await refreshBranches(repo);
  showInfo(`已添加远程 ${remoteName}（${target.full_name}）`);
  return out;
}

/** clone 后把新仓库加入列表并激活（对照 store.openRepository 的打开流程） */
async function openClonedRepository(path: string): Promise<void> {
  const info = await api.openRepository(path);
  const exists = useStore.getState().repos.some((r) => r.info.root === info.root);
  if (!exists) {
    useStore.setState((state) => ({
      repos: [
        ...state.repos,
        {
          info,
          status: null,
          branches: [],
          commits: [],
          message: '',
          amend: false,
          historyLoaded: false,
        },
      ],
    }));
    try {
      const roots = useStore.getState().repos.map((r) => r.info.root);
      localStorage.setItem(REPOS_STORAGE_KEY, JSON.stringify(roots));
    } catch {
      // 持久化失败不影响打开流程
    }
  }
  useStore.setState({
    activeRoot: info.root,
    selection: null,
    diff: null,
    patch: null,
    branchPicker: null,
  });
  await useStore.getState().refresh(info.root);
  await useStore.getState().loadBranches(info.root);
  await useStore.getState().loadHistory(info.root);
}

/** 执行菜单动作（action id 见下）；repo = 目标仓库根路径 */
export async function runGitAction(action: string, repo: string): Promise<void> {
  // 防重入：忙碌期间忽略所有菜单动作
  if (useStore.getState().busy) {
    return;
  }

  try {
    switch (action) {
      // ---- 提交 ----

      case 'commit':
      case 'commitStaged':
        await run('commit', () => commitIndex(repo, null, true));
        break;

      case 'commitAmend':
      case 'commitStagedAmend':
        await run('commit --amend', () => commitIndex(repo, true, false));
        break;

      case 'commitAll':
        await run('commit --all', () => commitEverything(repo, false, false));
        break;

      case 'commitAllAmend':
        await run('commit --all --amend', () => commitEverything(repo, true, false));
        break;

      case 'commitAllSignedOff':
        await run('commit --all --signoff', () => commitEverything(repo, false, true));
        break;

      case 'commitSignedOff':
      case 'commitStagedSignedOff':
        await run('commit --signoff', () => commitSignedOffOnly(repo));
        break;

      case 'commitUndo':
        await run('reset --soft HEAD^', async () => {
          const ok = await confirm('撤销上一次提交？更改将保留在工作区。', {
            title: '撤销上次提交',
            kind: 'warning',
          });
          if (!ok) {
            return null;
          }
          const out = await api.commitUndo(repo);
          await refreshHistory(repo);
          return out;
        });
        break;

      case 'abortRebase':
        await run('rebase --abort', async () => {
          const ok = await confirm('要中止正在进行的变基吗？', {
            title: '中止变基',
            kind: 'warning',
          });
          if (!ok) {
            return null;
          }
          try {
            const out = await api.rebaseAbort(repo);
            await refreshHistory(repo);
            return out;
          } catch (e) {
            return showError(`没有进行中的变基（${String(e)}）`);
          }
        });
        break;

      // ---- 更改 ----

      case 'stageAll':
        await run('add --all', async () => {
          const r = useStore.getState().repos.find((x) => x.info.root === repo);
          const files = [
            ...(r?.status?.workingTreeChanges ?? []),
            ...(r?.status?.untrackedChanges ?? []),
          ];
          if (files.length === 0) {
            showInfo('没有可暂存的更改');
            return null;
          }
          await useStore.getState().stage(repo, files);
          return '';
        });
        break;

      case 'unstageAll':
        await run('restore --staged .', async () => {
          const r = useStore.getState().repos.find((x) => x.info.root === repo);
          const files = r?.status?.indexChanges ?? [];
          if (files.length === 0) {
            showInfo('没有已暂存的更改');
            return null;
          }
          await useStore.getState().unstage(repo, files);
          return '';
        });
        break;

      case 'discardAll':
        await run('restore .', async () => {
          const r = useStore.getState().repos.find((x) => x.info.root === repo);
          const files = [
            ...(r?.status?.workingTreeChanges ?? []),
            ...(r?.status?.untrackedChanges ?? []),
          ];
          if (files.length === 0) {
            showInfo('没有可放弃的更改');
            return null;
          }
          const ok = await confirm('放弃所有更改？此操作不可撤销。', {
            title: '放弃所有更改',
            kind: 'warning',
          });
          if (!ok) {
            return null;
          }
          await useStore.getState().discard(repo, files);
          return '';
        });
        break;

      // ---- 拉取 / 推送 ----

      case 'sync':
        await run('sync', () => storeSync(repo, 'sync'));
        break;

      case 'pull':
        await run('pull', () => storeSync(repo, 'pull'));
        break;

      case 'push':
        await run('push', () => storeSync(repo, 'push'));
        break;

      case 'fetch':
      case 'fetchAll':
        await run('fetch --all', () => storeSync(repo, 'fetch'));
        break;

      case 'pullRebase':
        await run('pull --rebase', async () => {
          const out = await api.pullRebase(repo);
          await refreshHistory(repo);
          return out;
        });
        break;

      case 'pullFrom':
        await run('pull', async () => {
          const remotes = await api.listRemotes(repo);
          if (remotes.length === 0) {
            return showError('没有配置远程仓库');
          }
          const remote = await pickRemote(remotes, '选择要拉取的远程仓库');
          if (!remote) {
            return null;
          }
          const branch = await pickRemoteBranch(repo, remote, `选择要拉取的分支（${remote}）`);
          if (!branch) {
            return null;
          }
          const out = await api.pullFrom(repo, remote, branch);
          await refreshHistory(repo);
          return out;
        });
        break;

      case 'pushTo':
        await run('push', async () => {
          const remotes = await api.listRemotes(repo);
          if (remotes.length === 0) {
            return showError('没有配置远程仓库');
          }
          const remote = await pickRemote(remotes, '选择要推送到的远程仓库');
          if (!remote) {
            return null;
          }
          const branch = await pickRemoteBranch(repo, remote, `选择要推送到的分支（${remote}）`);
          if (!branch) {
            return null;
          }
          const out = await api.pushTo(repo, remote, branch);
          await refreshBranches(repo);
          return out;
        });
        break;

      case 'fetchPrune':
        await run('fetch --prune', async () => {
          const out = await api.fetchPrune(repo);
          await refreshBranches(repo);
          return out;
        });
        break;

      // ---- 分支 ----

      case 'merge':
        await run('merge', async () => {
          const branch = await pickLocalBranch(repo, '选择要合并到当前分支的分支');
          if (!branch) {
            return null;
          }
          const out = await api.mergeBranch(repo, branch);
          await refreshHistory(repo);
          return out;
        });
        break;

      case 'rebase':
        await run('rebase', async () => {
          const branch = await pickLocalBranch(repo, '选择当前分支要变基到的目标分支');
          if (!branch) {
            return null;
          }
          const out = await api.rebaseBranch(repo, branch);
          await refreshHistory(repo);
          return out;
        });
        break;

      case 'createBranch':
        // 直接询问分支名称并从当前 HEAD 创建并签出（对照 VS Code "Git: 创建分支..."）
        await run('checkout -b', async () => {
          const s = useStore.getState();
          const name = await s.promptInput({
            title: '',
            placeholder: '分支名称',
            description: '请提供新的分支名称 (按 "Enter" 以确认或按 "Esc" 以取消)',
          });
          const trimmed = name?.trim();
          if (!trimmed) {
            return null;
          }
          await s.createBranch(repo, trimmed, null);
          return null;
        });
        break;

      case 'createBranchFrom':
        useStore.getState().openBranchPicker(repo);
        useStore.getState().setBranchPickerMode('createFrom', null);
        break;

      case 'checkoutTo':
        // 复用分支快速选择器（签出到分支/标记）
        useStore.getState().openBranchPicker(repo);
        break;

      case 'renameBranch':
        await run('branch -m', async () => {
          const current = repoContext(repo)?.branch ?? '';
          const name = await useStore.getState().promptInput({
            title: '重命名分支',
            placeholder: '新名称',
            value: current,
          });
          const trimmed = name?.trim();
          if (!trimmed) {
            return null;
          }
          const out = await api.renameBranch(repo, trimmed);
          await refreshHistory(repo);
          return out;
        });
        break;

      case 'deleteBranch':
        await run('branch -d', async () => {
          const name = await pickLocalBranch(repo, '选择要删除的分支');
          if (!name) {
            return null;
          }
          const ok = await confirm(`确定要删除分支 "${name}" 吗？`, {
            title: '删除分支',
            kind: 'warning',
          });
          if (!ok) {
            return null;
          }
          try {
            const out = await api.deleteBranch(repo, name, false);
            await refreshHistory(repo);
            return out;
          } catch (e) {
            // 未合并导致普通删除失败 → 二次确认后强制删除
            const force = await confirm(`分支 "${name}" 尚未完全合并，强制删除？`, {
              title: '强制删除分支',
              kind: 'warning',
            });
            if (!force) {
              return showError(String(e));
            }
            const out = await api.deleteBranch(repo, name, true);
            await refreshHistory(repo);
            return out;
          }
        });
        break;

      case 'deleteRemoteBranch':
        await run('push --delete', async () => {
          const s = useStore.getState();
          await s.loadBranches(repo);
          const remoteBranches = (
            useStore.getState().repos.find((r) => r.info.root === repo)?.branches ?? []
          ).filter((b) => b.isRemote);
          if (remoteBranches.length === 0) {
            return showError('没有远程分支');
          }
          const full = await s.promptPick({
            title: '选择要删除的远程分支',
            placeholder: '分支名称',
            items: remoteBranches.map((b) => ({
              label: b.name,
              description: b.subject,
              value: b.name,
            })),
          });
          if (!full) {
            return null;
          }
          // 从 "origin/dev" 这类名称解析：remote = 第一段，branch = 余下
          const slash = full.indexOf('/');
          const remote = slash > 0 ? full.slice(0, slash) : '';
          const branch = slash > 0 ? full.slice(slash + 1) : '';
          if (!remote || !branch) {
            return showError(`无法解析远程分支：${full}`);
          }
          const ok = await confirm(`确定要从 "${remote}" 删除分支 "${branch}" 吗？`, {
            title: '删除远程分支',
            kind: 'warning',
          });
          if (!ok) {
            return null;
          }
          const out = await api.deleteRemoteBranch(repo, remote, branch);
          await refreshHistory(repo);
          return out;
        });
        break;

      case 'publishBranch':
        await run('push --set-upstream', async () => {
          const remotes = await api.listRemotes(repo);
          if (remotes.length === 0) {
            return showError('没有配置远程仓库');
          }
          const remote = await pickRemote(remotes, '选择要发布到的远程仓库');
          if (!remote) {
            return null;
          }
          const out = await api.publishBranch(repo, remote);
          await refreshBranches(repo);
          return out;
        });
        break;

      // ---- 远程管理 ----

      case 'remoteAdd':
        await run('remote add', async () => {
          const s = useStore.getState();
          // 第一步：URL（或选择"从 GitHub 添加"走授权登录 → 列出账号仓库）
          let githubClicked = false;
          const url = await s.promptInput({
            title: '',
            placeholder: '提供仓库 URL 或选择仓库源。',
            description: '添加远程存储库 (按 "Enter" 以确认或按 "Esc" 以取消)',
            option: {
              label: '从 GitHub 添加远程存储库',
              icon: 'codicon-github',
              onClick: () => {
                githubClicked = true;
                s.resolvePrompt(null);
              },
            },
          });
          if (githubClicked) {
            return await addRemoteFromGitHub(repo);
          }
          const remoteUrl = url?.trim();
          if (!remoteUrl) {
            return null;
          }
          // 第二步：远程名称（默认 origin，对照 VS Code：先 URL 后名称）
          const name = await s.promptInput({
            title: '',
            placeholder: '远程名称',
            value: 'origin',
            description: '提供远程存储库的名称 (按 "Enter" 以确认或按 "Esc" 以取消)',
          });
          const remoteName = name?.trim();
          if (!remoteName) {
            return null;
          }
          const out = await api.remoteAdd(repo, remoteName, remoteUrl);
          await refreshBranches(repo);
          return out;
        });
        break;

      case 'remoteRemove':
        await run('remote remove', async () => {
          const s = useStore.getState();
          const remotes = await api.remoteUrls(repo);
          if (remotes.length === 0) {
            return showError('没有配置远程仓库');
          }
          // 对照 VS Code：QuickPick 列出 "云图标 + 名称 + URL"
          const remote = await s.promptPick({
            title: '',
            placeholder: '选择要删除的远程库',
            items: remotes.map(([name, url]) => ({
              label: name,
              description: url,
              icon: 'codicon-cloud',
              value: name,
            })),
          });
          if (!remote) {
            return null;
          }
          const ok = await confirm(`确定要删除远程仓库 "${remote}" 吗？`, {
            title: '删除远程仓库',
            kind: 'warning',
          });
          if (!ok) {
            return null;
          }
          const out = await api.remoteRemove(repo, remote);
          await refreshBranches(repo);
          return out;
        });
        break;

      // ---- 储藏 ----

      case 'stash':
        await run('stash push', async () => {
          const out = await api.stashPush(repo, false, false);
          await refreshHistory(repo);
          return out;
        });
        break;

      case 'stashIncludeUntracked':
        await run('stash push --include-untracked', async () => {
          const out = await api.stashPush(repo, true, false);
          await refreshHistory(repo);
          return out;
        });
        break;

      case 'stashStaged':
        await run('stash push --staged', async () => {
          const out = await api.stashPush(repo, false, true);
          await refreshHistory(repo);
          return out;
        });
        break;

      case 'stashApplyLatest':
        await run('stash apply stash@{0}', async () => {
          const out = await api.stashApply(repo, 'stash@{0}');
          await refreshHistory(repo);
          return out;
        });
        break;

      case 'stashPopLatest':
        await run('stash pop stash@{0}', async () => {
          const out = await api.stashPop(repo, 'stash@{0}');
          await refreshHistory(repo);
          return out;
        });
        break;

      case 'stashApply':
        await run('stash apply', async () => {
          const reference = await pickStashReference(repo, '选择要应用的储藏');
          if (!reference) {
            return null;
          }
          const out = await api.stashApply(repo, reference);
          await refreshHistory(repo);
          return out;
        });
        break;

      case 'stashPop':
        await run('stash pop', async () => {
          const reference = await pickStashReference(repo, '选择要弹出的储藏');
          if (!reference) {
            return null;
          }
          const out = await api.stashPop(repo, reference);
          await refreshHistory(repo);
          return out;
        });
        break;

      case 'stashDrop':
        await run('stash drop', async () => {
          const reference = await pickStashReference(repo, '选择要删除的储藏');
          if (!reference) {
            return null;
          }
          const ok = await confirm(`确定要删除储藏 "${reference}" 吗？`, {
            title: '删除储藏',
            kind: 'warning',
          });
          if (!ok) {
            return null;
          }
          const out = await api.stashDrop(repo, reference);
          await refreshHistory(repo);
          return out;
        });
        break;

      case 'stashDropAll':
        await run('stash clear', async () => {
          const ok = await confirm('删除所有储藏？', {
            title: '删除所有储藏',
            kind: 'warning',
          });
          if (!ok) {
            return null;
          }
          const out = await api.stashClear(repo);
          await refreshHistory(repo);
          return out;
        });
        break;

      case 'stashView':
        await run('stash show', async () => {
          const reference = await pickStashReference(repo, '选择要查看的储藏');
          if (!reference) {
            return null;
          }
          const out = await api.stashShow(repo, reference);
          useStore.getState().setOutputOpen(true);
          return out;
        });
        break;

      // ---- 标记 ----

      case 'tagCreate':
        await run('tag', async () => {
          const name = await useStore.getState().promptInput({
            title: '创建标记',
            placeholder: '标记名称',
          });
          const trimmed = name?.trim();
          if (!trimmed) {
            return null;
          }
          const out = await api.tagCreate(repo, trimmed);
          await refreshHistory(repo);
          return out;
        });
        break;

      case 'tagDelete':
        // 本地标签列表没有现成 API：直接输入标签名
        await run('tag -d', async () => {
          const name = await useStore.getState().promptInput({
            title: '删除标签',
            placeholder: '标签名称',
          });
          const trimmed = name?.trim();
          if (!trimmed) {
            return null;
          }
          const ok = await confirm(`确定要删除标签 "${trimmed}" 吗？`, {
            title: '删除标签',
            kind: 'warning',
          });
          if (!ok) {
            return null;
          }
          const out = await api.tagDelete(repo, trimmed);
          await refreshHistory(repo);
          return out;
        });
        break;

      case 'tagDeleteRemote':
        await run('push --delete tag', async () => {
          const name = await useStore.getState().promptInput({
            title: '远程标记名称',
            placeholder: '标记名称',
          });
          const trimmed = name?.trim();
          if (!trimmed) {
            return null;
          }
          const remotes = await api.listRemotes(repo);
          if (remotes.length === 0) {
            return showError('没有配置远程仓库');
          }
          const remote = await pickRemote(remotes, '选择远程仓库');
          if (!remote) {
            return null;
          }
          const ok = await confirm(`确定要从 "${remote}" 删除标记 "${trimmed}" 吗？`, {
            title: '删除远程标记',
            kind: 'warning',
          });
          if (!ok) {
            return null;
          }
          const out = await api.tagDeleteRemote(repo, remote, trimmed);
          await refreshHistory(repo);
          return out;
        });
        break;

      case 'tagPush':
        await run('push --tags', async () => {
          const remotes = await api.listRemotes(repo);
          if (remotes.length === 0) {
            return showError('没有配置远程仓库');
          }
          const remote = await pickRemote(remotes, '选择推送标记的远程仓库');
          if (!remote) {
            return null;
          }
          const out = await api.tagPush(repo, remote);
          return out;
        });
        break;

      // ---- 工作树 / 克隆 ----

      case 'worktreeCreate':
        await run('worktree add', async () => {
          const path = await useStore.getState().promptInput({
            title: '工作树路径',
            placeholder: '相对仓库根或绝对路径',
          });
          const trimmed = path?.trim();
          if (!trimmed) {
            return null;
          }
          const out = await api.worktreeAdd(repo, trimmed);
          return out;
        });
        break;

      case 'clone':
        await run('clone', async () => {
          const url = await useStore.getState().promptInput({
            title: '仓库 URL',
            placeholder: 'https://example.com/repo.git',
          });
          const remoteUrl = url?.trim();
          if (!remoteUrl) {
            return null;
          }
          const dir = await open({
            directory: true,
            multiple: false,
            title: '选择克隆目标目录',
          });
          if (!dir || Array.isArray(dir)) {
            return null;
          }
          // 从 URL 推导仓库名（兼容 https 与 scp 风格）
          const name =
            remoteUrl.split('/').filter(Boolean).pop()?.replace(/\.git$/, '') || 'repository';
          const target = `${dir}/${name}`;
          const out = await api.cloneRepository(remoteUrl, target);
          await openClonedRepository(target);
          return out;
        });
        break;

      // ---- 其他 ----

      case 'showGitOutput':
        useStore.getState().setOutputOpen(true);
        break;

      default:
        useStore.setState({ notice: { level: 'error', text: `未知的 Git 动作：${action}` } });
        break;
    }
  } catch (e) {
    // never throw：作为外呼方 fire-and-forget 的最后兜底
    showError(String(e));
  }
}
