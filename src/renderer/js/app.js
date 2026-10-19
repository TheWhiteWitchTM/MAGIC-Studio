import { state } from './state.js';
import { applySettings, initEditor, openPath } from './editor.js';
import { initTree } from './tree.js';
import { initBottom, renderProblems } from './bottom.js';
import { initSearch } from './search.js';
import { initGrok } from './grok.js';
import { initPalette } from './palette.js';
import { applyTheme } from './theme.js';
import {
  afterTabsChanged,
  bindChrome,
  fillRecent,
  layout,
  loadRunConfigs,
  openFolder,
  refreshOutline,
  refreshStatus,
  registerAll,
  wireHooks,
} from './commands.js';

export async function start() {
  if (!window.studio) throw new Error('The studio bridge did not load.');
  state.info = await window.studio.getInfo();
  state.settings = state.info.settings || {};
  if (state.settings.theme !== 'light') state.settings.theme = 'black';
  applyTheme(state.settings.theme);
  const askButton = document.querySelector('[data-cmd="grok.toggle"]');
  if (askButton) askButton.hidden = false;
  wireHooks();
  initEditor({
    onTabs: afterTabsChanged,
    onCursor: refreshStatus,
    onOutline: refreshOutline,
    onProblems() {
      refreshStatus();
      renderProblems();
    },
  });
  initTree();
  initBottom();
  initSearch();
  initGrok();
  initPalette();
  registerAll();
  bindChrome();
  applySettings();
  layout();
  fillRecent();
  await loadRunConfigs();
  const splash = document.getElementById('splash');
  splash.hidden = true;
  if (location.search.includes('smoke=1')) {
    window.studio.smokeReady();
    return;
  }
  const launch = state.info.launch;
  if (launch?.project) await openFolder(launch.project);
  if (launch?.file) await openPath(launch.file);
  if (!state.project) document.getElementById('welcome').hidden = false;
  refreshStatus();
}
