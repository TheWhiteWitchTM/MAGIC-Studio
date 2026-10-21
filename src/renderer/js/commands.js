import { state, register, baseName, listCommands, run, typeMode } from './state.js';
import {
  activeTab,
  checkTab,
  closeActive,
  closeAll,
  currentFileLabel,
  cursorLabel,
  cycleIndent,
  goToDefinition,
  jumpBack,
  jumpForward,
  nextTab,
  mergeProblems,
  noteDisk,
  openPath,
  openUntitled,
  problems,
  runWorkingDirectory,
  saveAll,
  saveTab,
  scanSymbols,
  selectionText,
  toggleEol,
  toggleMinimap,
  toggleWrap,
  trigger,
} from './editor.js';
import { refreshTree, revealInTree, setRoot } from './tree.js';
import {
  beginRun,
  fitAll,
  focusBottom,
  openTerminal,
  renderProblems,
  runFailedToStart,
  runSize,
  setTermTheme,
} from './bottom.js';
import { focusSearch, findInFiles } from './search.js';
import {
  askProblems,
  explainFile,
  explainSelection,
  focusGrok,
  grokSnapshot,
  newChat,
  openSession,
  restoreGrok,
} from './grok.js';
import { closePalette, openChoices, openHelp, openPalette, openQuick, openRecent } from './palette.js';
import { toggleTheme } from './theme.js';
import { installSteps } from '../../shared/ollama.js';
import { ask, toast } from './ui.js';

let workspaceTimer = 0;

