import * as vscode from "vscode";
import type { DialogOptions } from "./types.js";

export function getDialogOptions(): DialogOptions {
  const config = vscode.workspace.getConfiguration("betterOpenFile");
  return {
    allowMultipleSelection: config.get("allowMultipleSelection", true),
  };
}
