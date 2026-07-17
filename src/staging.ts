import * as vscode from 'vscode';
import { CapturedContext } from './capture';
import { formatReviewFile } from './format';

export interface StagedEntry {
  id: number;
  captured: CapturedContext;
  notes: string[];
}

/**
 * Holds the staged (pending) review entries and keeps a markdown file in the
 * workspace mirroring them. That file is what gets attached to the Codex chat
 * composer, so it always reflects the current staged set.
 */
export class Staging implements vscode.Disposable {
  private entries: StagedEntry[] = [];
  private nextId = 1;
  private writeTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly getWorkspaceFolder: () => vscode.WorkspaceFolder | undefined) {}

  get count(): number {
    return this.entries.length;
  }

  addEntry(captured: CapturedContext, note: string): StagedEntry {
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

  clear(): void {
    this.entries = [];
    this.changed();
  }

  pendingFileUri(): vscode.Uri | undefined {
    const folder = this.getWorkspaceFolder();
    if (!folder) {
      return undefined;
    }
    const rel = vscode.workspace
      .getConfiguration('codexReviewer')
      .get<string>('pendingFile', '.codex/pending-reviews.md');
    return vscode.Uri.joinPath(folder.uri, rel);
  }

  async flush(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = undefined;
    }
    const uri = this.pendingFileUri();
    if (!uri) {
      return;
    }
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
    const content = formatReviewFile(
      this.entries.map((e) => ({ ...e.captured, notes: e.notes }))
    );
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
  }

  private changed(): void {
    this._onDidChange.fire();
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
    }
    this.writeTimer = setTimeout(() => {
      void this.flush();
    }, 300);
  }

  dispose(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
    }
    this._onDidChange.dispose();
  }
}
