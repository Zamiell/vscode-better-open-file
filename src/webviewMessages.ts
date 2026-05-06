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
      readonly type: "createFile";
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
      readonly currentDirectory: string;
      readonly paths: readonly string[];
      readonly type: "pasteSelection";
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
      readonly currentDirectory: string;
      readonly newName: string;
      readonly path: string;
      readonly type: "renameSelection";
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

    case "renameSelection": {
      await renameSelection(
        panel,
        message.currentDirectory,
        message.path,
        message.newName,
      );
      break;
    }

    case "createDirectory": {
      await createDirectory(panel, message.currentDirectory);
      break;
    }

    case "createFile": {
      await createFile(panel, message.currentDirectory);
      break;
    }

    case "deleteSelection": {
      await deleteSelection(panel, message.currentDirectory, message.paths);
      break;
    }

    case "pasteSelection": {
      await pasteSelection(panel, message.currentDirectory, message.paths);
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
    await sendDirectoryListing(
      panel,
      absoluteDirectory,
      newDirectoryPath,
      newDirectoryPath,
    );
  } catch (error) {
    await postError(panel, getErrorMessage(error));
  }
}

async function createFile(
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

    const newFilePath = await createUniqueTextDocument(absoluteDirectory);
    await sendDirectoryListing(
      panel,
      absoluteDirectory,
      newFilePath,
      newFilePath,
    );
  } catch (error) {
    await postError(panel, getErrorMessage(error));
  }
}

