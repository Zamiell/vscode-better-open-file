import * as fs from "node:fs/promises";
import path from "node:path";
import * as vscode from "vscode";
import { listDirectory } from "./dialogFilesystem.js";

type WebviewMessage =
  | {
      readonly type: "cancel";
    }
  | {
      readonly currentDirectory: string;
      readonly type: "createDirectory";
    }
  | {
      readonly currentDirectory: string;
      readonly paths: readonly string[];
      readonly type: "deleteSelection";
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

export async function handleMessage(
  panel: vscode.WebviewPanel,
  rawMessage: unknown,
  startupDirectory: string,
): Promise<void> {
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

    case "createDirectory": {
      await createDirectory(panel, message.currentDirectory);
      break;
    }

    case "deleteSelection": {
      await deleteSelection(panel, message.currentDirectory, message.paths);
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
  await panel.webview.postMessage({
    directory: startupDirectory,
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

  const selectedFiles = await Promise.all(
    selectedPaths.map(async (selectedPath) => {
      const absolutePath = path.resolve(selectedPath);
      const stat = await fs.stat(absolutePath);
      return { absolutePath, isDirectory: stat.isDirectory() };
    }),
  );

  const selectedDirectories = selectedFiles.filter(
    (selectedFile) => selectedFile.isDirectory,
  );
  const firstDirectory = selectedDirectories[0];
  if (firstDirectory !== undefined) {
    if (selectedFiles.length === 1) {
      await sendDirectoryListing(panel, firstDirectory.absolutePath);
      return;
    }

    if (selectedDirectories.length === selectedFiles.length) {
      await postError(
        panel,
        "You cannot open more than one directory at a time.",
      );
      return;
    }

    await postError(
      panel,
      "Directories and files cannot be opened at the same.",
    );
    return;
  }

  const selectedDocuments = await Promise.all(
    selectedFiles.map(
      async (selectedFile) =>
        await vscode.workspace.openTextDocument(
          vscode.Uri.file(selectedFile.absolutePath),
        ),
    ),
  );
  panel.dispose();

  await Promise.all(
    selectedDocuments.map(
      async (selectedDocument) =>
        await vscode.window.showTextDocument(selectedDocument, {
          preview: false,
        }),
    ),
  );
}

async function createDirectory(
  panel: vscode.WebviewPanel,
  currentDirectory: string,
) {
  try {
    const absoluteDirectory = path.resolve(currentDirectory);
    const stat = await fs.stat(absoluteDirectory);
    if (!stat.isDirectory()) {
      await postError(panel, `${absoluteDirectory} is not a directory.`);
      return;
    }

    const newDirectoryPath = await createUniqueDirectory(absoluteDirectory);
    await sendDirectoryListing(panel, absoluteDirectory, newDirectoryPath);
  } catch (error) {
    await postError(panel, getErrorMessage(error));
  }
}

async function deleteSelection(
  panel: vscode.WebviewPanel,
  currentDirectory: string,
  selectedPaths: readonly string[],
) {
  try {
    if (selectedPaths.length === 0) {
      await postError(panel, "Select a file to delete.");
      return;
    }

    const selectedFiles = await Promise.all(
      selectedPaths.map(async (selectedPath) => {
        const absolutePath = path.resolve(selectedPath);
        const stat = await fs.stat(absolutePath);
        return { absolutePath, isDirectory: stat.isDirectory() };
      }),
    );

    const confirmation = await vscode.window.showWarningMessage(
      getDeleteConfirmationMessage(selectedFiles),
      { modal: true },
      "Delete",
    );
    if (confirmation !== "Delete") {
      return;
    }

    await Promise.all(
      selectedFiles.map(async (selectedFile) => {
        if (selectedFile.isDirectory) {
          await fs.rm(selectedFile.absolutePath, { recursive: true });
          return;
        }

        await fs.unlink(selectedFile.absolutePath);
      }),
    );

    await sendDirectoryListing(panel, currentDirectory);
  } catch (error) {
    await postError(panel, getErrorMessage(error));
  }
}

async function sendDirectoryListing(
  panel: vscode.WebviewPanel,
  requestedPath: string,
  selectedPath?: string,
) {
  try {
    const listing = await listDirectory(requestedPath);
    await panel.webview.postMessage({
      listing,
      selectedPath,
      type: "directoryListing",
    });
  } catch (error) {
    await postError(panel, getErrorMessage(error));
  }
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

    case "createDirectory": {
      const { currentDirectory } = rawMessage;

      return typeof currentDirectory === "string"
        ? { currentDirectory, type: "createDirectory" }
        : undefined;
    }

    case "listDirectory":
    case "navigate": {
      if (typeof rawMessage["path"] === "string") {
        return { path: rawMessage["path"], type: rawMessage["type"] };
      }
      return undefined;
    }

    case "openSelection": {
      const { paths } = rawMessage;

      return (
        // eslint-disable-next-line complete/prefer-is-array
        Array.isArray(paths)
          && paths.every((selectedPath) => typeof selectedPath === "string")
          ? { paths, type: "openSelection" }
          : undefined
      );
    }

    case "deleteSelection": {
      const { currentDirectory, paths } = rawMessage;

      return typeof currentDirectory === "string"
        // eslint-disable-next-line complete/prefer-is-array
        && Array.isArray(paths)
        && paths.every((selectedPath) => typeof selectedPath === "string")
        ? { currentDirectory, paths, type: "deleteSelection" }
        : undefined;
    }

    default: {
      return undefined;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function createUniqueDirectory(parentPath: string): Promise<string> {
  const directoryEntries = await fs.readdir(parentPath);
  const existingNames = new Set(
    directoryEntries.map((directoryEntry) => directoryEntry.toLowerCase()),
  );
  const directoryName = getAvailableDirectoryName(existingNames);
  const directoryPath = path.join(parentPath, directoryName);

  try {
    await fs.mkdir(directoryPath);
    return directoryPath;
  } catch (error) {
    if (hasErrorCode(error, "EEXIST")) {
      return await createUniqueDirectory(parentPath);
    }

    throw error;
  }
}

function getAvailableDirectoryName(existingNames: ReadonlySet<string>): string {
  for (let index = 1; ; index++) {
    // "New folder" is what Windows calls new directories by default, so we match this convention.
    const directoryName = index === 1 ? "New folder" : `New folder (${index})`;
    if (!existingNames.has(directoryName.toLowerCase())) {
      return directoryName;
    }
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unknown error occurred.";
}

function getDeleteConfirmationMessage(
  selectedFiles: ReadonlyArray<{
    readonly absolutePath: string;
    readonly isDirectory: boolean;
  }>,
): string {
  const firstSelectedFile = selectedFiles[0];
  if (selectedFiles.length === 1 && firstSelectedFile !== undefined) {
    return `Delete "${path.basename(firstSelectedFile.absolutePath)}"?`;
  }

  return `Delete ${selectedFiles.length} items?`;
}

async function postError(panel: vscode.WebviewPanel, message: string) {
  await panel.webview.postMessage({
    message,
    type: "error",
  });
}
