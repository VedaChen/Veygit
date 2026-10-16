import * as monaco from 'monaco-editor';

// 注意：monaco-editor 0.57 起无需手动配置 MonacoEnvironment.getWorker ——
// 编辑器内部通过 `new URL('.../editorWebWorkerMain.js', import.meta.url)`
// 交给 bundler（Vite / Rolldown）打包 worker，天然离线可用。

monaco.editor.defineTheme('git-panel-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#1e1e1e',
    'editorGutter.background': '#1e1e1e',
    'diffEditor.insertedTextBackground': '#81b88b22',
    'diffEditor.removedTextBackground': '#c74e3922',
    'diffEditor.insertedLineBackground': '#81b88b15',
    'diffEditor.removedLineBackground': '#c74e3915',
    'scrollbarSlider.background': '#79797966',
    'scrollbarSlider.hoverBackground': '#646464b3',
  },
});

const extensionLanguages: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jsonc: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  md: 'markdown',
  markdown: 'markdown',
  rs: 'rust',
  py: 'python',
  go: 'go',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  ps1: 'powershell',
  bat: 'bat',
  cmd: 'bat',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  xml: 'xml',
  sql: 'sql',
  svg: 'xml',
  vue: 'html',
  svelte: 'html',
};

export function languageFor(path: string): string {
  const base = path.split('/').pop() ?? path;
  if (base.toLowerCase() === 'dockerfile') {
    return 'dockerfile';
  }
  const ext = base.includes('.') ? base.split('.').pop()!.toLowerCase() : '';
  return extensionLanguages[ext] ?? 'plaintext';
}

export { monaco };
