import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  protocol,
  shell,
} from 'electron';
import { appRoot } from './paths.js';
import {
  createEntry,
  createProject,
  gitInfo,
  indexSymbols,
  listDir,
  readFile,
  readScripts,
  removePath,
  renamePath,
  searchText,
  walkFiles,
  writeFile,
} from './services/files.js';
import {
  forgetPrompt,
  grokLaunch,
  pushGrokChunk,
  writePrompt,
} from './services/grok.js';
import {
  checkSource,
  findGrok,
  findMagic,
  findNode,
  nodeEnv,
  packPreview,
  runSpec,
} from './services/magic.js';
import { hasPty, loadPty, startProcess } from './services/pty.js';
import { loadJson, saveJson, workspacePath } from './services/store.js';
import { DEFAULTS } from './services/store.js';

app.setName('magic-studio');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'studio',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      codeCache: true,
    },
  },
]);

const smoke = process.env.MAGIC_STUDIO_SMOKE === '1';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

let win = null;
let settings = { ...DEFAULTS };
let settingsFile = '';
let userData = '';
let runtime = {
  nodePath: '',
  extraEnv: {},
  magic: { cli: null, app: null, root: null },
  grokPath: '',
  pty: false,
};
let launch = { project: null, file: null };
let allowClose = smoke;
let previewWin = null;
let previewDir = '';
let runProc = null;
let grokProc = null;
let grokPrompt = '';
const terms = new Map();
let watchTimer = null;
let watcher = null;
let watchedRoot = '';

function version() {
  try {
    return JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8')).version || '0.1.0';
  } catch {
    return '0.1.0';
  }
}

function fromStudioUrl(requestUrl) {
  let url;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.hostname !== 'app') return null;
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (!rel || rel.split('/').includes('..')) return null;
  const file = path.resolve(appRoot, rel);
  if (file !== appRoot && !file.startsWith(`${appRoot}${path.sep}`)) return null;
  return file;
}

function persistSettings() {
  if (!settingsFile) return;
  saveJson(settingsFile, settings);
}

function rememberProject(project) {
  if (!project) return;
  const recent = [project, ...(settings.recent || []).filter((item) => item !== project)].slice(0, 12);
  settings = { ...settings, recent, lastProject: project };
  persistSettings();
}

function projectFromArgv(argv) {
  for (const arg of argv.slice(1)) {
    if (!arg || arg.startsWith('-')) continue;
    const abs = path.resolve(arg);
    if (abs === appRoot) continue;
    if (abs.endsWith(`${path.sep}src${path.sep}main.js`)) continue;
    if (!fs.existsSync(abs)) continue;
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) return { project: abs, file: null };
    if (stat.isFile()) return { project: path.dirname(abs), file: abs };
  }
  return { project: null, file: null };
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function watchProject(root) {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  watchedRoot = root || '';
  if (!root) return;
  try {
    watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const name = String(filename);
      if (name.includes('node_modules') || name.includes(`${path.sep}.git`) || name.startsWith('.git')) return;
      if (name.includes('.magic-studio-check')) return;
      clearTimeout(watchTimer);
      watchTimer = setTimeout(() => {
        send('fs:event', { path: path.join(root, name) });
      }, 120);
    });
  } catch {
    watcher = null;
  }
}

function stopRun() {
  if (!runProc) return;
  const proc = runProc;
  runProc = null;
  try { proc.kill(); } catch { /* already gone */ }
  setTimeout(() => {
    try {
      if (proc.pid) process.kill(proc.pid, 'SIGKILL');
    } catch { /* already gone */ }
  }, 1200);
}

function stopGrok() {
  if (grokProc) {
    try { grokProc.kill(); } catch { /* already gone */ }
    grokProc = null;
  }
  forgetPrompt(grokPrompt);
  grokPrompt = '';
}

function killTerms() {
  for (const proc of terms.values()) {
    try { proc.kill(); } catch { /* already gone */ }
  }
  terms.clear();
}

