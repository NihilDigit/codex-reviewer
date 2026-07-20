import * as vscode from 'vscode';
import { normalizePendingFilePath } from './paths';

/**
 * Watches the pending reviews file and fires `onConsumed` when it disappears.
 * Disappearance is the consumption signal of the Kimi CLI hook protocol: the
 * hook injects the file into the user's prompt and then renames it to
 * `pending-reviews.md.consumed`, which shows up here as a delete of the
 * original path.
 */
export function watchConsumption(
  getPendingUri: () => vscode.Uri | undefined,
  onConsumed: () => void
): vscode.Disposable {
  const rel = normalizePendingFilePath(
    vscode.workspace
      .getConfiguration('agentReviewer')
      .get<string>('pendingFile', '.agent-reviewer/pending-reviews.md')
  );
  const disposables: vscode.Disposable[] = [];
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, rel));
    disposables.push(
      watcher,
      watcher.onDidDelete((uri) => {
        const pending = getPendingUri();
        if (pending && uri.fsPath === pending.fsPath) {
          onConsumed();
        }
      })
    );
  }
  return vscode.Disposable.from(...disposables);
}
