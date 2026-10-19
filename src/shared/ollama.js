export const OLLAMA_HOST = 'http://127.0.0.1:11434';

export const LOCAL_SYSTEM = [
  'You are a local coding assistant inside MAGIC Studio.',
  'MAGIC is a Lua and BASIC style language stored in .magic files. It compiles to JavaScript.',
  'Keywords ignore case. Names keep their case. end closes a block. A newline ends a statement. -- comments out the rest of the line.',
  'Prefer short answers and concrete code. When asked to rewrite a selection, return only the replacement code.',
].join(' ');

export function modelNames(models) {
  return (models || []).map((item) => (typeof item === 'string' ? item : item?.name || '')).filter(Boolean);
}

export function pickModels(models) {
  const names = modelNames(models);
  const bare = (name) => name.split(':')[0];
  const chat = names.find((name) => bare(name) === 'coder')
    || names.find((name) => /qwen3\.5/i.test(name))
    || names.find((name) => /coder/i.test(name) && !/1\.5b|0\.5b|\bcomplete\b/i.test(name))
    || names[0]
    || '';
  const complete = names.find((name) => bare(name) === 'complete')
    || names.find((name) => /qwen2\.5-coder/i.test(name))
    || names.find((name) => /(^|:)(0\.5b|1\.5b|1b|3b)\b/i.test(name))
    || '';
  return { chatModel: chat, completeModel: complete };
}

export function usesFim(model) {
  return /qwen2\.5-coder|(^|\/)complete($|:)/i.test(String(model || ''));
}

export function buildCompletionPrompt(model, prefix, suffix) {
  const head = String(prefix || '').slice(-2000);
  const tail = String(suffix || '').slice(0, 800);
  if (usesFim(model)) {
    return {
      raw: true,
      prompt: `<|fim_prefix|>${head}<|fim_suffix|>${tail}<|fim_middle|>`,
    };
  }
  return {
    raw: false,
    prompt: [
      'Continue the code at the cursor. Output only the missing text. No fences. No explanation.',
      '',
      'BEFORE:',
      head,
      '',
      'AFTER:',
      tail,
      '',
      'CONTINUE:',
    ].join('\n'),
  };
}

export function cleanCompletion(text) {
  let out = String(text || '').replace(/\r/g, '');
  out = out.replace(/^```[^\n]*\n/, '').replace(/\n```$/, '');
  const stop = out.indexOf('<|');
  if (stop >= 0) out = out.slice(0, stop);
  if (out.startsWith('\n')) out = out.slice(1);
  return out.replace(/[ \t]+$/g, '').replace(/\n{3,}/g, '\n\n');
}

export function usableCompletion(text) {
  const sample = String(text || '').trim();
  if (!sample) return '';
  if (/^(it looks like|the (code|provided)|this (code|function|snippet)|here'?s |sure[, ]|however,|note that)/i.test(sample)) return '';
  const codey = /[{}()[\]=<>+\-*/]|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\b(fn|end|let|return|if|for|while|class|import|print)\b/i.test(sample);
  if (!codey && sample.split(/\s+/).length > 8) return '';
  return String(text);
}

export function trimOverlap(prefix, completion, suffix = '') {
  let text = String(completion || '');
  const line = String(prefix || '').split('\n').pop() || '';
  if (line && text.startsWith(line)) text = text.slice(line.length);
  const tail = String(suffix || '');
  let cut = 0;
  const limit = Math.min(text.length, tail.length);
  for (let size = limit; size >= 1; size -= 1) {
    if (text.slice(-size) === tail.slice(0, size)) {
      cut = size;
      break;
    }
  }
  if (cut && (text.slice(-cut).includes('\n') || cut === text.length)) text = text.slice(0, text.length - cut);
  return text.replace(/[ \t]+$/g, '');
}

export function extractReplacement(text) {
  const source = String(text || '').trim();
  if (!source) return '';
  const fences = [...source.matchAll(/```[^\n]*\n([\s\S]*?)```/g)];
  if (fences.length) return fences[fences.length - 1][1].replace(/\s+$/, '');
  return source;
}

export function installSteps(aiDir) {
  const dir = aiDir || 'ai';
  return [
    'Local Ask and ghost text use Ollama at 127.0.0.1:11434.',
    'Local mode keeps the prompt on this machine.',
    '',
    'Install and start:',
    '  curl -fsSL https://ollama.com/install.sh | sh',
    '  systemctl --user enable --now ollama',
    '',
    'Code help for Ask:',
    '  ollama pull qwen3.5:4b',
    `  ollama create coder -f ${dir}/coder.Modelfile`,
    '',
    'Ghost text while you type:',
    '  ollama pull qwen2.5-coder:1.5b',
    `  ollama create complete -f ${dir}/complete.Modelfile`,
    '',
    'Optional writing model:',
    `  ollama create writer -f ${dir}/writer.Modelfile`,
    '',
    'Check with: local-ai-status',
    'Alt+9 opens Ask. Ctrl+Space completes. Tab accepts ghost text.',
  ].join('\n');
}
