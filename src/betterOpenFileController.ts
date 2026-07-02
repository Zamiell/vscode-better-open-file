import * as vscode from "vscode";
import { getStartupDirectory } from "./startupDirectoryResolver.js";
import type { DialogMode } from "./types.js";
import { getWebviewHtml } from "./webviewHtml.js";
import { handleMessage } from "./webviewMessages.js";

export class BetterOpenFileController {
  private readonly context: vscode.ExtensionContext;

  private documentToSave: vscode.TextDocument | undefined;

  private readonly panels = new Map<DialogMode, vscode.WebviewPanel>();

  public constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  public async open(): Promise<void> {
    await this.showDialog("open");
  }

  public async save(): Promise<void> {
    if (vscode.window.activeTextEditor === undefined) {
      await vscode.window.showErrorMessage("Open a file before saving.", "OK");
      return;
    }

    this.documentToSave = vscode.window.activeTextEditor.document;
    await this.showDialog("save");
  }

  private async showDialog(mode: DialogMode): Promise<void> {
    const existingPanel = this.panels.get(mode);
    if (existingPanel !== undefined) {
      existingPanel.reveal(vscode.ViewColumn.Active);
      return;
    }

    const startupDirectory = await getStartupDirectory();
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
    panel.onDidDispose(
      () => {
        this.panels.delete(mode);
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
        );
      },
      undefined,
      this.context.subscriptions,
    );
  }
}

function getViewType(mode: DialogMode): string {
  return mode === "open" ? "betterOpenFile.open" : "betterOpenFile.save";
}

function getTitle(mode: DialogMode): string {
  return mode === "open" ? "Better Open File" : "Better Save File";
}