export function registerAll() {
  const file = 'File';
  const edit = 'Edit';
  const view = 'View';
  const runGroup = 'Run';
  const ask = 'Ask';

  register('project.open', () => openFolder(), { title: 'Open folder', shortcut: 'Ctrl+O', group: file });
  register('project.create', () => createProject(), { title: 'New MAGIC project', group: file });
  register('project.examples', () => openExamples(), { title: 'Open MAGIC examples', group: file });
  register('project.close', () => closeProject(), { title: 'Close folder', shortcut: 'Ctrl+Shift+W', group: file });
  register('file.open', () => openLooseFile(), { title: 'Open file', shortcut: 'Ctrl+Shift+O', group: file });
  register('file.openPath', (filePath) => openPath(filePath), { title: 'Open path', group: file, menu: false });
  register('file.new', () => openUntitled(), { title: 'New MAGIC file', shortcut: 'Alt+Insert', group: file });
  register('file.newInTree', () => document.querySelector('#tree')?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 80, clientY: 120 })), { title: 'New file in folder', group: file });
  register('file.save', () => saveTab(), { title: 'Save', shortcut: 'Ctrl+S', group: file });
  register('file.saveAll', () => saveAll(), { title: 'Save all', shortcut: 'Ctrl+Shift+S', group: file });
  register('file.close', () => closeActive(), { title: 'Close editor', shortcut: 'Ctrl+W', group: file });

  register('edit.find', () => trigger('actions.find'), { title: 'Find', shortcut: 'Ctrl+F', group: edit });
  register('edit.replace', () => trigger('editor.action.startFindReplaceAction'), { title: 'Replace', shortcut: 'Ctrl+R', group: edit });
  register('edit.duplicate', () => trigger('editor.action.copyLinesDownAction'), { title: 'Duplicate line', shortcut: 'Ctrl+D', group: edit });
  register('edit.deleteLine', () => trigger('editor.action.deleteLines'), { title: 'Delete line', shortcut: 'Ctrl+Y', group: edit });
  register('edit.comment', () => trigger('editor.action.commentLine'), { title: 'Comment line', shortcut: 'Ctrl+/', group: edit });
  register('edit.rename', () => trigger('editor.action.rename'), { title: 'Rename', shortcut: 'Shift+F6', group: edit });
  register('edit.definition', () => goToDefinition(), { title: 'Go to declaration', shortcut: 'Ctrl+B', group: edit });
  register('edit.usages', () => findUsages(), { title: 'Find usages', shortcut: 'Alt+F7', group: edit });
  register('nav.back', () => jumpBack(), { title: 'Back', shortcut: 'Alt+Left', group: edit });
  register('nav.forward', () => jumpForward(), { title: 'Forward', shortcut: 'Alt+Right', group: edit });

  register('palette.open', () => openPalette(), { title: 'Command palette', shortcut: 'Ctrl+Shift+A', group: view });
  register('quick.open', () => openQuick(), { title: 'Quick open', shortcut: 'Ctrl+P', group: view });
  register('quick.recent', () => openRecent(), { title: 'Recent files', shortcut: 'Ctrl+E', group: view });
  register('sidebar.explorer', () => showSide('explorer'), { title: 'Explorer', shortcut: 'Alt+1', group: view });
  register('sidebar.search', () => { showSide('search'); focusSearch(); }, { title: 'Search', shortcut: 'Alt+3', group: view });
  register('sidebar.outline', () => showSide('outline'), { title: 'Structure', shortcut: 'Alt+7', group: view });
  register('search.open', () => { showSide('search'); focusSearch(selectionText()); }, { title: 'Find in files', shortcut: 'Ctrl+Shift+F', group: view });
  register('view.wrap', () => toggleWrap(), { title: 'Toggle word wrap', shortcut: 'Alt+Z', group: view });
  register('view.minimap', () => toggleMinimap(), { title: 'Toggle minimap', group: view });
  register('view.indent', () => cycleIndent(), { title: 'Cycle indent size', group: view });
  register('view.eol', () => toggleEol(), { title: 'Toggle line endings', group: view });
  register('view.theme', () => toggleTheme(), { title: 'Toggle theme', group: view });
  register('view.complete', () => toggleComplete(), { title: 'Toggle ghost text', group: view });
  register('grok.toggle', () => toggleGrok(), { title: 'Toggle Ask panel', shortcut: 'Alt+9', group: ask });
  register('terminal.toggle', () => toggleTerminal(), { title: 'Terminal', shortcut: 'Alt+F12', group: view });
  register('help.keys', () => openHelp(), { title: 'Keyboard shortcuts', group: 'Help' });
  register('help.local', () => showLocalHelp(), { title: 'Local AI', group: 'Help' });
  register('help.about', () => showAbout(), { title: 'About MAGIC Studio', group: 'Help' });

  register('run.start', () => startRun(), { title: 'Run', shortcut: 'Shift+F10', group: runGroup });
  register('run.preview', () => preview(), { title: 'Preview', shortcut: 'Ctrl+Shift+F10', group: runGroup });
  register('run.stop', () => stopRun(), { title: 'Stop', shortcut: 'Ctrl+F2', group: runGroup });
  register('run.check', () => checkTab(activeTab(), { quiet: false }), { title: 'Check', shortcut: 'Ctrl+F9', group: runGroup });
  register('run.config', (value) => setRunConfig(value), { title: 'Select run configuration', group: runGroup, menu: false });

  register('grok.focus', () => focusGrok(), { title: 'Ask', group: ask });
  register('grok.explainFile', () => explainFile(), { title: 'Explain file', group: ask });
  register('grok.explainSelection', () => explainSelection(), { title: 'Explain selection', group: ask });
  register('grok.problems', () => askProblems(), { title: 'Look for problems', group: ask });
  if (state.info?.grokPath) {
    register('grok.session', () => openSession(), { title: 'Open session in terminal', group: ask });
  }
  register('grok.new', () => newChat(), { title: 'New chat', group: ask });
  register('tab.next', () => nextTab(1), { title: 'Next editor', shortcut: 'Ctrl+Tab', group: view });
  buildMenus();
  register('tab.prev', () => nextTab(-1), { title: 'Previous editor', shortcut: 'Ctrl+Shift+Tab', group: view });
}

