import {
  OLLAMA_HOST,
  buildCompletionPrompt,
  cleanCompletion,
  pickModels,
  trimOverlap,
  usableCompletion,
  usesFim,
} from '../shared/ollama.js';

export async function probeOllama(host = OLLAMA_HOST) {
  const empty = { ok: false, host, version: '', models: [], loaded: [], chatModel: '', completeModel: '' };
  const signal = AbortSignal.timeout(800);
  try {
    const versionRes = await fetch(`${host}/api/version`, { signal });
    if (!versionRes.ok) return empty;
    const versionBody = await versionRes.json();
    const tagsRes = await fetch(`${host}/api/tags`, { signal });
    const tags = tagsRes.ok ? await tagsRes.json() : { models: [] };
    const models = (tags.models || []).map((item) => item.name).filter(Boolean);
    const loaded = await loadedModelNames(host, signal);
    return {
      ok: true,
      host,
      version: versionBody.version || '',
      models,
      loaded,
      ...pickModels(models),
    };
  } catch {
    return empty;
  }
}

export async function loadedModelNames(host = OLLAMA_HOST, signal) {
  try {
    const response = await fetch(`${host}/api/ps`, { signal });
    if (!response.ok) return [];
    const body = await response.json();
    return (body.models || []).map((item) => item.name).filter(Boolean);
  } catch {
    return [];
  }
}

export async function streamChat({ host = OLLAMA_HOST, model, messages, signal, onText }) {
  const response = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
    }),
    signal,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail.slice(0, 280) || `Ollama returned ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf('\n');
    while (index >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) {
        const message = JSON.parse(line);
        if (message.error) throw new Error(String(message.error));
        const chunk = message.message?.content || '';
        if (chunk) onText(chunk);
      }
      index = buffer.indexOf('\n');
    }
  }
}

export async function completeText({ host = OLLAMA_HOST, model, prefix, suffix, signal }) {
  const head = String(prefix || '').slice(-2000);
  const tail = String(suffix || '').slice(0, 800);
  const fim = usesFim(model);
  const small = fim || /(^|\/)complete($|:)|1\.5b|0\.5b|1b|3b/i.test(model);
  const response = await fetch(`${host}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fim ? {
      model,
      prompt: head,
      suffix: tail,
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: 64,
        num_ctx: 2048,
        stop: ['<|endoftext|>', '<|fim_prefix|>', '<|fim_suffix|>', '<|fim_middle|>', '<|fim_pad|>', '<|file_sep|>', '\n\n'],
      },
    } : {
      model,
      prompt: buildCompletionPrompt(model, head, tail).prompt,
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: small ? 48 : 24,
        num_ctx: 2048,
        stop: ['\n\n', 'BEFORE:', 'AFTER:'],
      },
    }),
    signal,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail.slice(0, 280) || `Ollama returned ${response.status}`);
  }
  const body = await response.json();
  if (body.error) throw new Error(String(body.error));
  return usableCompletion(trimOverlap(head, cleanCompletion(body.response || ''), tail));
}
