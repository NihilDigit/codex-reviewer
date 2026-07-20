import * as path from 'path';

/** Validate and normalize the workspace-relative pending review file setting. */
export function normalizePendingFilePath(value: string): string {
  const normalizedSeparators = value.trim().replace(/\\/g, '/');
  if (
    normalizedSeparators.length === 0 ||
    path.posix.isAbsolute(normalizedSeparators) ||
    path.win32.isAbsolute(value) ||
    normalizedSeparators.split('/').includes('..')
  ) {
    throw new Error('agentReviewer.pendingFile must be a path inside the workspace.');
  }

  const normalized = path.posix.normalize(normalizedSeparators);
  if (normalized === '.' || normalized.endsWith('/')) {
    throw new Error('agentReviewer.pendingFile must point to a file.');
  }
  return normalized;
}
