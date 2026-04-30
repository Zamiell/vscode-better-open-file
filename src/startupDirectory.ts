export interface FileUriLike {
  readonly fsPath?: string;
  readonly path?: string;
}

export interface TextTabInputLike {
  readonly kind: "text";
  readonly uri: FileUriLike;
}

export interface TextDiffTabInputLike {
  readonly kind: "textDiff";
  readonly modified: FileUriLike;
}

export type TabInputLike = TextDiffTabInputLike | TextTabInputLike | undefined;

export function getActiveFilePathFromSources(
  activeEditorUri: FileUriLike | undefined,
  activeTabInput: TabInputLike,
): string | undefined {
  const activeEditorPath = getUsableUriPath(activeEditorUri);
  if (activeEditorPath !== undefined) {
    return activeEditorPath;
  }

  if (activeTabInput?.kind === "text") {
    return getUsableUriPath(activeTabInput.uri);
  }

  if (activeTabInput?.kind === "textDiff") {
    return getUsableUriPath(activeTabInput.modified);
  }

  return undefined;
}

function getUsableUriPath(uri: FileUriLike | undefined): string | undefined {
  if (uri?.fsPath !== undefined && uri.fsPath !== "") {
    return uri.fsPath;
  }

  if (uri?.path !== undefined && uri.path !== "") {
    return uri.path;
  }

  return undefined;
}
