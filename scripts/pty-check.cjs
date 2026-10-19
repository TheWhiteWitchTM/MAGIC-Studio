const { app } = require('electron');

app.whenReady().then(() => {
  try {
    const pty = require('node-pty');
    const shell = process.env.SHELL || 'bash';
    const term = pty.spawn(shell, ['-lc', 'printf PTY_OK\\n'], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: process.env,
    });
    let out = '';
    term.onData((data) => {
      out += data;
    });
    term.onExit(() => {
      const ok = out.includes('PTY_OK');
      console.log(ok ? 'PTY_OK' : `PTY_BAD ${JSON.stringify(out)}`);
      app.exit(ok ? 0 : 1);
    });
  } catch (error) {
    console.error(`PTY_FAIL ${error.stack || error}`);
    app.exit(1);
  }
});
