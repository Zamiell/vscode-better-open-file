import { isArray } from "complete-common";
import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import * as vscode from "vscode";
import type { TabInputLike } from "./startupDirectory.js";
import { getActiveFilePathFromSources } from "./startupDirectory.js";

const commandId = "betterOpenFile.openFile";

interface DialogOptions {
  readonly allowMultipleSelection: boolean;
  readonly foldersFirst: boolean;
  readonly showHiddenFiles: boolean;
}

interface FileEntry {
  readonly extension: string;
  readonly isDirectory: boolean;
  readonly modified: number;
  readonly name: string;
  readonly path: string;
  readonly size: number;
}

interface LocationEntry {
  readonly label: string;
  readonly path: string;
}

interface FileFilter {
  readonly label: string;
  readonly patterns: readonly string[];
}

interface DirectoryListing {
  readonly entries: readonly FileEntry[];
  readonly parentPath: string | undefined;
  readonly path: string;
}

type WebviewMessage =
  | {
      readonly type: "cancel";
    }
  | {
      readonly path: string;
      readonly type: "listDirectory" | "navigate";
    }
  | {
      readonly paths: readonly string[];
      readonly type: "openSelection";
    }
  | {
      readonly type: "ready";
    };

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

class BetterOpenFileController {
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

    panel.webview.html = this.getHtml(panel.webview);
    panel.webview.onDidReceiveMessage(
      async (rawMessage: unknown) => {
        await handleMessage(panel, rawMessage, startupDirectory);
      },
      undefined,
      this.context.subscriptions,
    );
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "dialog.css"),
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "dialog.js"),
    );
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
      "img-src data:",
    ].join("; ");

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta
      http-equiv="Content-Security-Policy"
      content="${csp}"
    >
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="${cssUri}">
    <title>Better Open File</title>
  </head>
  <body>
    <main class="dialog" aria-label="Better Open File">
      <header class="toolbar" aria-label="Navigation">
        <button id="backButton" class="icon-button" type="button" title="Back" aria-label="Back">
          <span class="navigation-icon back-icon" aria-hidden="true"></span>
        </button>
        <button id="forwardButton" class="icon-button" type="button" title="Forward" aria-label="Forward">
          <span class="navigation-icon forward-icon" aria-hidden="true"></span>
        </button>
        <button id="upButton" class="icon-button" type="button" title="Up" aria-label="Up">
          <span class="navigation-icon up-icon" aria-hidden="true"></span>
        </button>
        <button id="refreshButton" class="icon-button" type="button" title="Refresh" aria-label="Refresh">
          <svg class="refresh-icon" aria-hidden="true" viewBox="0 0 16 16" focusable="false">
            <path d="M13 5.5A5.5 5.5 0 1 0 13.5 10" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.4"/>
            <path d="M13 2.5v3h-3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.4"/>
          </svg>
        </button>
        <input id="addressInput" class="address" aria-label="Folder path">
      </header>

      <section class="body">
        <nav class="places" aria-label="Places">
          <div class="pane-title">Places</div>
          <div id="placesList" class="places-list"></div>
        </nav>

        <section class="files-pane" aria-label="Files">
          <div class="table-header" role="row">
            <button type="button" data-sort="name">Name</button>
            <button type="button" data-sort="modified">Date modified</button>
            <button type="button" data-sort="extension">Type</button>
            <button type="button" data-sort="size">Size</button>
          </div>
          <div
            id="fileList"
            class="file-list"
            role="listbox"
            aria-label="Files and folders"
            tabindex="0"
          ></div>
        </section>
      </section>

      <div id="errorStatus" class="error-status" role="alert" hidden></div>

      <footer class="footer">
        <div id="itemCount" class="item-count" aria-live="polite">0 items</div>
        <label for="fileNameInput">File name:</label>
        <input id="fileNameInput" aria-label="File name">
        <label for="filterSelect">Files of type:</label>
        <select id="filterSelect" aria-label="Files of type"></select>
        <button id="openButton" type="button" class="primary" disabled>Open</button>
        <button id="cancelButton" type="button">Cancel</button>
      </footer>
    </main>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>
