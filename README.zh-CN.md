# Codex Reviewer

这是一个 VS Code 扩展，给 Codex 官方插件（openai.chatgpt）加上 GitHub PR Review 风格的行评论。在 diff 视图或普通编辑器里，可以对任意行或选区写批注；批注以暂存（staged）状态保留在 VS Code 中，积累多条后一键作为一个文件芯片放进 Codex 聊天输入框，随你的下一条消息一起发送。不想要时删掉芯片即可，评论本身仍留在 VS Code 里。

## 使用流程

```
悬停行号 → 点 +（或选中多行后按 Ctrl+Alt+C）→ 写批注，可写多条
        ↓
状态栏显示 "N reviews"
        ↓
点状态栏，或 diff 编辑器右上角的发送按钮
        ↓
Codex 聊天输入框出现 pending-reviews.md 芯片
        ↓
在 Codex 里正常发消息，评论随消息进入会话
        ↓
命令面板执行 "Codex Reviewer: Clear Staged Reviews"，开始下一轮
```

芯片指向一个真实文件（默认 `<workspace>/.codex/pending-reviews.md`），扩展在每次增删评论后自动重写它。先放芯片、之后再补评论也可以，发送时内容总是最新的。

## 引用内容

每条评论在文件中记为一条客观引用：路径、行号、所在侧（diff 旧侧带 commit SHA，新侧带 HEAD SHA）、逐字代码段，以及批注原文。引用不附带任何指令性文字；之后让 agent 解释这段代码还是修改它，由你在对话中决定。

```md
## [ref #1] src/foo.ts:40-42

working tree (HEAD `1a2b3c4d5e`)

​```typescript
const a = 1;
const b = 2;
return a + b;
​```

> 这里为什么要 + b？
```

## 环境要求

- VS Code ≥ 1.96
- 已安装并登录 Codex 官方插件 `openai.chatgpt`（芯片通过它的公开命令 `chatgpt.addFileToThread` 放置）

## 安装与开发

```bash
npm install
npm run compile    # esbuild → out/extension.js
npm run typecheck  # tsc --noEmit
```

打包安装：`npx vsce package` 生成 `.vsix` 后用 `code --install-extension` 安装；也可以把 `package.json`、`out/`、`README.md` 直接复制到 `~/.vscode/extensions/nihildigit.codex-reviewer-0.1.0/`。调试：在本目录按 `F5`，或执行 `code --extensionDevelopmentPath=<本目录> <某个工作区>`。

## 操作方式

| 操作 | 效果 |
| --- | --- |
| 悬停行号点 + | 评论该行（普通编辑器、diff 两侧均可） |
| `Ctrl+Alt+C`（Mac `Cmd+Alt+C`） | 直接创建 Codex 评论：有选区锚定选区，无选区锚定光标行 |
| 点状态栏 `N reviews` | 把全部暂存评论放进 Codex 输入框 |
| 线程标题栏按钮 | 发送或删除该线程；单条批注可单独删除 |

命令面板另有 `Codex Reviewer: Clear Staged Reviews`（清空暂存）和 `Codex Reviewer: Open Pending Reviews File`（查看引用文件）。

快捷键存在的原因：gutter 的 + 是 VS Code 核心组件，多个评论提供者（如 GitHub Pull Requests）命中同一行时会弹出提供者选择框，扩展也无法拦截 Shift 之类的修饰键手势。`Ctrl+Alt+C` 在本扩展自己的 controller 上直接建线程，跳过选择框。键位可在 Keyboard Shortcuts 中修改。

## 设置

- `codexReviewer.pendingFile`（默认 `.codex/pending-reviews.md`）：引用文件的工作区相对路径。
- `codexReviewer.gitExclude`（默认 `true`）：激活时把引用文件写入所在仓库的 `.git/info/exclude`，`git status` 不受影响。支持 worktree 和 submodule 的 `.git` 文件指针；非 git 目录自动跳过。

## 已知限制

- **内联 diff 模式无法评论被删除的行。** 被删行在内联视图中是渲染出的虚拟行，没有评论锚点，属 VS Code 平台限制。处理办法：diff 编辑器右上角 `…` → Toggle Inline View 切到并排视图，在左侧旧文件上评论，可正确捕获为 `old side @ commit <sha>` 并含被删代码原文。
- **评论框样式不可定制。** 宽高由 VS Code 核心评论组件决定，扩展没有 API。折行时 + 会跟随鼠标出现在每个视觉行，同属核心渲染；点任意视觉行锚定的都是同一逻辑行，不影响引用数据。
- **芯片不显示评论条数**，只显示文件名；条数看状态栏。
- 官方插件没有暴露"消息已发送"事件，发送后需手动执行 Clear Staged Reviews。
- 评论线程只存于内存：重载窗口后线程与暂存集重置。引用文件保留最后一次内容，下次增删或发送时重写。
- 终端版 `codex` TUI 的输入框没有可编程接口，本扩展只支持官方插件的聊天输入框。
