import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseProblems } from '../shared/text.js';

export function findNode() {
  const found = [];
  if (process.env.npm_node_execpath) found.push(process.env.npm_node_execpath);
  const which = spawnSync('which', ['node'], { encoding: 'utf8' });
  if (which.status === 0) found.push(...which.stdout.trim().split('\n'));
  found.push('/usr/local/bin/node', '/usr/bin/node');
  for (const item of found) {
    if (!item) continue;
    if (item.includes('electron')) continue;
    try {
      if (fs.existsSync(item) && fs.statSync(item).isFile()) return item;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

export function nodeEnv(nodePath) {
  if (nodePath && nodePath === process.execPath) return { ELECTRON_RUN_AS_NODE: '1' };
  return {};
}

export function findMagic(studioRoot) {
  const cli = path.resolve(studioRoot, '../MAGIC/dist/cli.js');
  if (fs.existsSync(cli)) {
    return { cli, app: path.resolve(studioRoot, '../MAGIC/dist/app.js'), root: path.resolve(studioRoot, '../MAGIC') };
  }
  const which = spawnSync('which', ['magic'], { encoding: 'utf8' });
  if (which.status === 0) {
    const bin = which.stdout.trim().split('\n')[0];
    if (bin) return { bin, app: null, root: null };
  }
  return { cli: null, app: null, root: null };
}

export function findGrok() {
  const home = path.join(os.homedir(), '.grok', 'bin', 'grok');
  const which = spawnSync('which', ['grok'], { encoding: 'utf8' });
  const fromPath = which.status === 0 ? which.stdout.trim().split('\n')[0] : '';
  for (const item of [fromPath, home]) {
    if (item && fs.existsSync(item)) return item;
  }
  return '';
}

export function runSpec(file, { nodePath, magic, strict, cwd }) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.magic') {
    if (magic?.cli) {
      const args = [magic.cli, 'run', file];
      if (strict) args.push('--strict');
      return { cmd: nodePath, args, cwd, label: `magic run ${path.basename(file)}${strict ? ' --strict' : ''}` };
    }
    if (magic?.bin) {
      const args = ['run', file];
      if (strict) args.push('--strict');
      return { cmd: magic.bin, args, cwd, label: `magic run ${path.basename(file)}` };
    }
    throw new Error('The MAGIC compiler was not found. Build the MAGIC project, then reopen the folder.');
  }
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    return { cmd: nodePath, args: [file], cwd, label: `node ${path.basename(file)}` };
  }
  if (ext === '.ts' || ext === '.mts' || ext === '.cts' || ext === '.tsx') {
    return {
      cmd: nodePath,
      args: ['--experimental-strip-types', file],
      cwd,
      label: `node ${path.basename(file)}`,
    };
  }
  if (ext === '.py') return { cmd: 'python3', args: [file], cwd, label: `python3 ${path.basename(file)}` };
  if (ext === '.sh' || ext === '.bash') return { cmd: 'bash', args: [file], cwd, label: `bash ${path.basename(file)}` };
  if (ext === '.html' || ext === '.htm') {
    return { cmd: null, args: [], cwd, label: path.basename(file), html: true };
  }
  throw new Error(`MAGIC Studio has no runner for ${ext || 'this file'}.`);
}

function spawnNode(nodePath, args, { cwd, extraEnv }) {
  return spawn(nodePath, args, {
    cwd,
    env: { ...process.env, ...extraEnv, NO_COLOR: '1', FORCE_COLOR: '0' },
  });
}

