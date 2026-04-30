import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";
import type { DirectoryListing, FileEntry } from "./types.js";

export async function listDirectory(
  directoryPath: string,
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
    directoryEntries.map(
      async (dirent) => await toFileEntry(absolutePath, dirent),
    ),
  );

  entries.sort(compareEntries);

  return {
    entries,
    parentPath: getParentPath(absolutePath),
    path: absolutePath,
  };
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
    isDirectory: entryIsDirectory,
    modified: stat.mtimeMs,
    name: dirent.name,
    path: entryPath,
    size: entryIsDirectory ? 0 : stat.size,
  };
}

function getParentPath(directoryPath: string): string | undefined {
  const parentPath = path.dirname(directoryPath);
  return parentPath === directoryPath ? undefined : parentPath;
}

function compareEntries(first: FileEntry, second: FileEntry): number {
  if (first.isDirectory !== second.isDirectory) {
    return first.isDirectory ? -1 : 1;
  }

  return first.name.localeCompare(second.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
