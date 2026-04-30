import * as vscode from "vscode";
import { BetterOpenFileController } from "./betterOpenFileController.js";

const commandId = "betterOpenFile.openFile";

export function activate(context: vscode.ExtensionContext): void {
  const controller = new BetterOpenFileController(context);
  context.subscriptions.push(
    vscode.commands.registerCommand(commandId, async () => {
      await controller.open();
    }),
  );
}

export function deactivate(): void {
  // VS Code disposes registered subscriptions automatically.
}
