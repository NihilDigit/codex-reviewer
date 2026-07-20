import * as vscode from 'vscode';
import { captureContext } from './capture';
import { Staging, StagedEntry } from './staging';

class ReviewComment implements vscode.Comment {
  public contextValue?: string;
  constructor(
    public readonly id: string,
    public body: string | vscode.MarkdownString,
    public mode: vscode.CommentMode,
    public author: vscode.CommentAuthorInformation,
    public label: string | undefined,
    public parent?: vscode.CommentThread
  ) {}
}

/**
 * GitHub PR-style commenting: a "+" in the editor gutter (works in normal
 * editors and both sides of diff editors) opens an inline box; submitted notes
 * become staged review entries.
 */
export class ReviewController implements vscode.Disposable {
  private readonly controller: vscode.CommentController;
  private readonly threadEntries = new Map<vscode.CommentThread, StagedEntry>();
  private readonly disposables: vscode.Disposable[] = [];
  private commentSeq = 0;

  constructor(private readonly staging: Staging) {
    this.controller = vscode.comments.createCommentController('agent-review', 'Agent Review');
    this.controller.options = { prompt: 'Write a review note…' };
    this.controller.commentingRangeProvider = {
      provideCommentingRanges: (document: vscode.TextDocument): vscode.Range[] => {
        const scheme = document.uri.scheme;
        if (scheme !== 'file' && scheme !== 'git') {
          return [];
        }
        if (document.lineCount < 1) {
          return [];
        }
        return [new vscode.Range(0, 0, document.lineCount - 1, 0)];
      },
    };
    this.disposables.push(this.controller);

    this.disposables.push(
      vscode.commands.registerCommand('agentReviewer.addComment', (reply: vscode.CommentReply) =>
        this.addComment(reply)
      ),
      vscode.commands.registerCommand('agentReviewer.replyComment', (reply: vscode.CommentReply) =>
        this.replyComment(reply)
      ),
      vscode.commands.registerCommand('agentReviewer.addReviewComment', () =>
        this.addReviewComment()
      ),
      vscode.commands.registerCommand(
        'agentReviewer.editComment',
        (comment: ReviewComment) => this.editComment(comment)
      ),
      vscode.commands.registerCommand(
        'agentReviewer.saveComment',
        (input: { thread: vscode.CommentThread; commentUniqueId: number; text: string }) =>
          this.saveComment(input)
      ),
      vscode.commands.registerCommand(
        'agentReviewer.deleteComment',
        (comment: ReviewComment) => this.deleteComment(comment)
      ),
      vscode.commands.registerCommand('agentReviewer.deleteThread', (thread: vscode.CommentThread) =>
        this.deleteThread(thread)
      )
    );
  }

  /**
   * Open a comment box under our own controller at the current selection
   * (whole lines), or at the cursor line when nothing is selected.
   * Creating the thread directly on our controller bypasses the
   * "select comment provider" picker that the gutter + shows when several
   * controllers match the same line.
   */
  private addReviewComment(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const scheme = editor.document.uri.scheme;
    if (scheme !== 'file' && scheme !== 'git') {
      void vscode.window.showInformationMessage('Agent Reviewer: not a commentable document.');
      return;
    }
    const selection = editor.selection;
    const startLine = selection.start.line;
    let endLine = selection.end.line;
    if (selection.end.character === 0 && endLine > startLine) {
      endLine -= 1; // selection ends at the start of a line — that line is not included
    }
    const range = new vscode.Range(
      startLine,
      0,
      endLine,
      editor.document.lineAt(endLine).range.end.character
    );
    const thread = this.controller.createCommentThread(editor.document.uri, range, []);
    thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
    thread.canReply = true;
  }

  private async addComment(reply: vscode.CommentReply): Promise<void> {
    const thread = reply.thread;
    if (!thread.range) {
      void vscode.window.showErrorMessage('Agent Reviewer: comment thread has no line range.');
      return;
    }
    let captured;
    try {
      captured = await captureContext(thread.uri, thread.range);
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Agent Reviewer: failed to capture context — ${err instanceof Error ? err.message : String(err)}`
      );
      return;
    }
    const entry = this.staging.addEntry(captured, reply.text);
    thread.label = `${captured.relativePath}:${captured.startLine}-${captured.endLine}`;
    thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
    thread.canReply = true;
    this.threadEntries.set(thread, entry);
    thread.comments = [this.makeComment(reply.text, thread)];
  }

  private replyComment(reply: vscode.CommentReply): void {
    const entry = this.threadEntries.get(reply.thread);
    if (!entry) {
      return;
    }
    this.staging.addNote(entry.id, reply.text);
    reply.thread.comments = [...reply.thread.comments, this.makeComment(reply.text, reply.thread)];
  }

  private editComment(comment: ReviewComment): void {
    comment.mode = vscode.CommentMode.Editing;
    const thread = comment.parent;
    if (thread) {
      // Reassign comments so the widget picks up the mode change.
      thread.comments = [...thread.comments];
    }
  }

  private saveComment(input: {
    thread: vscode.CommentThread;
    commentUniqueId: number;
    text: string;
  }): void {
    const thread = input.thread;
    // uniqueIdInThread is assigned by VS Code at runtime but not exposed on
    // the public Comment type.
    const noteIndex = thread.comments.findIndex(
      (c) => (c as unknown as { uniqueIdInThread: number }).uniqueIdInThread === input.commentUniqueId
    );
    const comment = thread.comments[noteIndex] as ReviewComment | undefined;
    if (!comment) {
      return;
    }
    comment.body = input.text;
    comment.mode = vscode.CommentMode.Preview;
    const entry = this.threadEntries.get(thread);
    if (entry && noteIndex >= 0) {
      this.staging.updateNote(entry.id, noteIndex, input.text);
    }
    thread.comments = [...thread.comments];
  }

  private deleteComment(comment: ReviewComment): void {
    const thread = comment.parent;
    if (!thread) {
      return;
    }
    const entry = this.threadEntries.get(thread);
    const noteIndex = thread.comments.findIndex((c) => (c as ReviewComment).id === comment.id);
    if (entry && noteIndex >= 0) {
      const entryRemoved = this.staging.removeNote(entry.id, noteIndex);
      if (entryRemoved) {
        this.threadEntries.delete(thread);
        thread.dispose();
        return;
      }
    }
    thread.comments = thread.comments.filter((c) => (c as ReviewComment).id !== comment.id);
  }

  private deleteThread(thread: vscode.CommentThread): void {
    const entry = this.threadEntries.get(thread);
    if (entry) {
      this.staging.removeEntry(entry.id);
    }
    this.threadEntries.delete(thread);
    thread.dispose();
  }

  clearAll(): void {
    for (const thread of this.threadEntries.keys()) {
      thread.dispose();
    }
    this.threadEntries.clear();
  }

  private makeComment(text: string, parent: vscode.CommentThread): ReviewComment {
    this.commentSeq += 1;
    const comment = new ReviewComment(
      `c${this.commentSeq}`,
      text,
      vscode.CommentMode.Preview,
      { name: 'Me' },
      'staged',
      parent
    );
    // Marks the note as editable; the Edit button is gated on this in package.json.
    comment.contextValue = 'canEdit';
    return comment;
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