export async function openFolder(dir) {
  let folder = dir;
  if (!folder) folder = await window.studio.openFolder('Open Folder');
  if (!folder) return;
  if (state.project && state.project !== folder) {
    const closed = await closeAll();
    if (!closed) return;
  }
  state.project = folder;
  state.symbolsFresh = false;
  state.fileIndex = null;
  state.problems = [];
  await window.studio.remember(folder);
  await setRoot(folder);
  const workspace = await window.studio.workspaceLoad(folder);
  restoreWorkspace(workspace);
  await loadRunConfigs();
  refreshGit();
  document.getElementById('welcome').hidden = true;
  document.getElementById('empty').hidden = Boolean(state.active);
  state.hooks.layout?.();
  state.hooks.refreshStatus?.();
  const tabs = workspace?.tabs || [];
  const active = workspace?.active;
  for (const file of tabs) {
    if (file && file !== active) await openPath(file, { record: false, focus: false });
  }
  if (active) await openPath(active, { record: false });
  if (workspace?.grok) restoreGrok(workspace.grok);
  renderProblems();
  saveWorkspace();
}

async function openExamples() {
  const examples = state.info?.examples;
  if (!examples) {
    toast('The MAGIC examples folder was not found');
    return;
  }
  await openFolder(examples);
}

async function createProject() {
  const parent = await window.studio.openFolder('Choose where to create the project');
  if (!parent) return;
  const answer = await ask({
    title: 'New MAGIC project',
    message: 'A folder with hello.magic.',
    input: true,
    value: 'hello',
    buttons: [
      { id: 'cancel', label: 'Cancel' },
      { id: 'ok', label: 'Create', primary: true },
    ],
  });
  if (!answer || !answer.value.trim()) return;
  try {
    const created = await window.studio.createProject(parent, answer.value.trim());
    await openFolder(created.dir);
    await openPath(created.file);
  } catch (error) {
    toast(error.message || 'Could not create the project');
  }
}

async function closeProject() {
  const closed = await closeAll();
  if (!closed) return;
  state.project = null;
  state.problems = [];
  await window.studio.unwatch();
  document.getElementById('tree').innerHTML = '';
  document.getElementById('welcome').hidden = false;
  document.getElementById('empty').hidden = true;
  fillRecent();
  state.hooks.refreshStatus?.();
  state.hooks.layout?.();
  window.studio.setTitle('');
}

async function openLooseFile() {
  const file = await window.studio.openFileDialog();
  if (!file) return;
  if (!state.project) await openFolder(fileDir(file));
  await openPath(file);
}

function fileDir(file) {
  const index = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'));
  return index > 0 ? file.slice(0, index) : file;
}

function showSide(name) {
  if (state.sidebar === name && state.sideOpen) state.sideOpen = false;
  else {
    state.sidebar = name;
    state.sideOpen = true;
  }
  state.hooks.layout?.();
  if (name === 'outline') state.hooks.refreshOutline?.();
  saveWorkspace();
}

function canAsk() {
  return Boolean(state.info?.grokPath || state.info?.ollama?.ok);
}

function toggleComplete() {
  state.settings.inlineComplete = state.settings.inlineComplete === false;
  window.studio.settingsSet({ inlineComplete: state.settings.inlineComplete });
  state.editor?.updateOptions({ inlineSuggest: { enabled: state.settings.inlineComplete !== false } });
  refreshStatus();
  if (state.settings.inlineComplete && !state.info?.ollama?.completeModel) {
    toast('Ghost text is on. It starts when the complete model is installed. Help → Local AI.');
    return;
  }
  toast(state.settings.inlineComplete ? 'Ghost text on' : 'Ghost text off');
}

function showLocalHelp() {
  ask({
    title: 'Local AI',
    message: installSteps(state.info?.aiDir),
    wide: true,
    buttons: [{ id: 'ok', label: 'Close', primary: true }],
  });
}

const AUTHOR_LINKS = [
  ['X', 'https://x.com/TheWhiteWitchTM'],
  ['thewhitewitchtm@google.com', 'mailto:thewhitewitchtm@google.com'],
  ['GitHub', 'https://github.com/TheWhiteWitchTM'],
  ['YouTube', 'https://youtube.com/@TheWhiteWitchTM'],
  ['Bluesky', 'https://bsky.app/profile/thewhitewitchtm.sociallydead.me'],
  ['Site', 'https://thewhitewitchtm.github.io/whitewitch/'],
];

