import * as vscode from "vscode";
import { BetterOpenFileController } from "./betterOpenFileController.js";

export function activate(context: vscode.ExtensionContext): void {
  const controller = new BetterOpenFileController(context);
  context.subscriptions.push(
    vscode.commands.registerCommand("betterOpenFile.openFile", async () => {
      await controller.open();
    }),
    vscode.commands.registerCommand("betterOpenFile.saveFile", async () => {
      await controller.save();
    }),
    vscode.commands.registerCommand(
      "betterOpenFile.copyCurrentPath",
      async () => {
        await controller.copyCurrentPath();
      },
    ),
  );
}
