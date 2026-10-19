import { state, relativePath } from './state.js';
import { activeTab, refreshOpenFromDisk, selectionText } from './editor.js';
import { focusBottom, mountTerm, terminalSize } from './bottom.js';
import { renderMarkdown, toast } from './ui.js';

export function initGrok() {
  state.grok = state.grok || {
    messages: [],
    busy: false,
    sessionId: '',
    mode: state.settings.grokMode || 'ask',
  };
  const mode = document.getElementById('grok-mode');
  mode.value = state.grok.mode === 'edit' ? 'edit' : 'ask';
  mode.addEventListener('change', () => {
    state.grok.mode = mode.value;
    state.settings.grokMode = mode.value;
    window.studio.settingsSet({ grokMode: mode.value });
    document.getElementById('grok-note').textContent = mode.value === 'edit'
      ? 'Edit can change files in this folder.'
      : 'Ask reads the project and does not edit it.';
  });
  document.getElementById('grok-note').textContent = mode.value === 'edit'
    ? 'Edit can change files in this folder.'
    : 'Ask reads the project and does not edit it.';
  document.getElementById('grok-form').addEventListener('submit', (event) => {
    event.preventDefault();
    submit();
  });
  document.getElementById('grok-send').addEventListener('click', () => submit());
  document.getElementById('grok-stop').addEventListener('click', () => window.studio.grokCancel());
  document.getElementById('grok-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  });
  window.studio.on('grok:event', onEvent);
  loadModels();
  renderLog();
}

async function loadModels() {
  const select = document.getElementById('grok-model');
  select.innerHTML = '<option value="">Default model</option>';
  try {
    const result = await window.studio.grokModels();
    for (const model of result.models || []) {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      select.appendChild(option);
    }
    if (state.settings.grokModel) select.value = state.settings.grokModel;
  } catch {
    /* the default model still works */
  }
  select.addEventListener('change', () => {
    state.settings.grokModel = select.value;
    window.studio.settingsSet({ grokModel: select.value });
  });
}

export function focusGrok() {
  if (!state.info?.grokPath) return;
  state.grokOpen = true;
  state.hooks.layout?.();
  document.getElementById('grok-input').focus();
}

export async function explainFile() {
  const tab = activeTab();
  if (!tab?.model) {
    toast('Open a file first');
    return;
  }
  await send(`Explain ${relativePath(tab.path || tab.name)}. Say what it does and point out anything that looks wrong.`);
}

export async function explainSelection() {
  const selected = selectionText();
  if (!selected.trim()) {
    toast('Select some code first');
    return;
  }
  await send('Explain this selection. Keep it concrete.');
}

export async function askProblems() {
  await send('Look for problems in the active file. List only real issues, with the line and a fix.');
}

export async function submit() {
  const input = document.getElementById('grok-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  await send(text);
}

export async function send(text) {
  if (!state.info?.grokPath) {
    toast('Ask is not available on this machine.');
    return;
  }
  if (state.grok.busy) {
    toast('Ask is still working');
    return;
  }
  const cwd = state.project || state.info.home;
  state.grok.messages.push({ role: 'user', text });
  const assistant = { role: 'assistant', text: '', thought: '', tools: [], logs: [] };
  state.grok.messages.push(assistant);
  state.grok.busy = true;
  state.grok.current = assistant;
  renderLog();
  setBusy(true);
  const result = await window.studio.grokStart({
    prompt: buildPrompt(text),
    cwd,
    mode: state.grok.mode,
    model: document.getElementById('grok-model').value,
    resume: state.grok.sessionId,
  });
  if (!result?.ok) {
    assistant.text = result?.error || 'Ask did not start';
    state.grok.busy = false;
    setBusy(false);
    renderLog();
  }
}

function buildPrompt(text) {
  const parts = [text];
  const tab = activeTab();
  if (state.project) parts.push(`Project: ${state.project}`);
  if (tab?.model) {
    parts.push(`Active file: ${tab.path || tab.name}`);
    const selected = selectionText();
    if (selected.trim()) parts.push(`Selection:\n${selected.slice(0, 8000)}`);
    const body = tab.model.getValue();
    parts.push(`File contents:\n${body.slice(0, 20000)}${body.length > 20000 ? '\n…truncated…' : ''}`);
  }
  const problems = state.problems.slice(0, 20);
  if (problems.length) {
    parts.push(problems.map((item) => `${item.file}:${item.line}:${item.column} ${item.message}`).join('\n'));
  }
  return parts.join('\n\n');
}

function onEvent(event) {
  const assistant = state.grok.current;
  if (!assistant && event.type !== 'exit') return;
  if (event.type === 'text' && assistant) assistant.text += event.data;
  if (event.type === 'thought' && assistant) assistant.thought += event.data;
  if (event.type === 'log' && assistant) assistant.logs.push(event.data);
  if (event.type === 'tool' && assistant) {
    const found = assistant.tools.find((tool) => tool.id && tool.id === event.id);
    if (found) {
      found.status = event.status || found.status;
      if (event.title) found.title = event.title;
    } else {
      assistant.tools.push({
        id: event.id,
        title: event.title || event.name || 'tool',
        status: event.status || 'in_progress',
      });
    }
  }
  if (event.type === 'error' && assistant) assistant.text += `\n\n${event.message}`;
  if (event.type === 'end') {
    if (event.sessionId) state.grok.sessionId = event.sessionId;
  }
  if (event.type === 'exit') {
    const edited = state.grok.mode === 'edit';
    state.grok.busy = false;
    state.grok.current = null;
    setBusy(false);
    renderLog();
    state.hooks.saveWorkspace?.();
    if (edited) refreshOpenFromDisk();
    return;
  }
  renderLog();
}

export function newChat() {
  if (state.grok.busy) window.studio.grokCancel();
  state.grok.messages = [];
  state.grok.sessionId = '';
  state.grok.current = null;
  state.grok.busy = false;
  setBusy(false);
  renderLog();
  state.hooks.saveWorkspace?.();
}

export async function openSession() {
  if (!state.info?.grokPath) {
    toast('Ask is not available on this machine.');
    return;
  }
  if (!state.info.pty) {
    toast('The full session needs the terminal. Ask and Edit in this panel still work.');
  }
  const cwd = state.project || state.info.home;
  focusBottom('terminal');
  const size = terminalSize();
  const selected = selectionText().trim();
  const prompt = selected && selected.length < 500 ? `Look at this code:\n${selected}` : '';
  const created = await window.studio.grokSession({ cwd, cols: size.cols, rows: size.rows, prompt });
  if (!created?.ok) {
    toast(created?.error || 'Could not open Ask');
    return;
  }
  mountTerm(created.id, 'Ask', cwd);
}

export function restoreGrok(data) {
  if (!data) return;
  state.grok.messages = Array.isArray(data.messages) ? data.messages : [];
  state.grok.sessionId = data.sessionId || '';
  renderLog();
}

export function grokSnapshot() {
  return {
    sessionId: state.grok?.sessionId || '',
    messages: (state.grok?.messages || []).slice(-30).map((message) => ({
      role: message.role,
      text: String(message.text || '').slice(0, 8000),
      thought: String(message.thought || '').slice(0, 2000),
      tools: message.tools || [],
    })),
  };
}

function setBusy(busy) {
  document.getElementById('grok-send').disabled = busy;
  document.getElementById('grok-stop').disabled = !busy;
  document.getElementById('grok-status').textContent = busy ? 'working' : (state.info?.grokPath ? 'ready' : 'missing');
}

function renderLog() {
  const host = document.getElementById('grok-log');
  const nearBottom = host.scrollHeight - host.scrollTop - host.clientHeight < 40;
  host.innerHTML = '';
  if (!state.grok.messages.length) {
    host.innerHTML = '<p class="side-empty">Ask about the open file.</p>';
    return;
  }
  for (const message of state.grok.messages) {
    const bubble = document.createElement('article');
    bubble.className = `bubble ${message.role}`;
    if (message.role === 'user') {
      bubble.textContent = message.text;
    } else {
      if (message.tools?.length) {
        const tools = document.createElement('div');
        tools.className = 'tool-list';
        for (const tool of message.tools) {
          const chip = document.createElement('span');
          chip.className = `tool-chip ${tool.status || ''}`;
          chip.textContent = `${tool.title} ${tool.status === 'completed' ? 'done' : tool.status || ''}`.trim();
          tools.appendChild(chip);
        }
        bubble.appendChild(tools);
      }
      if (message.thought) {
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = 'Thinking';
        const pre = document.createElement('pre');
        pre.textContent = message.thought;
        details.append(summary, pre);
        bubble.appendChild(details);
      }
      const body = document.createElement('div');
      body.className = 'md';
      body.innerHTML = message.text ? renderMarkdown(message.text) : (state.grok.busy ? '<span class="dim">…</span>' : '');
      bubble.appendChild(body);
    }
    host.appendChild(bubble);
  }
  if (nearBottom) host.scrollTop = host.scrollHeight;
}