function showAbout() {
  const info = state.info || {};
  ask({
    title: 'MAGIC Studio',
    wide: true,
    buttons: [{ id: 'ok', label: 'Close', primary: true }],
    fill(body, close) {
      const kicker = document.createElement('p');
      kicker.className = 'about-kicker';
      kicker.textContent = `Alpha · ${info.version || '0.1.0'}`;
      const copy = document.createElement('p');
      copy.className = 'about-copy';
      copy.textContent = 'A dark IDE for the MAGIC language. This is alpha work. The editor, the run console, and the language can still change.';
      const name = document.createElement('p');
      name.className = 'about-name';
      name.textContent = 'Mira';
      const role = document.createElement('p');
      role.className = 'about-role';
      role.textContent = 'The White Witch™';
      const links = document.createElement('div');
      links.className = 'about-links';
      for (const [label, href] of AUTHOR_LINKS) {
        links.appendChild(externalLink(href, label));
      }
      const license = document.createElement('a');
      license.href = info.licenseFile || 'https://github.com/TheWhiteWitchTM/MAGIC-Studio/blob/main/LICENSE';
      license.textContent = 'MIT License';
      license.addEventListener('click', (event) => {
        event.preventDefault();
        const file = info.licenseFile;
        close('ok');
        if (file) openPath(file);
        else window.studio.openExternal('https://github.com/TheWhiteWitchTM/MAGIC-Studio/blob/main/LICENSE');
      });
      links.appendChild(license);
      const facts = document.createElement('p');
      facts.className = 'about-facts';
      const models = (info.ollama?.models || []).join(', ');
      facts.textContent = [
        info.magicCli ? `MAGIC  ${info.magicCli}` : 'MAGIC compiler was not found',
        info.ollama?.ok
          ? `Local AI  Ollama ${info.ollama.version}  ${models || 'no model yet'}`
          : 'Local AI  Ollama is not running',
        info.pty ? 'Terminal  full PTY' : 'Terminal  basic pipe',
      ].join('\n');
      body.append(kicker, copy, name, role, links, facts);
    },
  });
}

function externalLink(href, label) {
  const link = document.createElement('a');
  link.href = href;
  link.textContent = label;
  link.addEventListener('click', (event) => {
    event.preventDefault();
    window.studio.openExternal(href);
  });
  return link;
}

let openMenu = null;

function closeMenu() {
  openMenu?.remove();
  openMenu = null;
  for (const button of document.querySelectorAll('.menubar > button.open')) button.classList.remove('open');
}

function buildMenus() {
  const host = document.getElementById('menubar');
  if (!host) return;
  host.innerHTML = '';
  const groups = new Map();
  for (const command of listCommands()) {
    if (!groups.has(command.group)) groups.set(command.group, []);
    if (command.menu === false) continue;
    groups.get(command.group).push(command);
  }
  for (const name of ['File', 'Edit', 'View', 'Run', 'Ask', 'Help']) {
    const items = groups.get(name);
    if (!items?.length) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = name;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (button.classList.contains('open')) {
        closeMenu();
        return;
      }
      closeMenu();
      const pop = document.createElement('div');
      pop.className = 'menu-pop';
      pop.setAttribute('role', 'menu');
      for (const command of items) {
        const item = document.createElement('button');
        item.type = 'button';
        const label = document.createElement('span');
        label.textContent = command.title;
        const shortcut = document.createElement('span');
        shortcut.className = 'menu-key';
        shortcut.textContent = command.shortcut || '';
        item.append(label, shortcut);
        item.addEventListener('click', () => {
          closeMenu();
          run(command.id);
        });
        pop.appendChild(item);
      }
      document.body.appendChild(pop);
      const rect = button.getBoundingClientRect();
      pop.style.left = `${Math.max(4, rect.left)}px`;
      pop.style.top = `${rect.bottom + 2}px`;
      button.classList.add('open');
      openMenu = pop;
    });
    host.appendChild(button);
  }
}

