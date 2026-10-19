# MAGIC Studio

A dark IDE for the MAGIC language. It is an Electron app: a project tree, a Monaco editor, a run console, and a terminal. The window is white text on black.

## Start

```bash
npm install
npm start
```

`bin/magic-studio` does the same thing and picks up the tools on PATH, including nvm. `npm run desktop` adds an application-menu launcher for this machine.

Open a folder, or create one from the welcome screen. MAGIC examples open with the examples button when the MAGIC project sits next to this one.

## Run

Shift+F10 runs the active file.

| File | Command |
| --- | --- |
| `.magic` | `magic run` |
| `.js` | `node` |
| `.ts` | `node --experimental-strip-types` |
| `.py` | `python3` |
| `.sh` | `bash` |

The configuration list also runs `npm` scripts and a custom shell command. Preview (Ctrl+Shift+F10) packs a MAGIC script into a window. Check (Ctrl+F9) compiles the buffer and lists problems. Strict passes `--strict`.

Click a `file:line:column` path in the run console to open it.

## Ask

If the `grok` command is on PATH, Alt+9 opens a quiet Ask panel. It stays closed until you open it, and it is absent when that command is missing. Ask reads the project and does not edit it. Edit can change files in the open folder. Enter sends. Shift+Enter inserts a line.

## Keys

Ctrl+Shift+A or Ctrl+Shift+P opens the command list. Ctrl+P opens a file. Ctrl+Shift+F searches the folder. Alt+1, Alt+3, and Alt+7 switch the side panel. Alt+9 toggles Ask when it is installed. Alt+F12 or Ctrl+` toggles the terminal. Ctrl+D duplicates a line. Ctrl+Y deletes a line. Shift+F6 renames a name in the file. Ctrl+B jumps to a declaration. Ctrl+F2 stops a run.

The editor uses a dark theme. Settings for font size, indent, wrap, and the last folder are stored under the app's user data.
