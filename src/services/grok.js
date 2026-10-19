import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stripAnsi } from '../shared/text.js';

export const GROK_RULES = [
  'You are Grok inside MAGIC Studio, an IDE.',
  'MAGIC is a Lua and BASIC style language stored in .magic files. It compiles to JavaScript.',
  'Keywords ignore case. Names keep their case. end closes a block. A newline ends a statement. -- comments out the rest of the line.',
  'Answer in concrete terms. When you change files, name the files you changed.',
].join(' ');

export function grokLaunch({ grokPath, promptFile, cwd, mode, model, resume }) {
  const args = [
    '--prompt-file', promptFile,
    '--cwd', cwd,
    '--output-format', 'streaming-json',
    '--no-alt-screen',
    '--no-auto-update',
    '--max-turns', mode === 'edit' ? '20' : '8',
    '--rules', GROK_RULES,
  ];
  if (model) args.push('--model', model);
  if (resume) args.push('--resume', resume);
  if (mode === 'edit') {
    args.push('--permission-mode', 'acceptEdits');
  } else {
    args.push('--permission-mode', 'default');
    args.push('--tools', 'read_file,grep,list_dir');
    args.push('--disallowed-tools', 'run_terminal_cmd,run_terminal_command,write,search_replace,Agent');
  }
  return { cmd: grokPath, args };
}

export function writePrompt(text) {
  const file = path.join(os.tmpdir(), `magic-studio-grok-${process.pid}-${Date.now()}.txt`);
  fs.writeFileSync(file, text);
  return file;
}

export function forgetPrompt(file) {
  if (!file) return;
  fs.promises.unlink(file).catch(() => {});
}

/** Turn one streaming-json object into a small UI event. */
export function mapGrokEvent(message) {
  if (!message || typeof message !== 'object') return null;
  if (message.type === 'text') return { type: 'text', data: String(message.data || '') };
  if (message.type === 'thought') return { type: 'thought', data: String(message.data || '') };
  if (message.type === 'tool_call') {
    return {
      type: 'tool',
      id: message.toolCallId || '',
      name: message.toolName || message.title || 'tool',
      title: message.title || message.toolName || 'tool',
      status: message.status || 'in_progress',
    };
  }
  if (message.type === 'tool_call_update') {
    return {
      type: 'tool',
      id: message.toolCallId || '',
      name: message.toolName || '',
      title: message.title || '',
      status: message.status || 'completed',
    };
  }
  if (message.type === 'end') {
    return {
      type: 'end',
      sessionId: message.sessionId || '',
      stopReason: message.stopReason || '',
    };
  }
  if (message.type === 'error') return { type: 'error', message: String(message.message || 'Ask failed') };
  if (message.type === 'plan') return { type: 'plan', data: message.entries || message.data || '' };
  return null;
}

export function pushGrokChunk(buffer, chunk, emit) {
  let next = buffer + stripAnsi(chunk.toString());
  let index = next.indexOf('\n');
  while (index >= 0) {
    const line = next.slice(0, index).trim();
    next = next.slice(index + 1);
    if (line) {
      try {
        const mapped = mapGrokEvent(JSON.parse(line));
        if (mapped) emit(mapped);
      } catch {
        emit({ type: 'log', data: line });
      }
    }
    index = next.indexOf('\n');
  }
  return next;
}
