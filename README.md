# Agent Reviewer

GitHub PR-style review comments in VS Code, delivered to your coding agent. Comment on any line or selection — in a diff view or a regular file — and the notes stay staged inside the editor, mirrored to a markdown file in your workspace. That file is the hand-off point: attach it to the Codex chat as a chip, and/or let the Kimi CLI hook pick it up on your next prompt. When Kimi consumes the file, the staged comments clear themselves in VS Code.

[中文介绍](README.zh-CN.md)

## How it works

1. Hover a line's gutter and click **+**, or select a range and press `Ctrl+Alt+C` (`Cmd+Alt+C` on macOS). Write as many notes as you like; the status bar keeps count.
2. Every staged change rewrites the pending reviews file (default `.agent-reviewer/pending-reviews.md`) within ~300ms.
3. Click the status bar item (or the send button in a diff editor's title bar) to flush. Depending on your targets:
   - **Codex** (`agentReviewer.targets.codex`): the file is attached to the Codex chat composer as a chip via the Codex extension's `chatgpt.addFileToThread` command.
   - **Kimi** (`agentReviewer.targets.kimi`): the file simply sits there — the next message you send in a Kimi CLI session in this workspace picks it up automatically (see below).
4. Staged reviews are cleared when the agent consumes the file (Kimi) or when you run `Agent Reviewer: Clear Staged Reviews` — e.g. after sending the reviews in Codex, which reads but never consumes the file.

## The Kimi CLI hook

The extension and Kimi CLI never talk to each other directly — they rendezvous through the pending reviews file:

- A Kimi `UserPromptSubmit` hook checks your session's workspace for `.agent-reviewer/pending-reviews.md`. If it contains review entries, the hook appends them to your prompt's context and renames the file to `pending-reviews.md.consumed`.
- The extension watches for that disappearance and clears the staged comments, threads, and status bar count automatically.
- If several Kimi sessions run in the same workspace, whichever submits a prompt first consumes the file; the others see nothing. Sessions in other workspaces are unaffected.

### Install the hook as a Kimi plugin (recommended)

This repository doubles as a Kimi Code plugin — `kimi.plugin.json` at the root declares the hook. In the Kimi TUI:

```
/plugins install https://github.com/NihilDigit/agent-reviewer
```

Confirm the third-party plugin prompt, then `/reload` or start a new session.

### Install the hook manually

Add to `~/.kimi-code/config.toml`:

```toml
[[hooks]]
event = "UserPromptSubmit"
command = "bash /path/to/agent-reviewer/hooks/inject-reviews.sh"
timeout = 10
```

Use this route if you customized `agentReviewer.pendingFile` — then also edit the path inside `hooks/inject-reviews.sh` to match.

## What the agent receives

Each note becomes one objective citation: path, line range, side (the old side of a diff carries the commit SHA, the new side carries HEAD), the verbatim code, and your note text. No instructions are attached — whether the agent should explain the code or change it stays entirely up to your conversation.

```md
## [ref #1] src/foo.ts:40-42

working tree (HEAD `1a2b3c4d5e`)

​```typescript
const a = 1;
const b = 2;
return a + b;
​```

> why is `b` added here?
```

## Requirements

- VS Code ≥ 1.96
- Optional, per target: the official Codex extension (`openai.chatgpt`) for Codex chips; Kimi Code CLI with the hook installed for the Kimi workflow

## Install

```bash
npm install
npm run compile   # esbuild → out/extension.js
```

Then package with `npx vsce package` and install via `code --install-extension`, or copy `package.json`, `out/`, and `README.md` into `~/.vscode/extensions/NihilDigit.agent-reviewer-0.5.0/`. For development, open this folder and press `F5`, or run `code --extensionDevelopmentPath=<this repo> <a workspace>`.

## Usage

| Action | Result |
| --- | --- |
| Hover the gutter, click **+** | Comment on that line (regular editors and both sides of a diff) |
| `Ctrl+Alt+C` (`Cmd+Alt+C`) | New review comment on the selection, or on the cursor line when nothing is selected |
| Click the status bar item | Flush reviews: attach the chip to Codex and/or leave the file for the Kimi hook |
| Thread title buttons | Flush or delete a thread; single notes can be edited or deleted individually |

Command palette: `Agent Reviewer: Flush Reviews to File`, `Agent Reviewer: Clear Staged Reviews`, and `Agent Reviewer: Open Pending Reviews File`.

Why the shortcut exists: the gutter **+** belongs to VS Code core. When several comment providers (e.g. GitHub Pull Requests) match the same line it shows a provider picker, and extensions cannot listen for modifier-key clicks on it. `Ctrl+Alt+C` creates the thread directly on this extension's own controller and skips the picker. Rebind it in Keyboard Shortcuts.

## Settings

- `agentReviewer.pendingFile` (default `.agent-reviewer/pending-reviews.md`): workspace-relative path of the reviews file.
- `agentReviewer.gitExclude` (default `true`): adds the reviews file and its `.consumed` marker to the repository's `.git/info/exclude` so `git status` stays clean.
- `agentReviewer.targets.codex` (default `true`): attach the reviews file to the Codex chat composer when flushing.
- `agentReviewer.targets.kimi` (default `true`): watch the reviews file and clear staged reviews when the Kimi hook consumes it.

## Known limitations

- **Deleted lines can't be commented in inline diff mode.** Use the diff editor's `…` menu → Toggle Inline View, and comment on the left (old) file in side-by-side mode.
- **The comment widget is not styleable.** Its size is fixed by VS Code's core comment component.
- Hook-injected reviews go straight into the model's context — they are not shown as an attachment in your Kimi conversation. Use `Agent Reviewer: Open Pending Reviews File` to inspect what will be sent.
- Codex consumes nothing: after sending the chip in Codex, clear the round manually with `Agent Reviewer: Clear Staged Reviews` — otherwise a later Kimi prompt in the same workspace will pick the same reviews up again.
- Comment threads live in memory: reloading the window resets threads and the staged set (the reviews file keeps its last content and is rewritten on the next change).

## License

MIT © NihilDigit
