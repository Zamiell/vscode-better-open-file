import * as fs from "node:fs/promises";
import * as vscode from "vscode";
import { getStartupDirectory } from "./startupDirectoryResolver.js";
import type { DialogMode } from "./types.js";
import { getWebviewHtml } from "./webviewHtml.js";
import { handleMessage } from "./webviewMessages.js";

export class BetterOpenFileController {
  private readonly context: vscode.ExtensionContext;

  private documentToSave: vscode.TextDocument | undefined;

  private lastActiveFilePath: string | undefined;

  private activeMode: DialogMode | undefined;

  private readonly currentDirectories = new Map<DialogMode, string>();

  private readonly panels = new Map<DialogMode, vscode.WebviewPanel>();

  public constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.updateLastActiveFilePath(vscode.window.activeTextEditor);
    this.context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor((activeTextEditor) => {
        this.updateLastActiveFilePath(activeTextEditor);
      }),
    );
  }

  public async open(): Promise<void> {
    await this.showDialog("open");
  }

  public async save(): Promise<void> {
    const activeDocument = vscode.window.activeTextEditor?.document;
    if (activeDocument === undefined) {
      await vscode.window.showErrorMessage("Open a file before saving.", "OK");
      return;
    }

    if (await fileExists(activeDocument)) {
      await vscode.commands.executeCommand(
        "workbench.action.files.save",
        undefined,
      );
      return;
    }

    this.documentToSave = activeDocument;
    await this.showDialog("save");
  }

  public async copyCurrentPath(): Promise<void> {
    const activeMode = this.getActivePanelMode();
    const currentDirectory =
      activeMode === undefined
        ? undefined
        : this.currentDirectories.get(activeMode);
    if (currentDirectory === undefined) {
      await vscode.window.showErrorMessage(
        "Open a Better Open File dialog before copying its path.",
        "OK",
      );
      return;
    }

    await vscode.env.clipboard.writeText(currentDirectory);
  }

  private async showDialog(mode: DialogMode): Promise<void> {
    const existingPanel = this.panels.get(mode);
    if (existingPanel !== undefined) {
      this.activeMode = mode;
      existingPanel.reveal(vscode.ViewColumn.Active);
      return;
    }

    const startupDirectory = await getStartupDirectory({
      fallbackFilePath: this.lastActiveFilePath,
    });
    const panel = vscode.window.createWebviewPanel(
      getViewType(mode),
      getTitle(mode),
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, "media"),
        ],
      },
    );

    this.panels.set(mode, panel);
    this.activeMode = mode;
    panel.onDidChangeViewState(
      (event) => {
        if (event.webviewPanel.active) {
          this.activeMode = mode;
        }
      },
      undefined,
      this.context.subscriptions,
    );
    panel.onDidDispose(
      () => {
        this.panels.delete(mode);
        this.currentDirectories.delete(mode);
        if (this.activeMode === mode) {
          this.activeMode = undefined;
        }
        if (mode === "save") {
          this.documentToSave = undefined;
        }
      },
      undefined,
      this.context.subscriptions,
    );

    panel.webview.html = getWebviewHtml(
      panel.webview,
      this.context.extensionUri,
      mode,
    );
    panel.webview.onDidReceiveMessage(
      async (rawMessage: unknown) => {
        await handleMessage(
          panel,
          rawMessage,
          startupDirectory,
          mode,
          this.documentToSave,
          (currentDirectory) => {
            this.currentDirectories.set(mode, currentDirectory);
          },
        );
      },
      undefined,
      this.context.subscriptions,
    );
  }

  private updateLastActiveFilePath(
    activeTextEditor: vscode.TextEditor | undefined,
  ): void {
    const activeDocument = activeTextEditor?.document;
    if (activeDocument !== undefined && isLocalFileDocument(activeDocument)) {
      this.lastActiveFilePath = activeDocument.uri.fsPath;
    }
  }

  private getActivePanelMode(): DialogMode | undefined {
    for (const [mode, panel] of this.panels) {
      if (panel.active) {
        return mode;
      }
    }

    return this.activeMode;
  }
}

function isLocalFileDocument(document: vscode.TextDocument): boolean {
  return document.uri.scheme === "file" && document.uri.fsPath !== "";
}

function getViewType(mode: DialogMode): string {
  return mode === "open" ? "betterOpenFile.open" : "betterOpenFile.save";
}

function getTitle(mode: DialogMode): string {
  return mode === "open" ? "Better Open File" : "Better Save File";
}

async function fileExists(document: vscode.TextDocument): Promise<boolean> {
  if (document.uri.scheme !== "file") {
    return false;
  }

  try {
    const stat = await fs.stat(document.uri.fsPath);
    return stat.isFile();
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return false;
    }

    throw error;
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
