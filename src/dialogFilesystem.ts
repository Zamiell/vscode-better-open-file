import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import * as vscode from "vscode";
import type {
  DialogOptions,
  DirectoryListing,
  FileEntry,
  LocationEntry,
} from "./types.js";

export async function listDirectory(
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

export async function getLocations(): Promise<readonly LocationEntry[]> {
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

export async function isDirectory(directoryPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(directoryPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
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
