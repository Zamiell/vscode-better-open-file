import * as vscode from "vscode";
import { BetterOpenFileController } from "./betterOpenFileController.js";

const openFileCommandId = "betterOpenFile.openFile";
const saveFileCommandId = "betterOpenFile.saveFile";

export function activate(context: vscode.ExtensionContext): void {
  const controller = new BetterOpenFileController(context);
  context.subscriptions.push(
    vscode.commands.registerCommand(openFileCommandId, async () => {
      await controller.open();
    }),
    vscode.commands.registerCommand(saveFileCommandId, async () => {
      await controller.save();
    }),
  );
}
