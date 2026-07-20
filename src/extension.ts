import * as vscode from 'vscode';
import { Staging } from './staging';
import { ReviewController } from './comments';
import { addFileToCodexThread } from './codex';
import { ensureGitExcluded } from './gitExclude';
import { watchConsumption } from './consumption';

const CODEX_EXTENSION_ID = 'openai.chatgpt';

function config(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('agentReviewer');
}

export function activate(context: vscode.ExtensionContext): void {
  const staging = new Staging((captured) => {
    if (captured) {
      return vscode.workspace.getWorkspaceFolder(vscode.Uri.file(captured.absPath));
    }
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    return (activeUri && vscode.workspace.getWorkspaceFolder(activeUri)) ??
      vscode.workspace.workspaceFolders?.[0];
  });
  const reviews = new ReviewController(staging);

  const syncGitExclude = (): void => {
    if (!config().get<boolean>('gitExclude', true)) {
      return;
    }
    try {
      const uri = staging.pendingFileUri();
      if (uri) {
        void ensureGitExcluded(uri);
        // The Kimi hook renames the pending file to <file>.consumed when it
        // picks the reviews up; keep that marker out of git status too.
        void ensureGitExcluded(vscode.Uri.file(`${uri.fsPath}.consumed`));
      }
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Agent Reviewer: invalid pending file — ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };
  syncGitExclude();

  // Kimi hook protocol: the agent signals consumption by removing the pending
  // file. Clearing must keep the file untouched — rewriting it here would
  // recreate the file the agent just took.
  let consumptionWatcher: vscode.Disposable | undefined;
  const syncConsumptionWatcher = (): void => {
    consumptionWatcher?.dispose();
    consumptionWatcher = undefined;
    if (!config().get<boolean>('targets.kimi', true)) {
      return;
    }
    try {
      consumptionWatcher = watchConsumption(
        () => staging.pendingFileUri(),
        () => {
          staging.clear({ keepFile: true });
          reviews.clearAll();
          void vscode.window.showInformationMessage(
            'Agent Reviewer: staged reviews were picked up by the agent.'
          );
        }
      );
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Agent Reviewer: invalid pending file — ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };
  syncConsumptionWatcher();

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.command = 'agentReviewer.flushReviews';
  status.tooltip = 'Staged reviews — click to flush them for the agent';
  const updateStatus = (): void => {
    const n = staging.count;
    status.text = `$(comment-discussion) ${n} review${n === 1 ? '' : 's'}`;
    if (n > 0) {
      status.show();
    } else {
      status.hide();
    }
    void vscode.commands.executeCommand('setContext', 'agentReviewer.hasStaged', n > 0);
  };
  const stagingChange = staging.onDidChange(() => {
    updateStatus();
    syncGitExclude();
  });
  updateStatus();

  context.subscriptions.push(
    staging,
    reviews,
    status,
    stagingChange,
    new vscode.Disposable(() => consumptionWatcher?.dispose()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration('agentReviewer.pendingFile') ||
        e.affectsConfiguration('agentReviewer.gitExclude')
      ) {
        syncGitExclude();
      }
      if (
        e.affectsConfiguration('agentReviewer.pendingFile') ||
        e.affectsConfiguration('agentReviewer.targets.kimi')
      ) {
        syncConsumptionWatcher();
      }
    }),
    vscode.commands.registerCommand('agentReviewer.flushReviews', async () => {
      if (staging.count === 0) {
        void vscode.window.showInformationMessage('Agent Reviewer: no staged review comments.');
        return;
      }
      try {
        const uri = staging.pendingFileUri();
        if (!uri) {
          void vscode.window.showErrorMessage('Agent Reviewer: open a workspace folder first.');
          return;
        }
        await staging.flush();
        const count = staging.count;
        if (config().get<boolean>('targets.codex', true)) {
          if (vscode.extensions.getExtension(CODEX_EXTENSION_ID)) {
            await addFileToCodexThread(uri);
          } else {
            void vscode.window.showWarningMessage(
              'Agent Reviewer: Codex target is enabled but the Codex extension (openai.chatgpt) is not installed.'
            );
          }
        }
        if (config().get<boolean>('targets.kimi', true)) {
          void vscode.window.showInformationMessage(
            `Agent Reviewer: ${count} review${count === 1 ? '' : 's'} written to ${uri.fsPath} — your next Kimi message will pick them up.`
          );
        }
        // Staged state is intentionally kept: it is cleared when the agent
        // consumes the pending file (Kimi hook) or via Clear Staged Reviews.
      } catch (err) {
        void vscode.window.showErrorMessage(
          `Agent Reviewer: failed to flush reviews — ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }),
    vscode.commands.registerCommand('agentReviewer.clearStaged', () => {
      staging.clear();
      reviews.clearAll();
    }),
    vscode.commands.registerCommand('agentReviewer.openPendingFile', async () => {
      try {
        const uri = staging.pendingFileUri();
        if (!uri) {
          void vscode.window.showErrorMessage('Agent Reviewer: open a workspace folder first.');
          return;
        }
        await staging.flush();
        await vscode.window.showTextDocument(uri, { preview: true });
      } catch (err) {
        void vscode.window.showErrorMessage(
          `Agent Reviewer: failed to open pending reviews — ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })
  );
}

export function deactivate(): void {}