function buildMenu() {
  const sendCommand = (id) => () => send('menu:command', id);
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Open Folder…', accelerator: 'CmdOrCtrl+O', click: sendCommand('project.open') },
        { label: 'New Project…', click: sendCommand('project.create') },
        { label: 'Open File…', accelerator: 'CmdOrCtrl+Shift+O', click: sendCommand('file.open') },
        { type: 'separator' },
        { label: 'New File', accelerator: 'Alt+Insert', click: sendCommand('file.new') },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: sendCommand('file.save') },
        { label: 'Save All', accelerator: 'CmdOrCtrl+Shift+S', click: sendCommand('file.saveAll') },
        { type: 'separator' },
        { label: 'Close Editor', accelerator: 'CmdOrCtrl+W', click: sendCommand('file.close') },
        { label: 'Close Folder', accelerator: 'CmdOrCtrl+Shift+W', click: sendCommand('project.close') },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find', accelerator: 'CmdOrCtrl+F', click: sendCommand('edit.find') },
        { label: 'Replace', accelerator: 'CmdOrCtrl+R', click: sendCommand('edit.replace') },
        { label: 'Find in Files', accelerator: 'CmdOrCtrl+Shift+F', click: sendCommand('search.open') },
        { type: 'separator' },
        { label: 'Duplicate Line', accelerator: 'CmdOrCtrl+D', click: sendCommand('edit.duplicate') },
        { label: 'Delete Line', accelerator: 'CmdOrCtrl+Y', click: sendCommand('edit.deleteLine') },
        { label: 'Comment Line', accelerator: 'CmdOrCtrl+/', click: sendCommand('edit.comment') },
        { label: 'Rename', accelerator: 'Shift+F6', click: sendCommand('edit.rename') },
        { label: 'Go to Declaration', accelerator: 'CmdOrCtrl+B', click: sendCommand('edit.definition') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Command Palette', accelerator: 'CmdOrCtrl+Shift+A', click: sendCommand('palette.open') },
        { label: 'Quick Open', accelerator: 'CmdOrCtrl+P', click: sendCommand('quick.open') },
        { label: 'Recent Files', accelerator: 'CmdOrCtrl+E', click: sendCommand('quick.recent') },
        { type: 'separator' },
        { label: 'Explorer', accelerator: 'Alt+1', click: sendCommand('sidebar.explorer') },
        { label: 'Search', accelerator: 'Alt+3', click: sendCommand('sidebar.search') },
        { label: 'Structure', accelerator: 'Alt+7', click: sendCommand('sidebar.outline') },
        ...(runtime.grokPath ? [{ label: 'Ask', accelerator: 'Alt+9', click: sendCommand('grok.toggle') }] : []),
        { type: 'separator' },
        { label: 'Terminal', accelerator: 'Alt+F12', click: sendCommand('terminal.toggle') },
        { label: 'Word Wrap', accelerator: 'Alt+Z', click: sendCommand('view.wrap') },
        { label: 'Toggle Minimap', click: sendCommand('view.minimap') },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { label: 'Reload Window', click: () => win?.webContents.reload() },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Run',
      submenu: [
        { label: 'Run', accelerator: 'Shift+F10', click: sendCommand('run.start') },
        { label: 'Preview', accelerator: 'Ctrl+Shift+F10', click: sendCommand('run.preview') },
        { label: 'Stop', accelerator: 'Ctrl+F2', click: sendCommand('run.stop') },
        { label: 'Check', accelerator: 'Ctrl+F9', click: sendCommand('run.check') },
      ],
    },
    ...(runtime.grokPath ? [{
      label: 'Ask',
      submenu: [
        { label: 'Ask', click: sendCommand('grok.focus') },
        { label: 'Explain File', click: sendCommand('grok.explainFile') },
        { label: 'Explain Selection', click: sendCommand('grok.explainSelection') },
        { label: 'Look for Problems', click: sendCommand('grok.problems') },
        { type: 'separator' },
        { label: 'Open Session in Terminal', click: sendCommand('grok.session') },
        { label: 'New Chat', click: sendCommand('grok.new') },
      ],
    }] : []),
    {
      label: 'Help',
      submenu: [
        { label: 'Keyboard Shortcuts', accelerator: 'CmdOrCtrl+Shift+Slash', click: sendCommand('help.keys') },
        {
          label: 'About MAGIC Studio',
          click: () => {
            dialog.showMessageBox(win, {
              type: 'info',
              title: 'MAGIC Studio',
              message: 'MAGIC Studio',
              detail: [
                `Version ${version()}`,
                'A dark IDE for the MAGIC language.',
                '',
                runtime.magic.cli ? `MAGIC  ${runtime.magic.cli}` : 'MAGIC compiler was not found',
                ...(runtime.grokPath ? [`Ask  ${runtime.grokPath}`] : []),
                runtime.pty ? 'Terminal  full PTY' : 'Terminal  basic pipe',
              ].join('\n'),
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const bounds = settings.bounds || { width: 1440, height: 920 };
  win = new BrowserWindow({
    width: bounds.width || 1440,
    height: bounds.height || 920,
    x: Number.isFinite(bounds.x) ? bounds.x : undefined,
    y: Number.isFinite(bounds.y) ? bounds.y : undefined,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#000000',
    title: 'MAGIC Studio',
    icon: path.join(appRoot, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(appRoot, 'src', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });
  if (bounds.maximized) win.maximize();
  win.once('ready-to-show', () => {
    if (!smoke) win.show();
  });
  win.on('close', (event) => {
    if (allowClose) return;
    event.preventDefault();
    send('app:requestClose');
  });
  win.on('resize', saveBounds);
  win.on('move', saveBounds);
  const query = smoke ? '?smoke=1' : '';
  win.loadURL(`studio://app/src/renderer/index.html${query}`);
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('studio://app/')) event.preventDefault();
  });
}

function saveBounds() {
  if (!win || win.isDestroyed() || smoke) return;
  const maximized = win.isMaximized();
  const normal = maximized ? settings.bounds : win.getBounds();
  settings = {
    ...settings,
    bounds: {
      ...(normal || win.getBounds()),
      maximized,
    },
  };
  persistSettings();
}

function registerIpc() {
  ipcMain.handle('app:info', () => ({
    version: version(),
    nodePath: runtime.nodePath,
    magicCli: runtime.magic.cli || runtime.magic.bin || '',
    magicRoot: runtime.magic.root || '',
    grokPath: runtime.grokPath,
    pty: runtime.pty,
    settings,
    home: app.getPath('home'),
    launch: smoke ? { project: null, file: null } : launch,
    examples: fs.existsSync(path.resolve(appRoot, '../MAGIC/examples'))
      ? path.resolve(appRoot, '../MAGIC/examples')
      : '',
  }));

  ipcMain.handle('app:closeResult', (_event, allow) => {
    if (!allow) return false;
    allowClose = true;
    saveBounds();
    win.close();
    return true;
  });

  ipcMain.handle('app:title', (_event, title) => {
    if (win && !win.isDestroyed()) win.setTitle(title ? `${title} — MAGIC Studio` : 'MAGIC Studio');
  });

  ipcMain.handle('dialog:folder', async (_event, title) => {
    const result = await dialog.showOpenDialog(win, {
      title: title || 'Open Folder',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:file', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Open File',
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:save', async (_event, options) => {
    const result = await dialog.showSaveDialog(win, {
      title: options?.title || 'Save',
      defaultPath: options?.defaultPath,
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });

  ipcMain.handle('settings:set', (_event, patch) => {
    settings = { ...settings, ...(patch || {}) };
    persistSettings();
    return settings;
  });

  ipcMain.handle('workspace:load', (_event, root) => {
    if (!root) return null;
    return loadJson(workspacePath(userData, root), null);
  });

  ipcMain.handle('workspace:save', (_event, payload) => {
    if (!payload?.root) return false;
    saveJson(workspacePath(userData, payload.root), payload.data || {});
    return true;
  });

  ipcMain.handle('project:remember', (_event, project) => {
    rememberProject(project);
    watchProject(project);
    return settings.recent;
  });

  ipcMain.handle('project:unwatch', () => {
    watchProject('');
    return true;
  });

  ipcMain.handle('fs:list', (_event, dir) => listDir(dir));
  ipcMain.handle('fs:read', (_event, payload) => readFile(payload.file, { force: payload.force }));
  ipcMain.handle('fs:write', (_event, payload) => writeFile(payload.file, payload.content ?? ''));
  ipcMain.handle('fs:create', async (_event, payload) => createEntry(payload.parent, payload.name, payload.kind));
  ipcMain.handle('fs:rename', (_event, payload) => renamePath(payload.from, payload.to));
  ipcMain.handle('fs:remove', (_event, file) => removePath(file));
  ipcMain.handle('fs:search', (_event, payload) => searchText(payload));
  ipcMain.handle('fs:quickList', (_event, root) => walkFiles(root));
  ipcMain.handle('fs:symbols', (_event, root) => indexSymbols(root));
  ipcMain.handle('git:info', (_event, root) => gitInfo(root));
  ipcMain.handle('npm:scripts', (_event, root) => readScripts(root));
  ipcMain.handle('project:create', (_event, payload) => createProject(payload.parent, payload.name));

  ipcMain.handle('shell:reveal', (_event, file) => {
    shell.showItemInFolder(file);
    return true;
  });
  ipcMain.handle('shell:open', (_event, url) => {
    shell.openExternal(url);
    return true;
  });

  ipcMain.handle('magic:check', (_event, payload) => checkSource({
    nodePath: runtime.nodePath,
    extraEnv: runtime.extraEnv,
    magic: runtime.magic,
    file: payload.file,
    strict: Boolean(payload.strict),
    content: payload.content,
  }));

  ipcMain.handle('run:start', (_event, payload) => {
    stopRun();
    const cwd = payload.cwd || payload.root || app.getPath('home');
    let spec;
    try {
      if (payload.kind === 'npm') {
        spec = { cmd: 'npm', args: ['run', payload.script], cwd, label: `npm run ${payload.script}` };
      } else if (payload.kind === 'custom') {
        const command = String(payload.command || '').trim();
        if (!command) throw new Error('The custom run command is empty.');
        spec = { cmd: 'bash', args: ['-lc', command], cwd, label: command };
      } else if (payload.kind === 'html') {
        openPreviewFile(payload.file);
        return { ok: true, label: path.basename(payload.file), html: true };
      } else {
        spec = runSpec(payload.file, {
          nodePath: runtime.nodePath,
          magic: runtime.magic,
          strict: Boolean(payload.strict),
          cwd,
        });
        if (spec.html) {
          openPreviewFile(payload.file);
          return { ok: true, label: spec.label, html: true };
        }
      }
    } catch (error) {
      return { ok: false, error: error.message };
    }
    const proc = startProcess(spec.cmd, spec.args, {
      cwd: spec.cwd,
      cols: payload.cols || 80,
      rows: payload.rows || 24,
      env: runtime.extraEnv,
    });
    runProc = proc;
    proc.onData((data) => send('run:data', data));
    proc.onExit((code) => {
      if (runProc === proc) runProc = null;
      send('run:exit', { code });
    });
    return { ok: true, label: spec.label, pty: proc.pty };
  });

  ipcMain.handle('run:write', (_event, data) => {
    if (runProc) runProc.write(data);
    return true;
  });
  ipcMain.handle('run:resize', (_event, payload) => {
    if (runProc) runProc.resize(payload.cols, payload.rows);
    return true;
  });
  ipcMain.handle('run:stop', () => {
    stopRun();
    return true;
  });

  ipcMain.handle('magic:preview', async (_event, file) => {
    const ext = path.extname(file).toLowerCase();
    if (ext === '.html' || ext === '.htm') {
      openPreviewFile(file);
      return { ok: true, html: true };
    }
    const packed = await packPreview({
      nodePath: runtime.nodePath,
      extraEnv: runtime.extraEnv,
      magic: runtime.magic,
      file,
    });
    if (!packed.ok) return packed;
    openPreviewFile(path.join(packed.dir, 'index.html'), packed.dir);
    return { ok: true, dir: packed.dir };
  });

  ipcMain.handle('term:create', (_event, payload) => {
    const id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const shellName = process.env.SHELL || 'bash';
    const proc = startProcess(shellName, ['-l'], {
      cwd: payload.cwd || app.getPath('home'),
      cols: payload.cols || 80,
      rows: payload.rows || 24,
    });
    terms.set(id, proc);
    proc.onData((data) => send('term:data', { id, data }));
    proc.onExit((code) => {
      terms.delete(id);
      send('term:exit', { id, code });
    });
    return { id, pty: proc.pty };
  });
  ipcMain.handle('term:write', (_event, payload) => {
    terms.get(payload.id)?.write(payload.data);
    return true;
  });
  ipcMain.handle('term:resize', (_event, payload) => {
    terms.get(payload.id)?.resize(payload.cols, payload.rows);
    return true;
  });
  ipcMain.handle('term:kill', (_event, id) => {
    const proc = terms.get(id);
    if (proc) {
      proc.kill();
      terms.delete(id);
    }
    return true;
  });

  ipcMain.handle('grok:models', () => new Promise((resolve) => {
    if (!runtime.grokPath) {
      resolve({ ok: false, models: [], error: 'Ask is not available on this machine.' });
      return;
    }
    const child = spawn(runtime.grokPath, ['models'], { env: process.env });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += chunk.toString(); });
    child.stderr.on('data', (chunk) => { err += chunk.toString(); });
    const timer = setTimeout(() => {
      child.kill();
    }, 8000);
    child.on('close', () => {
      clearTimeout(timer);
      const models = [];
      for (const line of `${out}\n${err}`.split('\n')) {
        const match = line.match(/^\s*[*+-]?\s*(grok-[\w.-]+)/);
        if (match) models.push(match[1]);
      }
      resolve({ ok: models.length > 0, models: [...new Set(models)], raw: out.trim() });
    });
    child.on('error', (error) => resolve({ ok: false, models: [], error: error.message }));
  }));

  ipcMain.handle('grok:start', (_event, payload) => {
    if (!runtime.grokPath) return { ok: false, error: 'Ask is not available on this machine.' };
    stopGrok();
    const cwd = payload.cwd || app.getPath('home');
    grokPrompt = writePrompt(String(payload.prompt || ''));
    const launchSpec = grokLaunch({
      grokPath: runtime.grokPath,
      promptFile: grokPrompt,
      cwd,
      mode: payload.mode === 'edit' ? 'edit' : 'ask',
      model: payload.model || '',
      resume: payload.resume || '',
    });
    const proc = startProcess(launchSpec.cmd, launchSpec.args, {
      cwd,
      cols: 100,
      rows: 30,
      env: { NO_COLOR: '1', FORCE_COLOR: '0' },
    });
    grokProc = proc;
    let buffer = '';
    proc.onData((data) => {
      buffer = pushGrokChunk(buffer, data, (event) => send('grok:event', event));
    });
    proc.onExit((code) => {
      if (buffer.trim()) {
        buffer = pushGrokChunk(`${buffer}\n`, '', (event) => send('grok:event', event));
      }
      if (grokProc === proc) grokProc = null;
      forgetPrompt(grokPrompt);
      grokPrompt = '';
      send('grok:event', { type: 'exit', code });
    });
    return { ok: true };
  });

  ipcMain.handle('grok:cancel', () => {
    stopGrok();
    send('grok:event', { type: 'exit', code: null, cancelled: true });
    return true;
  });

  ipcMain.handle('grok:session', (_event, payload) => {
    if (!runtime.grokPath) return { ok: false, error: 'Ask is not available on this machine.' };
    const id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const args = ['--cwd', payload.cwd || app.getPath('home')];
    if (payload.prompt) args.unshift(payload.prompt);
    const proc = startProcess(runtime.grokPath, args, {
      cwd: payload.cwd,
      cols: payload.cols || 100,
      rows: payload.rows || 30,
    });
    terms.set(id, proc);
    proc.onData((data) => send('term:data', { id, data }));
    proc.onExit((code) => {
      terms.delete(id);
      send('term:exit', { id, code });
    });
    return { ok: true, id, pty: proc.pty };
  });

  ipcMain.on('smoke:ready', async () => {
    if (!smoke || !win) return;
    try {
      const result = await win.webContents.executeJavaScript(`({
        lang: monaco.languages.getLanguages().some((item) => item.id === 'magic'),
        editor: !!document.querySelector('.monaco-editor'),
        theme: document.body.dataset.theme || ''
      })`);
      console.log(`SMOKE ${JSON.stringify(result)}`);
      app.exit(result.lang && result.editor ? 0 : 1);
    } catch (error) {
      console.log(`SMOKE ${JSON.stringify({ error: String(error) })}`);
      app.exit(1);
    }
  });
}

function openPreviewFile(file, dir) {
  if (previewWin && !previewWin.isDestroyed()) previewWin.close();
  if (previewDir && previewDir !== dir) {
    fs.rm(previewDir, { recursive: true, force: true }, () => {});
  }
  previewDir = dir || '';
  previewWin = new BrowserWindow({
    width: 960,
    height: 720,
    title: 'MAGIC Preview',
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    icon: path.join(appRoot, 'assets', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  previewWin.loadFile(file);
  previewWin.on('closed', () => {
    previewWin = null;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const next = projectFromArgv(argv);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      if (next.project) send('app:open', next);
    }
  });

  app.whenReady().then(async () => {
    userData = app.getPath('userData');
    settingsFile = path.join(userData, 'settings.json');
    settings = loadJson(settingsFile, DEFAULTS);
    runtime.nodePath = findNode() || process.execPath;
    runtime.extraEnv = nodeEnv(runtime.nodePath);
    runtime.magic = findMagic(appRoot);
    runtime.grokPath = findGrok();
    runtime.pty = await loadPty();
    if (!smoke) launch = projectFromArgv(process.argv);
    if (!launch.project && settings.reopenLast && settings.lastProject && fs.existsSync(settings.lastProject)) {
      launch = { project: settings.lastProject, file: null };
    }

    protocol.handle('studio', async (request) => {
      const file = fromStudioUrl(request.url);
      if (!file) return new Response('forbidden', { status: 403 });
      try {
        const data = await fs.promises.readFile(file);
        const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
        return new Response(data, { headers: { 'Content-Type': type } });
      } catch {
        return new Response('missing', { status: 404 });
      }
    });

    registerIpc();
    buildMenu();
    createWindow();
  });

  app.on('window-all-closed', () => {
    stopRun();
    stopGrok();
    killTerms();
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    allowClose = true;
    stopRun();
    stopGrok();
    killTerms();
  });
}

