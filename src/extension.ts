import * as vscode from 'vscode';
import { Staging } from './staging';
import { ReviewController } from './comments';
import { addFileToCodexThread } from './codex';
import { ensureGitExcluded } from './gitExclude';

export function activate(context: vscode.ExtensionContext): void {
  const staging = new Staging(() => vscode.workspace.workspaceFolders?.[0]);
  const reviews = new ReviewController(staging);

  const syncGitExclude = (): void => {
    if (!vscode.workspace.getConfiguration('codexReviewer').get<boolean>('gitExclude', true)) {
      return;
    }
    const uri = staging.pendingFileUri();
    if (uri) {
      void ensureGitExcluded(uri);
    }
  };
  syncGitExclude();

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.command = 'codexReviewer.stageToCodex';
  status.tooltip = 'Staged Codex reviews — click to attach them to the Codex chat';
  const updateStatus = (): void => {
    const n = staging.count;
    status.text = `$(comment-discussion) ${n} review${n === 1 ? '' : 's'}`;
    if (n > 0) {
      status.show();
    } else {
      status.hide();
    }
    void vscode.commands.executeCommand('setContext', 'codexReviewer.hasStaged', n > 0);
  };
  staging.onDidChange(updateStatus);
  updateStatus();

  context.subscriptions.push(
    staging,
    reviews,
    status,
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration('codexReviewer.pendingFile') ||
        e.affectsConfiguration('codexReviewer.gitExclude')
      ) {
        syncGitExclude();
      }
    }),
    vscode.commands.registerCommand('codexReviewer.stageToCodex', async () => {
      if (staging.count === 0) {
        void vscode.window.showInformationMessage('Codex Reviewer: no staged review comments.');
        return;
      }
      const uri = staging.pendingFileUri();
      if (!uri) {
        void vscode.window.showErrorMessage('Codex Reviewer: open a workspace folder first.');
        return;
      }
      try {
        await staging.flush();
        await addFileToCodexThread(uri);
      } catch (err) {
        void vscode.window.showErrorMessage(
          `Codex Reviewer: failed to attach reviews — ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }),
    vscode.commands.registerCommand('codexReviewer.clearStaged', () => {
      staging.clear();
      reviews.clearAll();
    }),
    vscode.commands.registerCommand('codexReviewer.openPendingFile', async () => {
      const uri = staging.pendingFileUri();
      if (!uri) {
        void vscode.window.showErrorMessage('Codex Reviewer: open a workspace folder first.');
        return;
      }
      await staging.flush();
      await vscode.window.showTextDocument(uri, { preview: true });
    })
  );
}

export function deactivate(): void {}