`;
  }
}

async function listDirectory(
  directoryPath: string,
  options: DialogOptions,
): Promise<DirectoryListing> {
  const absolutePath = path.resolve(directoryPath);
  const directoryStat = await fs.stat(absolutePath);
  if (!directoryStat.isDirectory()) {
    throw new Error(`${absolutePath} is not a directory.`);
  }

  const directoryEntries = await fs.readdir(absolutePath, {
    withFileTypes: true,
  });
  const entries = await Promise.all(
    directoryEntries
      .filter((dirent) => options.showHiddenFiles || !isHiddenName(dirent.name))
      .map(async (dirent) => await toFileEntry(absolutePath, dirent)),
  );

  entries.sort((a, b) => compareEntries(a, b, options.foldersFirst));

  return {
    entries,
    parentPath: getParentPath(absolutePath),
    path: absolutePath,
  };
}

async function handleMessage(
  panel: vscode.WebviewPanel,
  rawMessage: unknown,
  startupDirectory: string,
) {
  const message = parseWebviewMessage(rawMessage);
  if (message === undefined) {
    await postError(panel, "The dialog sent an invalid message.");
    return;
  }

  switch (message.type) {
    case "ready": {
      await initialize(panel, startupDirectory);
      break;
    }

    case "listDirectory":
    case "navigate": {
      await sendDirectoryListing(panel, message.path);
      break;
    }

    case "openSelection": {
      await openSelection(panel, message.paths);
      break;
    }

    case "cancel": {
      panel.dispose();
      break;
    }
  }
}

async function initialize(
  panel: vscode.WebviewPanel,
  startupDirectory: string,
) {
  const options = getDialogOptions();
  const locations = await getLocations();

  await panel.webview.postMessage({
    directory: startupDirectory,
    filters: getFilters(),
    locations,
    options,
    type: "init",
  });
  await sendDirectoryListing(panel, startupDirectory);
}

async function openSelection(
  panel: vscode.WebviewPanel,
  selectedPaths: readonly string[],
) {
  if (selectedPaths.length === 0) {
    await postError(panel, "Select a file to open.");
    return;
  }

  const options = getDialogOptions();
  const pathsToOpen = options.allowMultipleSelection
    ? selectedPaths
    : selectedPaths.slice(0, 1);
  const selectedFiles = await Promise.all(
    pathsToOpen.map(async (selectedPath) => {
      const absolutePath = path.resolve(selectedPath);
      const stat = await fs.stat(absolutePath);
      return { absolutePath, isDirectory: stat.isDirectory() };
    }),
  );

  const directory = selectedFiles.find(
    (selectedFile) => selectedFile.isDirectory,
  );
  if (directory !== undefined) {
    if (selectedFiles.length === 1) {
      await sendDirectoryListing(panel, directory.absolutePath);
      return;
    }

    await postError(panel, "Folders cannot be opened with files.");
    return;
  }

  await Promise.all(
    selectedFiles.map((selectedFile) =>
      vscode.window.showTextDocument(
        vscode.Uri.file(selectedFile.absolutePath),
        {
          preview: false,
        },
      ),
    ),
  );

  panel.dispose();
}

async function sendDirectoryListing(
  panel: vscode.WebviewPanel,
  requestedPath: string,
) {
  try {
    const listing = await listDirectory(requestedPath, getDialogOptions());
    await panel.webview.postMessage({
      listing,
      type: "directoryListing",
    });
  } catch (error) {
    await postError(panel, getErrorMessage(error));
  }
}

async function getStartupDirectory(): Promise<string> {
  const activeFilePath = getActiveFilePath();
  const candidates: string[] =
    activeFilePath === undefined ? [] : [path.dirname(activeFilePath)];

  const workspaceFolder = getFirstLocalWorkspaceFolder();
  if (workspaceFolder !== undefined) {
    candidates.push(workspaceFolder.uri.fsPath);
  }
  candidates.push(os.homedir());

  const candidateChecks = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      isDirectory: await isDirectory(candidate),
    })),
  );
  const firstDirectory = candidateChecks.find(
    (candidateCheck) => candidateCheck.isDirectory,
  );
  if (firstDirectory !== undefined) {
    return path.resolve(firstDirectory.candidate);
  }

  return path.parse(process.cwd()).root;
}

async function toFileEntry(
  directoryPath: string,
  dirent: Dirent,
): Promise<FileEntry> {
  const entryPath = path.join(directoryPath, dirent.name);
  const stat = await fs.stat(entryPath);
  const entryIsDirectory = stat.isDirectory();

  return {
    extension: entryIsDirectory ? "Folder" : path.extname(dirent.name).slice(1),
    isDirectory: entryIsDirectory,
    modified: stat.mtimeMs,
    name: dirent.name,
    path: entryPath,
    size: entryIsDirectory ? 0 : stat.size,
  };
}

function getDialogOptions(): DialogOptions {
  const config = vscode.workspace.getConfiguration("betterOpenFile");
  return {
    allowMultipleSelection: config.get("allowMultipleSelection", false),
    foldersFirst: config.get("foldersFirst", true),
    showHiddenFiles: config.get("showHiddenFiles", false),
  };
}

function getFilters(): readonly FileFilter[] {
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

async function getLocations(): Promise<readonly LocationEntry[]> {
  const home = os.homedir();
  const baseLocations: readonly LocationEntry[] = [
    { label: "Home", path: home },
    { label: "Desktop", path: path.join(home, "Desktop") },
    { label: "Documents", path: path.join(home, "Documents") },
    { label: "Downloads", path: path.join(home, "Downloads") },
    ...(vscode.workspace.workspaceFolders ?? [])
      .filter((workspaceFolder) => workspaceFolder.uri.scheme === "file")
      .map((workspaceFolder) => ({
        label: workspaceFolder.name,
        path: workspaceFolder.uri.fsPath,
      })),
  ];
  const locationChecks = await Promise.all(
    baseLocations.map(async (location) => ({
      exists: await isDirectory(location.path),
      location: { label: location.label, path: path.resolve(location.path) },
    })),
  );
  const drivePaths = await getDrivePaths();
  const driveLocations = drivePaths.map((drivePath) => ({
    label: drivePath,
    path: drivePath,
  }));

  return dedupeLocations([
    ...locationChecks
      .filter((locationCheck) => locationCheck.exists)
      .map((locationCheck) => locationCheck.location),
    ...driveLocations,
  ]);
}

async function getDrivePaths(): Promise<readonly string[]> {
  if (process.platform !== "win32") {
    return [path.parse(os.homedir()).root];
  }

  const letters = [
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
    "H",
    "I",
    "J",
    "K",
    "L",
    "M",
    "N",
    "O",
    "P",
    "Q",
    "R",
    "S",
    "T",
    "U",
    "V",
    "W",
    "X",
    "Y",
    "Z",
  ];
  const checks = await Promise.all(
    letters.map(async (letter) => {
      const drivePath = `${letter}:\\`;
      try {
        await fs.access(drivePath);
        return drivePath;
      } catch {
        return undefined;
      }
    }),
  );

  return checks.filter((drivePath) => drivePath !== undefined);
}

function getActiveFilePath(): string | undefined {
  const activeEditorUri = vscode.window.activeTextEditor?.document.uri;
  const activeTabInput =
    vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (activeTabInput instanceof vscode.TabInputText) {
    return getActiveFilePathFromSources(activeEditorUri, {
      kind: "text",
      uri: activeTabInput.uri,
    });
  }

  if (activeTabInput instanceof vscode.TabInputTextDiff) {
    return getActiveFilePathFromSources(activeEditorUri, {
      kind: "textDiff",
      modified: activeTabInput.modified,
    });
  }

  return getActiveFilePathFromSources(
    activeEditorUri,
    undefined satisfies TabInputLike,
  );
}

function getFirstLocalWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.workspaceFolders?.find(
    (workspaceFolder) => workspaceFolder.uri.scheme === "file",
  );
}

async function isDirectory(directoryPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(directoryPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

function getParentPath(directoryPath: string): string | undefined {
  const parentPath = path.dirname(directoryPath);
  return parentPath === directoryPath ? undefined : parentPath;
}

function compareEntries(
  first: FileEntry,
  second: FileEntry,
  foldersFirst: boolean,
): number {
  if (foldersFirst && first.isDirectory !== second.isDirectory) {
    return first.isDirectory ? -1 : 1;
  }

  return first.name.localeCompare(second.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function dedupeLocations(
  locations: readonly LocationEntry[],
): readonly LocationEntry[] {
  const seen = new Set<string>();
  return locations.filter((location) => {
    const key =
      process.platform === "win32"
        ? location.path.toLowerCase()
        : location.path;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function isHiddenName(name: string): boolean {
  return name.startsWith(".");
}

function parseWebviewMessage(rawMessage: unknown): WebviewMessage | undefined {
  if (!isRecord(rawMessage) || typeof rawMessage["type"] !== "string") {
    return undefined;
  }

  switch (rawMessage["type"]) {
    case "cancel":
    case "ready": {
      return { type: rawMessage["type"] };
    }

    case "listDirectory":
    case "navigate": {
      if (typeof rawMessage["path"] === "string") {
        return { path: rawMessage["path"], type: rawMessage["type"] };
      }
      return undefined;
    }

    case "openSelection": {
      if (
        isArray(rawMessage["paths"])
        && rawMessage["paths"].every(
          (selectedPath) => typeof selectedPath === "string",
        )
      ) {
        return { paths: rawMessage["paths"], type: "openSelection" };
      }
      return undefined;
    }

    default: {
      return undefined;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unknown error occurred.";
}

async function postError(panel: vscode.WebviewPanel, message: string) {
  await panel.webview.postMessage({
    message,
    type: "error",
  });
}

function getNonce(): string {
  const possibleCharacters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";

  for (let index = 0; index < 32; index++) {
    const characterIndex = Math.floor(
      Math.random() * possibleCharacters.length,
    );
    nonce += possibleCharacters.charAt(characterIndex);
  }

  return nonce;
}
