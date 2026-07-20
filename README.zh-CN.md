# Agent Reviewer

在 VS Code 里写 GitHub PR Review 风格的行评论，交给你的编程 agent 处理。在 diff 视图或普通编辑器里对任意行或选区写批注，批注以暂存状态保留在编辑器里，并实时镜像到工作区中的一个 Markdown 文件。这个文件就是交接点：可以作为芯片附加到 Codex 聊天，也可以让 Kimi CLI 的 hook 在你下一条消息时自动捎上。Kimi 消费文件后，VS Code 里的暂存评论会自动清场。

[English README](README.md)

## 使用流程

1. 悬停行号点 **+**，或选中一段代码按 `Ctrl+Alt+C`（macOS 为 `Cmd+Alt+C`）写批注，可写多条；状态栏实时显示数量。
2. 每次暂存变动后约 300ms，扩展自动重写 pending 评审文件（默认 `.agent-reviewer/pending-reviews.md`）。
3. 点状态栏（或 diff 编辑器右上角的发送按钮）执行 flush，按你开启的目标生效：
   - **Codex**（`agentReviewer.targets.codex`）：文件作为芯片附加到 Codex 聊天输入框（走 Codex 扩展的 `chatgpt.addFileToThread` 命令）。
   - **Kimi**（`agentReviewer.targets.kimi`）：文件就位即可——你在本工作区的 Kimi CLI 会话里发送的下一条消息会自动带上它（见下）。
4. 暂存评论在两种情况下清除：agent 消费了文件（Kimi），或你手动执行 `Agent Reviewer: Clear Staged Reviews`——比如在 Codex 里发送之后，因为 Codex 只读不消费。

## Kimi CLI hook 原理

扩展和 Kimi CLI 之间没有任何直接通信，只靠 pending 文件接头：

- Kimi 的 `UserPromptSubmit` hook 在你每次发送消息时检查当前会话工作区有没有 `.agent-reviewer/pending-reviews.md`；有评审条目就把内容附加到你这条消息的上下文里，然后把文件重命名为 `pending-reviews.md.consumed`。
- 扩展监听到文件消失，自动清空暂存、关掉所有评论线程、状态栏归零。
- 同一工作区开了多个 Kimi 会话时，**先发消息的会话**消费文件，其他会话不受影响；其他工作区的会话根本看不到这个文件。

### 以 Kimi 插件方式安装 hook（推荐）

本仓库同时是一个 Kimi Code 插件——根目录的 `kimi.plugin.json` 声明了这个 hook。在 Kimi TUI 里执行：

```
/plugins install https://github.com/NihilDigit/agent-reviewer
```

确认第三方插件提示后，`/reload` 或开新会话生效。

### 手动安装 hook

在 `~/.kimi-code/config.toml` 中加入：

```toml
[[hooks]]
event = "UserPromptSubmit"
command = "bash /path/to/agent-reviewer/hooks/inject-reviews.sh"
timeout = 10
```

如果你修改过 `agentReviewer.pendingFile` 默认路径，请走手动方式，并同步修改 `hooks/inject-reviews.sh` 里的文件路径。

## Agent 收到的内容

每条批注变成一条客观引用：路径、行范围、diff 侧别（旧侧带提交 SHA，新侧带 HEAD）、代码原文、你的批注文字。不附加任何指令——让 agent 解释代码还是修改代码，完全由你的对话决定。

```md
## [ref #1] src/foo.ts:40-42

working tree (HEAD `1a2b3c4d5e`)

​```typescript
const a = 1;
const b = 2;
return a + b;
​```

> 这里为什么加 b？
```

## 环境要求

- VS Code ≥ 1.96
- 按目标可选：Codex 官方扩展（`openai.chatgpt`）用于 Codex 芯片；Kimi Code CLI + 本仓库 hook 用于 Kimi 工作流

## 安装扩展

```bash
npm install
npm run compile   # esbuild → out/extension.js
```

然后用 `npx vsce package` 打包并通过 `code --install-extension` 安装，或把 `package.json`、`out/`、`README.md` 复制到 `~/.vscode/extensions/NihilDigit.agent-reviewer-0.5.0/`。开发调试：打开本目录按 `F5`，或运行 `code --extensionDevelopmentPath=<本仓库> <某个工作区>`。

## 操作一览

| 操作 | 结果 |
| --- | --- |
| 悬停行号点 **+** | 对该行写评论（普通编辑器和 diff 两侧均可） |
| `Ctrl+Alt+C`（`Cmd+Alt+C`） | 对选区写评论；无选区时对光标所在行 |
| 点状态栏 | flush：附加 Codex 芯片，和/或把文件留给 Kimi hook |
| 线程标题按钮 | flush 或删除整个线程；单条批注可编辑、可单独删除 |

命令面板：`Agent Reviewer: Flush Reviews to File`、`Agent Reviewer: Clear Staged Reviews`、`Agent Reviewer: Open Pending Reviews File`。

为什么需要快捷键：行号槽的 **+** 属于 VS Code 核心组件。当多个评论提供者（如 GitHub Pull Requests）匹配同一行时会弹出提供者选择器，而扩展无法监听它上面的修饰键点击。`Ctrl+Alt+C` 直接在本扩展自己的控制器上建线程，跳过选择器。可在键盘快捷方式里改绑。

## 设置

- `agentReviewer.pendingFile`（默认 `.agent-reviewer/pending-reviews.md`）：评审文件的工作区相对路径。
- `agentReviewer.gitExclude`（默认 `true`）：把评审文件及其 `.consumed` 标记加入仓库的 `.git/info/exclude`，`git status` 保持干净。
- `agentReviewer.targets.codex`（默认 `true`）：flush 时把评审文件附加到 Codex 聊天输入框。
- `agentReviewer.targets.kimi`（默认 `true`）：监听评审文件，Kimi hook 消费后自动清除暂存评论。

## 已知限制

- **内联 diff 模式无法评论已删除的行。** 用 diff 编辑器 `…` 菜单切换为并排模式，在左侧（旧）文件上评论。
- **评论组件不可定制样式**，尺寸由 VS Code 核心组件固定。
- hook 注入的评审直接进入模型上下文，不会在 Kimi 对话里显示为附件。发送前可用 `Agent Reviewer: Open Pending Reviews File` 查看内容。
- Codex 不做消费：在 Codex 里发送芯片后请手动 `Clear Staged Reviews`，否则之后同工作区的 Kimi 消息会再次带上同一份评审。
- 评论线程存于内存：重载窗口会清空线程和暂存集（评审文件保留最后内容，下次变动时重写）。

## 许可证

MIT © NihilDigit
