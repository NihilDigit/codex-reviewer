import * as vscode from 'vscode';

const CODEX_EXTENSION_ID = 'openai.chatgpt';
const ADD_FILE_TO_THREAD_COMMAND = 'chatgpt.addFileToThread';

/**
 * Attach a file to the Codex chat composer as a context chip by invoking the
 * official Codex extension's own "Add File to Codex Thread" command.
 * The chip stays visible in the composer: deleting it excludes the file,
 * and its content travels with the user's next prompt.
 */
export async function addFileToCodexThread(file: vscode.Uri): Promise<void> {
  if (!vscode.extensions.getExtension(CODEX_EXTENSION_ID)) {
    throw new Error('Codex extension (openai.chatgpt) is not installed.');
  }
  await vscode.commands.executeCommand(ADD_FILE_TO_THREAD_COMMAND, file);
}
