import * as path from 'path';
import * as vscode from 'vscode';
import { getGitApi } from './capture';

async function findGitDir(repoRoot: string): Promise<vscode.Uri | undefined> {
  const dotGit = vscode.Uri.joinPath(vscode.Uri.file(repoRoot), '.git');
  try {
    const stat = await vscode.workspace.fs.stat(dotGit);
    if (stat.type === vscode.FileType.Directory) {
      return dotGit;
    }
    // Worktree/submodule: .git is a file containing "gitdir: <path>"
    const raw = await vscode.workspace.fs.readFile(dotGit);
    const match = /^gitdir:\s*(.+)$/m.exec(Buffer.from(raw).toString('utf8'));
    if (match) {
      const p = match[1].trim();
      return path.isAbsolute(p)
        ? vscode.Uri.file(p)
        : vscode.Uri.joinPath(vscode.Uri.file(repoRoot), p);
    }
  } catch {
    // not a git repo
  }
  return undefined;
}

/**
 * Make sure the pending-reviews file is listed in the repository's
 * .git/info/exclude (local-only ignore, unlike .gitignore it is never
 * committed and never touches the user's shared files). Best effort.
 */
export async function ensureGitExcluded(fileUri: vscode.Uri): Promise<void> {
  try {
    const api = getGitApi();
    const repo = api?.repositories.find(
      (r) =>
        fileUri.fsPath === r.rootUri.fsPath ||
        fileUri.fsPath.startsWith(r.rootUri.fsPath + path.sep)
    );
    const repoRoot =
      repo?.rootUri.fsPath ?? vscode.workspace.getWorkspaceFolder(fileUri)?.uri.fsPath;
    if (!repoRoot) {
      return;
    }
    const gitDir = await findGitDir(repoRoot);
    if (!gitDir) {
      return;
    }
    const rel = path.relative(repoRoot, fileUri.fsPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return; // pending file lives outside the repository
    }
    const entry = '/' + rel.split(path.sep).join('/');
    const excludeUri = vscode.Uri.joinPath(gitDir, 'info', 'exclude');
    let content = '';
    try {
      content = Buffer.from(await vscode.workspace.fs.readFile(excludeUri)).toString('utf8');
    } catch {
      // file does not exist yet
    }
    if (content.split('\n').some((line) => line.trim() === entry)) {
      return;
    }
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(gitDir, 'info'));
    const prefix = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
    await vscode.workspace.fs.writeFile(
      excludeUri,
      Buffer.from(content + prefix + entry + '\n', 'utf8')
    );
  } catch {
    // best effort — never block the extension on git plumbing
  }
}
