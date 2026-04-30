import * as vscode from "vscode";
import { getStartupDirectory } from "./startupDirectoryResolver.js";
import { getWebviewHtml } from "./webviewHtml.js";
import { handleMessage } from "./webviewMessages.js";

export class BetterOpenFileController {
  private readonly context: vscode.ExtensionContext;

  private panel: vscode.WebviewPanel | undefined;

  public constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  public async open(): Promise<void> {
    if (this.panel !== undefined) {
      this.panel.reveal(vscode.ViewColumn.Active);
      return;
    }

    const startupDirectory = await getStartupDirectory();
    const panel = vscode.window.createWebviewPanel(
      "betterOpenFile",
      "Better Open File",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, "media"),
        ],
      },
    );

    this.panel = panel;
    panel.onDidDispose(
      () => {
        this.panel = undefined;
      },
      undefined,
      this.context.subscriptions,
    );

    panel.webview.html = getWebviewHtml(
      panel.webview,
      this.context.extensionUri,
    );
    panel.webview.onDidReceiveMessage(
      async (rawMessage: unknown) => {
        await handleMessage(panel, rawMessage, startupDirectory);
      },
      undefined,
      this.context.subscriptions,
    );
  }
}