export function checkSource({ nodePath, extraEnv, magic, file, strict = false, content = null }) {
  return new Promise((resolve) => {
    const ext = path.extname(file).toLowerCase();
    if (ext === '.json') {
      try {
        JSON.parse(content ?? fs.readFileSync(file, 'utf8'));
        resolve({ ok: true, problems: [] });
      } catch (error) {
        resolve({
          ok: false,
          problems: [{ file, line: 1, column: 1, message: error.message }],
        });
      }
      return;
    }

    let target = file;
    let temp = null;
    const finishTemp = () => {
      if (!temp) return;
      fs.promises.unlink(temp).catch(() => {});
    };

    if (typeof content === 'string') {
      temp = path.join(path.dirname(file), `.${path.basename(file)}.magic-studio-check`);
      try {
        fs.writeFileSync(temp, content);
        target = temp;
      } catch (error) {
        resolve({ ok: false, problems: [{ file, line: 1, column: 1, message: error.message }] });
        return;
      }
    }

    if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
      const child = spawnNode(nodePath, ['--check', target], { cwd: path.dirname(file), extraEnv });
      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('close', (code) => {
        finishTemp();
        const problems = parseProblems(stderr, file).map((item) => remap(item, temp, file));
        if (code !== 0 && problems.length === 0) {
          problems.push({ file, line: 1, column: 1, message: stderr.trim() || `node --check exited ${code}` });
        }
        resolve({ ok: code === 0, problems });
      });
      child.on('error', (error) => {
        finishTemp();
        resolve({ ok: false, problems: [{ file, line: 1, column: 1, message: error.message }] });
      });
      return;
    }

    if (ext !== '.magic') {
      finishTemp();
      resolve({ ok: true, problems: [] });
      return;
    }

    if (!magic?.cli && !magic?.bin) {
      finishTemp();
      resolve({
        ok: false,
        problems: [{ file, line: 1, column: 1, message: 'The MAGIC compiler was not found.' }],
      });
      return;
    }

    const out = path.join(os.tmpdir(), `magic-studio-${process.pid}-${Date.now()}.js`);
    const args = magic.cli
      ? [magic.cli, 'compile', target, '-o', out]
      : ['compile', target, '-o', out];
    if (strict) args.push('--strict');
    const cmd = magic.cli ? nodePath : magic.bin;
    const child = spawnNode(cmd, args, { cwd: path.dirname(file), extraEnv });
    let stderr = '';
    let stdout = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.on('close', (code) => {
      fs.promises.unlink(out).catch(() => {});
      finishTemp();
      let problems = parseProblems(`${stderr}\n${stdout}`, file).map((item) => remap(item, temp, file));
      if (code !== 0 && problems.length === 0) {
        const message = (stderr || stdout || `MAGIC compile exited ${code}`).trim();
        problems = [{ file, line: 1, column: 1, message }];
      }
      resolve({ ok: code === 0, problems });
    });
    child.on('error', (error) => {
      finishTemp();
      resolve({ ok: false, problems: [{ file, line: 1, column: 1, message: error.message }] });
    });
  });
}

function remap(problem, temp, file) {
  if (!temp) return problem;
  if (problem.file === temp || problem.file.endsWith('.magic-studio-check')) {
    return { ...problem, file };
  }
  return problem;
}

export function packPreview({ nodePath, extraEnv, magic, file }) {
  return new Promise((resolve) => {
    if (!magic?.app) {
      resolve({ ok: false, error: 'Preview needs the MAGIC compiler next to MAGIC Studio.', problems: [] });
      return;
    }
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-preview-'));
    const href = pathToFileURL(magic.app).href;
    const script = `
import { App } from ${JSON.stringify(href)};
try {
  const result = App.pack(process.argv[1], { out: process.argv[2], title: 'MAGIC Preview' });
  process.stdout.write(result.dir + '\\n');
} catch (error) {
  const text = error && typeof error.format === 'function' ? error.format() : (error && error.stack) || String(error);
  process.stderr.write(String(text) + '\\n');
  process.exit(1);
}
`;
    const child = spawnNode(nodePath, ['--input-type=module', '-e', script, file, out], {
      cwd: path.dirname(file),
      extraEnv,
    });
    let stderr = '';
    let stdout = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.on('close', (code) => {
      if (code !== 0) {
        const problems = parseProblems(stderr, file);
        resolve({
          ok: false,
          error: (stderr || stdout || `Preview failed (${code})`).trim(),
          problems,
        });
        return;
      }
      const dir = stdout.trim().split('\n').filter(Boolean).pop() || out;
      resolve({ ok: true, dir });
    });
    child.on('error', (error) => resolve({ ok: false, error: error.message, problems: [] }));
  });
}
