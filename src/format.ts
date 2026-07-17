// Pure formatting helpers — no vscode imports, unit-testable with plain node.

export interface ReviewEntryData {
  relativePath: string;
  startLine: number; // 1-based, inclusive
  endLine: number; // 1-based, inclusive
  side: 'old' | 'new';
  commitSha?: string;
  workingTree: boolean;
  code: string;
  languageId: string;
  notes: string[];
}

function shortSha(sha: string): string {
  return sha.length > 10 ? sha.slice(0, 10) : sha;
}

function locationLine(entry: ReviewEntryData): string {
  const range =
    entry.startLine === entry.endLine
      ? `${entry.startLine}`
      : `${entry.startLine}-${entry.endLine}`;
  return `${entry.relativePath}:${range}`;
}

function provenanceLine(entry: ReviewEntryData): string {
  if (entry.side === 'old') {
    return entry.commitSha
      ? `old side @ commit \`${shortSha(entry.commitSha)}\``
      : 'old side (committed)';
  }
  return entry.commitSha
    ? `working tree (HEAD \`${shortSha(entry.commitSha)}\`)`
    : 'working tree';
}

export function formatEntry(entry: ReviewEntryData, index: number): string {
  const parts: string[] = [];
  parts.push(`## [ref #${index + 1}] ${locationLine(entry)}`);
  parts.push('');
  parts.push(provenanceLine(entry));
  parts.push('');
  parts.push('```' + entry.languageId);
  parts.push(entry.code.replace(/\n$/, ''));
  parts.push('```');
  for (const note of entry.notes) {
    parts.push('');
    for (const line of note.split('\n')) {
      parts.push(`> ${line}`);
    }
  }
  return parts.join('\n');
}

export function formatReviewFile(entries: ReviewEntryData[]): string {
  const lines: string[] = [];
  lines.push(`# Codex Reviews (${entries.length})`);
  lines.push('');
  if (entries.length === 0) {
    lines.push('No staged review comments.');
    lines.push('');
    return lines.join('\n');
  }
  lines.push(
    `${entries.length} code reference(s) captured from VS Code review comments. ` +
      'Each entry quotes the exact lines the reviewer saw, followed by their note(s).'
  );
  lines.push('');
  const body = entries.map((e, i) => formatEntry(e, i)).join('\n\n---\n\n');
  lines.push(body);
  lines.push('');
  return lines.join('\n');
}