async function renameSelection(
  panel: vscode.WebviewPanel,
  currentDirectory: string,
  selectedPath: string,
  newName: string,
) {
  try {
    const absoluteDirectory = path.resolve(currentDirectory);
    const absoluteSelectedPath = path.resolve(selectedPath);
    if (!isDirectChildPath(absoluteDirectory, absoluteSelectedPath)) {
      await postError(panel, "Select an item in the current directory.");
      return;
    }

    if (!isValidFileName(newName)) {
      await postError(panel, "Enter a valid name without path separators.");
      return;
    }

    const renamedPath = path.join(absoluteDirectory, newName);
    if (renamedPath === absoluteSelectedPath) {
      await sendDirectoryListing(
        panel,
        absoluteDirectory,
        absoluteSelectedPath,
      );
      return;
    }

    await assertRenameTargetIsAvailable(absoluteSelectedPath, renamedPath);
    await fs.rename(absoluteSelectedPath, renamedPath);
    await sendDirectoryListing(panel, absoluteDirectory, renamedPath);
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
  renamePath?: string,
) {
  try {
    const listing = await listDirectory(requestedPath);
    await panel.webview.postMessage({
      listing,
      renamePath,
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

    case "createDirectory":
    case "createFile": {
      const { currentDirectory } = rawMessage;

      return typeof currentDirectory === "string"
        ? { currentDirectory, type: rawMessage["type"] }
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

      return Array.isArray(paths)
        && paths.every((selectedPath) => typeof selectedPath === "string")
        ? { paths, type: "openSelection" }
        : undefined;
    }

    case "renameSelection": {
      const { currentDirectory, newName, path: selectedPath } = rawMessage;

      return typeof currentDirectory === "string"
        && typeof newName === "string"
        && typeof selectedPath === "string"
        ? {
            currentDirectory,
            newName,
            path: selectedPath,
            type: "renameSelection",
          }
        : undefined;
    }

    case "deleteSelection": {
      const { currentDirectory, paths } = rawMessage;

      return typeof currentDirectory === "string"
        && Array.isArray(paths)
        && paths.every((selectedPath) => typeof selectedPath === "string")
        ? { currentDirectory, paths, type: "deleteSelection" }
        : undefined;
    }

    case "pasteSelection": {
      const { currentDirectory, paths } = rawMessage;

      return typeof currentDirectory === "string"
        && Array.isArray(paths)
        && paths.every((selectedPath) => typeof selectedPath === "string")
        ? { currentDirectory, paths, type: "pasteSelection" }
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

function isDirectChildPath(parentPath: string, childPath: string): boolean {
  const relativePath = path.relative(parentPath, childPath);
  return (
    relativePath !== ""
    && !relativePath.startsWith("..")
    && !path.isAbsolute(relativePath)
    && !relativePath.includes(path.sep)
  );
}

function isValidFileName(name: string): boolean {
  return (
    name.trim() !== ""
    && name !== "."
    && name !== ".."
    && !name.includes("/")
    && !name.includes("\\")
  );
}

async function assertRenameTargetIsAvailable(
  sourcePath: string,
  targetPath: string,
) {
  if (!(await pathExists(targetPath))) {
    return;
  }

  const [sourceStats, targetStats] = await Promise.all([
    fs.lstat(sourcePath),
    fs.lstat(targetPath),
  ]);
  if (
    sourceStats.dev === targetStats.dev
    && sourceStats.ino === targetStats.ino
  ) {
    return;
  }

  throw new Error(`"${path.basename(targetPath)}" already exists.`);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return false;
    }

    throw error;
  }
}

async function createUniqueDirectory(parentPath: string): Promise<string> {
  const directoryEntries = await fs.readdir(parentPath);
  const existingNames = new Set(
    directoryEntries.map((directoryEntry) => directoryEntry.toLowerCase()),
  );
  const directoryName = getAvailableName(existingNames, "New folder");
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

async function createUniqueTextDocument(parentPath: string): Promise<string> {
  const directoryEntries = await fs.readdir(parentPath);
  const existingNames = new Set(
    directoryEntries.map((directoryEntry) => directoryEntry.toLowerCase()),
  );
  const fileName = getAvailableName(existingNames, "New Text Document", ".txt");
  const filePath = path.join(parentPath, fileName);

  try {
    await fs.writeFile(filePath, "", { flag: "wx" });
    return filePath;
  } catch (error) {
    if (hasErrorCode(error, "EEXIST")) {
      return await createUniqueTextDocument(parentPath);
    }

    throw error;
  }
}

function getAvailableName(
  existingNames: ReadonlySet<string>,
  name: string,
  extension = "",
): string {
  for (let index = 1; ; index++) {
    const availableName =
      index === 1 ? `${name}${extension}` : `${name} (${index})${extension}`;
    if (!existingNames.has(availableName.toLowerCase())) {
      return availableName;
    }
  }
}

async function pasteSelection(
  panel: vscode.WebviewPanel,
  currentDirectory: string,
  selectedPaths: readonly string[],
) {
  try {
    if (selectedPaths.length === 0) {
      await postError(panel, "Copy a file before pasting.");
      return;
    }

    const absoluteDirectory = path.resolve(currentDirectory);
    const stat = await fs.stat(absoluteDirectory);
    if (!stat.isDirectory()) {
      await postError(panel, `${absoluteDirectory} is not a directory.`);
      return;
    }

    let lastCopiedPath: string | undefined;
    for (const selectedPath of selectedPaths) {
      // Copies are sequential so duplicate names are allocated after each file lands.
      // eslint-disable-next-line no-await-in-loop
      lastCopiedPath = await copyPathToDirectory(
        path.resolve(selectedPath),
        absoluteDirectory,
      );
    }

    await sendDirectoryListing(panel, absoluteDirectory, lastCopiedPath);
  } catch (error) {
    await postError(panel, getErrorMessage(error));
  }
}

async function copyPathToDirectory(
  sourcePath: string,
  targetDirectory: string,
): Promise<string> {
  const sourceStat = await fs.stat(sourcePath);
  const targetPath = await getAvailableCopyPath(
    targetDirectory,
    path.basename(sourcePath),
    sourceStat.isDirectory(),
  );

  try {
    await fs.cp(sourcePath, targetPath, {
      errorOnExist: true,
      force: false,
      recursive: sourceStat.isDirectory(),
    });
    return targetPath;
  } catch (error) {
    if (hasErrorCode(error, "EEXIST")) {
      return await copyPathToDirectory(sourcePath, targetDirectory);
    }

    throw error;
  }
}

async function getAvailableCopyPath(
  parentPath: string,
  sourceName: string,
  sourceIsDirectory: boolean,
): Promise<string> {
  const directoryEntries = await fs.readdir(parentPath);
  const existingNames = new Set(
    directoryEntries.map((directoryEntry) => directoryEntry.toLowerCase()),
  );
  const { extension, name } = splitCopyName(sourceName, sourceIsDirectory);

  return path.join(
    parentPath,
    getAvailableName(existingNames, name, extension),
  );
}

function splitCopyName(
  fileName: string,
  fileIsDirectory: boolean,
): { readonly extension: string; readonly name: string } {
  if (fileIsDirectory) {
    return { extension: "", name: fileName };
  }

  const extensionIndex = fileName.lastIndexOf(".");
  if (extensionIndex <= 0) {
    return { extension: "", name: fileName };
  }

  return {
    extension: fileName.slice(extensionIndex),
    name: fileName.slice(0, extensionIndex),
  };
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
