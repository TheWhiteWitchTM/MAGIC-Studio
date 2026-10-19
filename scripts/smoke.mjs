import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fuzzyScore, parseProblems } from '../src/shared/text.js';
import {
  buildCompletionPrompt,
  cleanCompletion,
  extractReplacement,
  installSteps,
  pickModels,
  trimOverlap,
  usableCompletion,
  usesFim,
} from '../src/shared/ollama.js';
import { DEFAULTS } from '../src/services/store.js';
import { checkSource, findMagic, findNode, packPreview } from '../src/services/magic.js';
import { mapGrokEvent, pushGrokChunk } from '../src/services/grok.js';
import { createProject, indexSymbols } from '../src/services/files.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;

function check(name, condition) {
  if (condition) console.log(`ok  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}

const problems = parseProblems('/tmp/hello.magic:4:2 unexpected end\nnoise\n/tmp/other.magic:1:1 missing end');
check('parses diagnostics', problems.length === 2 && problems[0].line === 4 && problems[0].column === 2);
check('fuzzy prefers the file name', fuzzyScore('hel', 'src/hello.magic') > fuzzyScore('hel', 'src/shell/util.js'));
check('fuzzy rejects a miss', fuzzyScore('zzz', 'hello.magic') === 0);

const events = [];
const rest = pushGrokChunk('', '{"type":"text","data":"Hi"}\n{"type":"end","sessionId":"abc"}\n', (event) => events.push(event));
check('streams grok lines', rest === '' && events[0]?.data === 'Hi' && events[1]?.sessionId === 'abc');
check('maps a tool call', mapGrokEvent({ type: 'tool_call', toolName: 'read_file', title: 'Read', status: 'in_progress' })?.name === 'read_file');

const nodePath = findNode();
const magic = findMagic(root);
check('finds node', Boolean(nodePath));
check('finds MAGIC', Boolean(magic.cli));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-studio-smoke-'));
const good = path.join(dir, 'hello.magic');
const bad = path.join(dir, 'bad.magic');
fs.writeFileSync(good, 'fn greet(name)\n  return "Hello, " .. name\nend\nprint greet("MAGIC")\n');
fs.writeFileSync(bad, 'fn\n');
const goodCheck = await checkSource({ nodePath, extraEnv: {}, magic, file: good, content: null });
const badCheck = await checkSource({ nodePath, extraEnv: {}, magic, file: bad, content: 'fn broken(\n' });
check('hello.magic checks clean', goodCheck.ok);
check('a broken script reports a problem', !badCheck.ok && badCheck.problems.length > 0);

const packed = await packPreview({ nodePath, extraEnv: {}, magic, file: good });
check('preview pack writes a window', packed.ok && fs.existsSync(path.join(packed.dir, 'index.html')));

const project = await createProject(dir, 'sample');
const symbols = await indexSymbols(project.dir);
check('indexes fn greet', symbols.symbols.some((item) => item.name === 'greet' && item.kind === 'fn'));

check('theme starts black', DEFAULTS.theme === 'black');
check('ghost text starts on', DEFAULTS.inlineComplete === true);
const picked = pickModels(['qwen3.5:4b', 'writer', 'qwen2.5-coder:1.5b', 'coder:latest', 'complete:latest']);
check('picks coder for chat', picked.chatModel === 'coder:latest');
check('picks complete for ghost text', picked.completeModel === 'complete:latest');
check('qwen2.5-coder uses fim tokens', usesFim('qwen2.5-coder:1.5b') && buildCompletionPrompt('complete', 'pri', '\nend').prompt.includes('<|fim_prefix|>'));
check('a chat model gets a plain prompt', !buildCompletionPrompt('qwen3.5:4b', 'pri', '').raw);
check('cleans a fenced completion', cleanCompletion('```magic\nprint 1\n```') === 'print 1');
check('drops an echoed line', trimOverlap('print ', 'print "hi"') === '"hi"');
check('drops a copied tail', trimOverlap('.. ', 'name .. "!"\nend', '\nend\n') === 'name .. "!"');
check('drops an explanation', usableCompletion('The code you provided is written in Lua and then it keeps talking') === '');
check('keeps a short insert', usableCompletion('name .. "!"') === 'name .. "!"');
check('extracts a rewrite', extractReplacement('Sure.\n```\nfn greet()\nend\n```') === 'fn greet()\nend');
check('install steps name both models', installSteps('/tmp/ai').includes('qwen2.5-coder:1.5b') && installSteps('/tmp/ai').includes('/tmp/ai/coder.Modelfile'));

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('unit smoke ok');