function toggleGrok() {
  if (!canAsk()) {
    showLocalHelp();
    return;
  }
  state.grokOpen = !state.grokOpen;
  state.hooks.layout?.();
  saveWorkspace();
}

async function toggleTerminal() {
  if (state.bottomOpen && state.bottomTab === 'terminal') {
    state.bottomOpen = false;
    layout();
    saveWorkspace();
    return;
  }
  await openTerminal();
}

async function startRun() {
  const config = document.getElementById('run-config').value || 'current';
  const cwd = state.project || runWorkingDirectory(activeTab()?.path || '');
  const size = runSize();
  let payload;
  if (config === 'custom') {
    const command = document.getElementById('run-custom').value.trim();
    payload = { kind: 'custom', command, cwd, ...size };
  } else if (config.startsWith('npm:')) {
    payload = { kind: 'npm', script: config.slice(4), cwd, ...size };
  } else if (config === 'preview') {
    await preview();
    return;
  } else {
    const tab = activeTab();
    if (!tab?.path) {
      toast('Save the file, then run it');
      return;
    }
    if (tab.dirty) await saveTab(tab);
    payload = {
      kind: 'file',
      file: tab.path,
      cwd: runWorkingDirectory(tab.path),
      strict: typeMode() === 'strict',
      types: typeMode(),
      ...size,
    };
  }
  const result = await window.studio.runStart(payload);
  if (!result?.ok) {
    runFailedToStart(result?.error || 'Could not start');
    return;
  }
  if (result.html) {
    beginRun(result.label || 'preview');
    return;
  }
  beginRun(result.label || 'run');
}

async function preview() {
  const tab = activeTab();
  if (!tab?.path) {
    toast('Save a MAGIC file, then preview it');
    return;
  }
  if (tab.dirty) await saveTab(tab);
  focusBottom('run');
  beginRun(`preview ${baseName(tab.path)}`);
  const result = await window.studio.preview(tab.path);
  if (!result?.ok) {
    runFailedToStart(result?.error || 'Preview failed');
    if (result?.problems?.length) {
      mergeProblems(tab.path, result.problems);
      renderProblems();
      focusBottom('problems');
    }
    return;
  }
  document.getElementById('run-status').textContent = 'window open';
  document.getElementById('run-stop').disabled = true;
  state.running = false;
}

async function stopRun() {
  await window.studio.runStop();
  state.running = false;
  document.getElementById('run-stop').disabled = true;
  document.getElementById('run-status').textContent = 'stopped';
}

function setRunConfig(value) {
  state.runConfig = value;
  const custom = document.getElementById('run-custom');
  custom.hidden = value !== 'custom';
  saveWorkspace();
}

export async function loadRunConfigs() {
  const select = document.getElementById('run-config');
  const current = state.runConfig || 'current';
  select.innerHTML = '';
  addOption(select, 'current', 'Current file');
  addOption(select, 'preview', 'Preview window');
  if (state.project) {
    try {
      const scripts = await window.studio.npmScripts(state.project);
      for (const script of scripts) addOption(select, `npm:${script}`, `npm run ${script}`);
    } catch {
      /* no package.json */
    }
  }
  addOption(select, 'custom', 'Custom command');
  if ([...select.options].some((option) => option.value === current)) select.value = current;
  document.getElementById('run-custom').value = state.customCommand || '';
  document.getElementById('run-custom').hidden = select.value !== 'custom';
}

function addOption(select, value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.appendChild(option);
}

function findUsages() {
  const tab = activeTab();
  const word = selectionText().trim() || wordAtCursor();
  if (!word) {
    toast('Put the cursor on a name');
    return;
  }
  showSide('search');
  const include = tab?.path?.endsWith('.magic') ? '*.magic' : '';
  document.getElementById('search-include').value = include;
  document.getElementById('search-regex').checked = true;
  document.getElementById('search-query').value = `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`;
  findInFiles();
}

function wordAtCursor() {
  const tab = activeTab();
  if (!tab?.model || !state.editor) return '';
  const position = state.editor.getPosition();
  const word = tab.model.getWordAtPosition(position);
  return word?.word || '';
}

