import { describe, expect, test } from 'bun:test';
import { formatEntry, formatReviewFile, ReviewEntryData } from '../src/format';

const entry: ReviewEntryData = {
  relativePath: 'src/example.ts',
  startLine: 3,
  endLine: 4,
  side: 'new',
  commitSha: '1234567890abcdef',
  workingTree: true,
  code: 'const value = 1;',
  languageId: 'typescript',
  notes: ['why?'],
};

describe('review markdown formatting', () => {
  test('formats ranges, provenance, and notes', () => {
    const output = formatEntry(entry, 0);
    expect(output).toContain('## [ref #1] src/example.ts:3-4');
    expect(output).toContain('working tree (HEAD `1234567890`)');
    expect(output).toContain('> why?');
  });

  test('uses a longer fence than fenced code in the selection', () => {
    const output = formatEntry({ ...entry, code: '````md\ntext\n````' }, 0);
    expect(output).toContain('`````typescript');
    expect(output).toContain('\n`````\n');
  });

  test('formats an empty review file', () => {
    expect(formatReviewFile([])).toBe('# Code Reviews (0)\n\nNo staged review comments.\n');
  });
});
