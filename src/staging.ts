import * as vscode from 'vscode';
import { CapturedContext } from './capture';
import { formatReviewFile } from './format';
import { normalizePendingFilePath } from './paths';

export interface StagedEntry {
  id: number;
  captured: CapturedContext;
  notes: string[];
}

/**
 * Holds the staged (pending) review entries and keeps a markdown file in the
 * workspace mirroring them. That file is the hand-off point for agents: the
 * Codex chat chip points at it, and the Kimi CLI hook injects it on the
 * user's next prompt, so it always reflects the current staged set.
 */
export class Staging implements vscode.Disposable {
  private entries: StagedEntry[] = [];
  private nextId = 1;
  private writeTimer: ReturnType<typeof setTimeout> | undefined;
  private writeQueue: Promise<void> = Promise.resolve();
  private batchFolder: vscode.WorkspaceFolder | undefined;
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(
    private readonly getWorkspaceFolder: (
      captured?: CapturedContext
    ) => vscode.WorkspaceFolder | undefined
  ) {}

  get count(): number {
    return this.entries.length;
  }

  addEntry(captured: CapturedContext, note: string): StagedEntry {
    if (this.entries.length === 0) {
      this.batchFolder = this.getWorkspaceFolder(captured);
    }
    const entry: StagedEntry = { id: this.nextId++, captured, notes: [note] };
    this.entries.push(entry);
    this.changed();
    return entry;
  }

  addNote(entryId: number, note: string): void {
    const entry = this.entries.find((e) => e.id === entryId);
    if (!entry) {
      return;
    }
    entry.notes.push(note);
    this.changed();
  }

  /** Returns true when the entry became empty and was removed. */
  removeNote(entryId: number, noteIndex: number): boolean {
    const index = this.entries.findIndex((e) => e.id === entryId);
    if (index < 0) {
      return false;
    }
    const entry = this.entries[index];
    if (noteIndex >= 0 && noteIndex < entry.notes.length) {
      entry.notes.splice(noteIndex, 1);
    }
    if (entry.notes.length === 0) {
      this.entries.splice(index, 1);
      this.changed();
      return true;
    }
    this.changed();
    return false;
  }

  removeEntry(entryId: number): void {
    this.entries = this.entries.filter((e) => e.id !== entryId);
    this.changed();
  }

  updateNote(entryId: number, noteIndex: number, text: string): void {
    const entry = this.entries.find((e) => e.id === entryId);
    if (!entry || noteIndex < 0 || noteIndex >= entry.notes.length) {
      return;
    }
    entry.notes[noteIndex] = text;
    this.changed();
  }

  /**
   * Clear the staged entries. With `keepFile`, the pending mirror file is left
   * untouched: an agent may read it lazily (the Codex chip after attaching,
   * or the Kimi hook on the user's next prompt), so rewriting it to an empty
   * document here would hand the agent an empty file. The next staged comment
   * flushes and overwrites the file anyway.
   */
  clear(opts?: { keepFile?: boolean }): void {
    this.entries = [];
    if (opts?.keepFile) {
      if (this.writeTimer) {
        clearTimeout(this.writeTimer);
        this.writeTimer = undefined;
      }
      this._onDidChange.fire();
      return;
    }
    this.changed();
  }

  pendingFileUri(): vscode.Uri | undefined {
    const folder = this.batchFolder ?? this.getWorkspaceFolder();
    if (!folder) {
      return undefined;
    }
    const configuredPath = vscode.workspace
      .getConfiguration('agentReviewer')
      .get<string>('pendingFile', '.agent-reviewer/pending-reviews.md');
    const rel = normalizePendingFilePath(configuredPath);
    return vscode.Uri.joinPath(folder.uri, rel);
  }

  async flush(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = undefined;
    }
    const content = formatReviewFile(
      this.entries.map((e) => ({ ...e.captured, notes: e.notes }))
    );
    const uri = this.pendingFileUri();
    if (!uri) {
      return;
    }
    const write = async (): Promise<void> => {
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
    };
    this.writeQueue = this.writeQueue.catch(() => undefined).then(write);
    await this.writeQueue;
  }

  private changed(): void {
    this._onDidChange.fire();
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
    }
    this.writeTimer = setTimeout(() => {
      void this.flush().catch((err: unknown) => {
        void vscode.window.showErrorMessage(
          `Agent Reviewer: failed to update pending reviews — ${err instanceof Error ? err.message : String(err)}`
        );
      });
    }, 300);
  }

  dispose(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
    }
    this._onDidChange.dispose();
  }
}