export function refreshOutline() {
  const host = document.getElementById('outline');
  host.innerHTML = '';
  const tab = activeTab();
  const symbols = scanSymbols(tab?.model);
  if (!symbols.length) {
    host.innerHTML = '<p class="side-empty">No structure in this file.</p>';
    return;
  }
  for (const symbol of symbols) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'outline-row';
    row.innerHTML = `<span class="kind">${symbol.kind}</span><span>${escapeText(symbol.name)}</span>`;
    row.addEventListener('click', () => {
      if (tab?.path) openPath(tab.path, { line: symbol.line, column: symbol.column || 1, record: true });
      else {
        state.editor.setPosition({ lineNumber: symbol.line, column: symbol.column || 1 });
        state.editor.revealLineInCenter(symbol.line);
        state.editor.focus();
      }
    });
    host.appendChild(row);
  }
}

function escapeText(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

export function refreshStatus() {
  const cursor = cursorLabel();
  document.getElementById('status-line').textContent = `${cursor.line}:${cursor.column}`;
  document.getElementById('status-lang').textContent = cursor.language || '—';
  document.getElementById('status-eol').textContent = cursor.eol;
  document.getElementById('status-indent').textContent = `Spaces: ${cursor.indent}`;
  const themeButton = document.getElementById('status-theme');
  if (themeButton) themeButton.textContent = state.settings.theme === 'light' ? 'Light' : 'Black';
  const completeButton = document.getElementById('status-complete');
  if (completeButton) {
    const on = state.settings.inlineComplete !== false;
    completeButton.textContent = on ? 'Complete' : 'Complete off';
    completeButton.classList.toggle('on', on);
  }
  const count = problems().length;
  const problemsEl = document.getElementById('status-problems');
  problemsEl.textContent = count ? `${count} problem${count === 1 ? '' : 's'}` : 'No problems';
  problemsEl.classList.toggle('bad', count > 0);
  document.getElementById('status-pty').textContent = state.info?.pty ? 'PTY' : 'pipe';
  const label = currentFileLabel();
  window.studio.setTitle(label);
  document.getElementById('crumb').textContent = label;
}

export async function refreshGit() {
  const host = document.getElementById('status-branch');
  if (!state.project) {
    host.textContent = '';
    return;
  }
  const info = await window.studio.gitInfo(state.project);
  host.textContent = info ? `${info.branch}${info.dirty ? ` *${info.dirty}` : ''}` : '';
}

export function layout() {
  const app = document.getElementById('app');
  app.classList.toggle('no-side', !state.sideOpen);
  app.classList.toggle('no-grok', !state.grokOpen);
  app.style.setProperty('--side', state.sideOpen ? `${state.sideW}px` : '0px');
  app.style.setProperty('--grok', state.grokOpen ? `${state.grokW}px` : '0px');
  app.style.setProperty('--bottom', state.bottomOpen ? `${state.bottomH}px` : '32px');
  for (const name of ['explorer', 'search', 'outline']) {
    document.getElementById(`side-${name}`).hidden = state.sidebar !== name;
    document.querySelector(`[data-side="${name}"]`).classList.toggle('active', state.sidebar === name && state.sideOpen);
  }
  document.getElementById('bottom').classList.toggle('collapsed', !state.bottomOpen);
  for (const name of ['run', 'problems', 'terminal']) {
    document.getElementById(`${name}-view`).hidden = state.bottomTab !== name;
    document.querySelector(`[data-bottom="${name}"]`).classList.toggle('active', state.bottomTab === name);
  }
  fitAll();
}

export function fillRecent() {
  const host = document.getElementById('recent');
  host.innerHTML = '';
  const recent = state.settings?.recent || [];
  if (!recent.length) return;
  const title = document.createElement('h3');
  title.textContent = 'Recent';
  host.appendChild(title);
  for (const folder of recent) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'recent-row';
    button.textContent = folder;
    button.addEventListener('click', () => openFolder(folder));
    host.appendChild(button);
  }
}

