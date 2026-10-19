# MAGIC Studio

Alpha. This is early work, and the window can still change.

Mira, [The White Witch™](https://thewhitewitchtm.github.io/whitewitch/). [X](https://x.com/TheWhiteWitchTM) · [thewhitewitchtm@google.com](mailto:thewhitewitchtm@google.com) · [GitHub](https://github.com/TheWhiteWitchTM) · [YouTube](https://youtube.com/@TheWhiteWitchTM) · [Bluesky](https://bsky.app/profile/thewhitewitchtm.sociallydead.me) · [MIT License](LICENSE)

A dark IDE for the MAGIC language. Electron window, project tree, Monaco editor, run console, and a terminal. It starts black: black background, white text, syntax colors on the code. The status bar says Black. Click it for the light theme. The choice is remembered.

Help → About names the author and opens the MIT license.

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

## Complete

Ctrl+Space opens completions. MAGIC offers keywords, built-ins, snippets, names in the file, and project symbols. Other languages offer names from the file. Ghost text appears as you type when a local completion model is installed. Tab accepts it. The Complete button in the status bar turns ghost text off. Ctrl+Space keeps working.

## Ask

Alt+9 opens Ask. It stays closed until you open it. Enter sends. Shift+Enter inserts a line.

Local uses Ollama on this machine. Ask does not edit files. Edit rewrites the current selection. Grok is listed when the `grok` command is on PATH. Grok's Edit mode can change files in the open folder. Help → Local AI shows the install steps.

## Local AI

Ollama serves Ask and ghost text at `127.0.0.1:11434`. Local mode does not send the prompt to a cloud model.

```bash
curl -fsSL https://ollama.com/install.sh | sh
systemctl --user enable --now ollama
```

Code help:

```bash
ollama pull qwen3.5:4b
ollama create coder -f ai/coder.Modelfile
```

Ghost text:

```bash
ollama pull qwen2.5-coder:1.5b
ollama create complete -f ai/complete.Modelfile
```

`coder` is the Ask default. `complete` is the ghost-text model. `ai/coder.Modelfile` sets `num_gpu 0` so a 2 GB GPU is left alone. Delete that line on a larger GPU. `ai/writer.Modelfile` is an optional writing model. `local-ai-status` prints the server and the installed models.

MAGIC Studio talks to a server that is already running. It prefers `coder` or `qwen3.5` for Ask, and `complete` or `qwen2.5-coder` for ghost text. A chat model that is already loaded can also finish a short completion.

## Keys

Ctrl+Shift+A or Ctrl+Shift+P opens the command list. Ctrl+P opens a file. Ctrl+Shift+F searches the folder. Alt+1, Alt+3, and Alt+7 switch the side panel. Alt+9 toggles Ask when it is installed. Alt+F12 or Ctrl+` toggles the terminal. Ctrl+D duplicates a line. Ctrl+Y deletes a line. Shift+F6 renames a name in the file. Ctrl+B jumps to a declaration. Ctrl+F2 stops a run.

The editor starts on the black theme. Settings for theme, font size, indent, wrap, ghost text, and the last folder are stored under the app's user data.
