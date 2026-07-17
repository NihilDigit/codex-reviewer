import * as vscode from 'vscode';

export interface CapturedContext {
  relativePath: string;
  absPath: string;
  startLine: number; // 1-based, inclusive
  endLine: number; // 1-based, inclusive
  side: 'old' | 'new';
  commitSha?: string;
  workingTree: boolean;
  code: string;
  languageId: string;
}

interface GitUriQuery {
  path?: string;
  ref?: string;
}

function parseGitUriQuery(query: string): GitUriQuery {
  try {
    const parsed: unknown = JSON.parse(query);
    if (parsed && typeof parsed === 'object') {
      return parsed as GitUriQuery;
    }
  } catch {
    // not JSON — ignore
  }
  return {};
}

interface GitApiLike {
  repositories: Array<{
    rootUri: vscode.Uri;
    state: { HEAD?: { commit?: string } | undefined };
  }>;
}

interface GitExtensionExports {
  getAPI(version: 1): GitApiLike;
}

export function getGitApi(): GitApiLike | undefined {
  try {
    return vscode.extensions.getExtension<GitExtensionExports>('vscode.git')?.exports?.getAPI(1);
  } catch {
    return undefined;
  }
}

function findHeadSha(fsPath: string): string | undefined {
  try {
    const api = getGitApi();
    const repo = api?.repositories.find(
      (r) => fsPath === r.rootUri.fsPath || fsPath.startsWith(r.rootUri.fsPath + '/')
    );
    return repo?.state.HEAD?.commit;
  } catch {
    return undefined;
  }
}

/**
 * Resolve everything about the commented lines at comment-creation time:
 * exact verbatim code, path, 1-based line range, diff side, and the commit SHA
 * (from the git: URI ref for the old side, or HEAD for the working tree).
 */
export async function captureContext(
  uri: vscode.Uri,
  range: vscode.Range
): Promise<CapturedContext> {
  const doc = await vscode.workspace.openTextDocument(uri);

  const lastLine = doc.lineCount - 1;
  const startLine0 = Math.max(0, Math.min(range.start.line, lastLine));
  const endLine0 = Math.max(startLine0, Math.min(range.end.line, lastLine));
  const code = doc.getText(
    new vscode.Range(startLine0, 0, endLine0, doc.lineAt(endLine0).range.end.character)
  );

  let absPath = uri.fsPath;
  let side: 'old' | 'new' = 'new';
  let commitSha: string | undefined;
  let workingTree = false;

  if (uri.scheme === 'git') {
    side = 'old';
    const query = parseGitUriQuery(uri.query);
    if (query.path) {
      absPath = query.path;
    }
    if (query.ref && /^[0-9a-f]{40}$/i.test(query.ref)) {
      commitSha = query.ref;
    }
  } else {
    workingTree = true;
    commitSha = findHeadSha(absPath);
  }

  return {
    relativePath: vscode.workspace.asRelativePath(absPath, false),
    absPath,
    startLine: startLine0 + 1,
    endLine: endLine0 + 1,
    side,
    commitSha,
    workingTree,
    code,
    languageId: doc.languageId,
  };
}