function restoreWorkspace(workspace) {
  if (!workspace) return;
  if (workspace.sidebar) state.sidebar = workspace.sidebar;
  if (typeof workspace.sideOpen === 'boolean') state.sideOpen = workspace.sideOpen;
  if (typeof workspace.grokOpen === 'boolean') state.grokOpen = workspace.grokOpen;
  if (!canAsk()) state.grokOpen = false;
  if (typeof workspace.bottomOpen === 'boolean') state.bottomOpen = workspace.bottomOpen;
  if (workspace.bottomTab) state.bottomTab = workspace.bottomTab;
  if (workspace.sizes?.side) state.sideW = workspace.sizes.side;
  if (workspace.sizes?.bottom) {
    const saved = workspace.sizes.bottom;
    state.bottomH = saved === 248 || saved === 182 ? 150 : saved;
  }
  if (workspace.sizes?.grok) state.grokW = workspace.sizes.grok;
  if (workspace.runConfig) state.runConfig = workspace.runConfig;
  if (typeof workspace.customCommand === 'string') state.customCommand = workspace.customCommand;
  layout();
}

export function saveWorkspace() {
  clearTimeout(workspaceTimer);
  workspaceTimer = setTimeout(() => {
    if (!state.project) return;
    const data = {
      tabs: state.tabs.map((tab) => tab.path).filter(Boolean).slice(0, 20),
      active: state.active?.path || null,
      sidebar: state.sidebar,
      sideOpen: state.sideOpen,
      grokOpen: state.grokOpen,
      bottomOpen: state.bottomOpen,
      bottomTab: state.bottomTab,
      sizes: { side: state.sideW, bottom: state.bottomH, grok: state.grokW },
      runConfig: document.getElementById('run-config')?.value || state.runConfig,
      customCommand: document.getElementById('run-custom')?.value || '',
      grok: grokSnapshot(),
    };
    window.studio.workspaceSave(state.project, data);
  }, 300);
}

export function wireHooks() {
  state.hooks.layout = layout;
  state.hooks.refreshStatus = refreshStatus;
  state.hooks.refreshOutline = refreshOutline;
  state.hooks.saveWorkspace = saveWorkspace;
  state.hooks.focusBottom = focusBottom;
  state.hooks.onTheme = (name) => setTermTheme(name);
  state.hooks.pickDefinition = (choices) => {
    openChoices('Declarations', choices.map((choice) => ({
      title: choice.label,
      detail: choice.detail,
      file: choice.file,
      line: choice.line,
      column: choice.column,
    })), (item) => openPath(item.file, { line: item.line, column: item.column }));
  };
}

export async function confirmClose() {
  const closed = await closeAll();
  await window.studio.closeResult(closed);
}

