import * as os from "node:os";
import path from "node:path";
import * as vscode from "vscode";
import { isDirectory } from "./dialogFilesystem.js";
import type { TabInputLike } from "./startupDirectory.js";
import { getActiveFilePathFromSources } from "./startupDirectory.js";

export async function getStartupDirectory(): Promise<string> {
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
