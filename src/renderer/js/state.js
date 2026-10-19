export const state = {
  info: null,
  settings: null,
  project: null,
  tabs: [],
  active: null,
  editor: null,
  problems: [],
  symbols: [],
  symbolsFresh: false,
  expanded: new Set(),
  sidebar: 'explorer',
  sideOpen: true,
  grokOpen: false,
  bottomOpen: true,
  bottomTab: 'run',
  sideW: 272,
  bottomH: 248,
  grokW: 360,
  runConfig: 'current',
  customCommand: '',
  running: false,
  commands: new Map(),
  nav: { back: [], forward: [], lock: false },
  recentJump: [],
  hooks: {},
  fileIndex: null,
};

export function register(id, fn, meta = {}) {
  state.commands.set(id, { id, fn, title: meta.title || id, shortcut: meta.shortcut || '', group: meta.group || 'Other' });
}

export function run(id, payload) {
  const command = state.commands.get(id);
  if (!command) return undefined;
  return command.fn(payload);
}

export function listCommands() {
  return [...state.commands.values()];
}

export function baseName(file) {
  if (!file) return '';
  const index = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'));
  return file.slice(index + 1);
}

export function dirName(file) {
  if (!file) return '';
  const index = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'));
  if (index <= 0) return file.startsWith('/') ? '/' : '';
  return file.slice(0, index);
}

export function joinPath(dir, name) {
  if (!dir || dir === '/') return `/${name}`.replace(/^\/\//, '/');
  return dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`;
}

export function relativePath(file) {
  if (!file) return '';
  const root = state.project;
  if (root && (file === root || file.startsWith(`${root}/`))) {
    return file.slice(root.length + 1) || baseName(file);
  }
  return file;
}

export function languageOf(file) {
  const name = baseName(file).toLowerCase();
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot) : '';
  const map = {
    '.magic': 'magic',
    '.js': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.mts': 'typescript',
    '.json': 'json',
    '.html': 'html',
    '.htm': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.md': 'markdown',
    '.py': 'python',
    '.sh': 'shell',
    '.bash': 'shell',
    '.yml': 'yaml',
    '.yaml': 'yaml',
    '.xml': 'xml',
    '.svg': 'xml',
    '.sql': 'sql',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.c': 'c',
    '.h': 'c',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.toml': 'ini',
    '.ini': 'ini',
    '.txt': 'plaintext',
  };
  return map[ext] || 'plaintext';
}