export function bindChrome() {
  document.getElementById('run-config').addEventListener('change', (event) => setRunConfig(event.target.value));
  document.getElementById('run-custom').addEventListener('change', (event) => {
    state.customCommand = event.target.value;
    saveWorkspace();
  });
  const typeSelect = document.getElementById('run-types');
  typeSelect.value = typeMode();
  typeSelect.addEventListener('change', (event) => {
    const types = event.target.value;
    state.settings.types = types;
    state.settings.strict = types === 'strict';
    window.studio.settingsSet({ types, strict: state.settings.strict });
  });
  document.getElementById('run-stop').disabled = true;
  for (const button of document.querySelectorAll('[data-cmd]')) {
    button.addEventListener('click', () => run(button.dataset.cmd));
  }
  for (const button of document.querySelectorAll('[data-side]')) {
    button.addEventListener('click', () => showSide(button.dataset.side));
  }
  for (const button of document.querySelectorAll('[data-bottom]')) {
    button.addEventListener('click', () => {
      const name = button.dataset.bottom;
      if (state.bottomTab === name && state.bottomOpen) state.bottomOpen = false;
      else {
        state.bottomTab = name;
        state.bottomOpen = true;
        if (name === 'terminal' && !document.getElementById('term-tabs').children.length) openTerminal();
      }
      layout();
      saveWorkspace();
    });
  }
  document.getElementById('status-problems').addEventListener('click', () => {
    state.bottomTab = 'problems';
    state.bottomOpen = true;
    renderProblems();
    layout();
  });
  document.getElementById('status-indent').addEventListener('click', () => cycleIndent());
  document.getElementById('status-eol').addEventListener('click', () => toggleEol());
  splitter(document.getElementById('split-side'), 'x', () => state.sideW, (value) => {
    state.sideW = clamp(value, 180, 520);
    state.sideOpen = true;
    layout();
  });
  splitter(document.getElementById('split-grok'), 'x', () => state.grokW, (value) => {
    state.grokW = clamp(value, 260, 640);
    state.grokOpen = true;
    layout();
  }, true);
  splitter(document.getElementById('split-bottom'), 'y', () => state.bottomH, (value) => {
    state.bottomH = clamp(value, 120, 560);
    state.bottomOpen = true;
    layout();
  }, true);
  document.addEventListener('mousedown', (event) => {
    if (!openMenu) return;
    if (event.target.closest('.menu-pop') || event.target.closest('.menubar')) return;
    closeMenu();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && openMenu) {
      closeMenu();
      return;
    }
    onKey(event);
  });
  window.addEventListener('dragover', (event) => event.preventDefault());
  window.addEventListener('drop', onDrop);
  window.studio.on('menu:command', (id) => {
    if (!document.getElementById('palette').hidden && id !== 'palette.open') closePalette();
    run(id);
  });
  window.studio.on('fs:event', (event) => onDisk(event.path));
  window.studio.on('app:requestClose', () => confirmClose());
  window.studio.on('app:open', (payload) => {
    if (payload?.project) openFolder(payload.project).then(() => payload.file && openPath(payload.file));
  });
}

function splitter(el, axis, get, set, invert = false) {
  if (!el) return;
  el.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const start = axis === 'x' ? event.clientX : event.clientY;
    const base = get();
    const move = (next) => {
      const delta = (axis === 'x' ? next.clientX : next.clientY) - start;
      set(base + (invert ? -delta : delta));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      saveWorkspace();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function onKey(event) {
  if (!document.getElementById('palette').hidden) return;
  if (!document.getElementById('modal').hidden) return;
  const key = event.key;
  const ctrl = event.ctrlKey || event.metaKey;
  if (ctrl && event.shiftKey && key.toLowerCase() === 'p') {
    event.preventDefault();
    openPalette();
    return;
  }
  if (ctrl && key === 'Tab') {
    event.preventDefault();
    nextTab(event.shiftKey ? -1 : 1);
    return;
  }
  if (ctrl && event.code === 'Backquote') {
    event.preventDefault();
    run('terminal.toggle');
    return;
  }
  if (event.altKey && !ctrl && key === 'F7') {
    event.preventDefault();
    run('edit.usages');
    return;
  }
  if (event.altKey && !ctrl && key === 'ArrowLeft') {
    event.preventDefault();
    jumpBack();
    return;
  }
  if (event.altKey && !ctrl && key === 'ArrowRight') {
    event.preventDefault();
    jumpForward();
  }
}

async function onDrop(event) {
  event.preventDefault();
  const files = [...(event.dataTransfer?.files || [])];
  for (const file of files) {
    const filePath = window.studio.pathForFile(file);
    if (!filePath) continue;
    const data = await window.studio.readFile(filePath);
    if (data.directory) {
      await openFolder(filePath);
      continue;
    }
    if (!state.project) await openFolder(fileDir(filePath));
    await openPath(filePath);
  }
}

async function onDisk(file) {
  if (!file || file.includes('.magic-studio-check')) return;
  state.symbolsFresh = false;
  state.fileIndex = null;
  await refreshTree(file);
  await noteDisk(file);
  refreshGit();
}

export function afterTabsChanged() {
  refreshStatus();
  refreshOutline();
  renderProblems();
  revealInTree(state.active?.path);
  document.getElementById('welcome').hidden = Boolean(state.project);
  document.getElementById('empty').hidden = Boolean(state.active) || !state.project;
  saveWorkspace();
}

