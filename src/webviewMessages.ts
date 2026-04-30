import { isArray } from "complete-common";
import * as fs from "node:fs/promises";
import path from "node:path";
import * as vscode from "vscode";
import { listDirectory } from "./dialogFilesystem.js";
import { getDialogOptions } from "./dialogOptions.js";

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

  await panel.webview.postMessage({
    directory: startupDirectory,
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
