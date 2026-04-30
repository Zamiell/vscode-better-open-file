import * as vscode from "vscode";
import type { DialogOptions, FileFilter } from "./types.js";

export function getDialogOptions(): DialogOptions {
  const config = vscode.workspace.getConfiguration("betterOpenFile");
  return {
    allowMultipleSelection: config.get("allowMultipleSelection", false),
    foldersFirst: config.get("foldersFirst", true),
    showHiddenFiles: config.get("showHiddenFiles", false),
  };
}

export function getFilters(): readonly FileFilter[] {
  return [
    { label: "All files (*.*)", patterns: ["*"] },
    {
      label: "Source files",
      patterns: [
        "*.css",
        "*.html",
        "*.js",
        "*.json",
        "*.jsx",
        "*.md",
        "*.ts",
        "*.tsx",
      ],
    },
    { label: "Text files", patterns: ["*.md", "*.txt"] },
    {
      label: "Images",
      patterns: ["*.gif", "*.jpg", "*.jpeg", "*.png", "*.webp"],
    },
  ];
}
