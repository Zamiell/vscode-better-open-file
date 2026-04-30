declare function acquireVsCodeApi(): {
  readonly postMessage: (message: WebviewToHostMessage) => void;
};

interface DialogOptions {
  readonly allowMultipleSelection: boolean;
  readonly foldersFirst: boolean;
}

interface FileEntry {
  readonly isDirectory: boolean;
  readonly modified: number;
  readonly name: string;
  readonly path: string;
  readonly size: number;
}

interface DirectoryListing {
  readonly entries: readonly FileEntry[];
  readonly parentPath: string | undefined;
  readonly path: string;
}

type HostToWebviewMessage =
  | {
      readonly directory: string;
      readonly options: DialogOptions;
      readonly type: "init";
    }
  | {
      readonly listing: DirectoryListing;
      readonly type: "directoryListing";
    }
  | {
      readonly message: string;
      readonly type: "error";
    };

type WebviewToHostMessage =
  | {
      readonly path: string;
      readonly type: "listDirectory" | "navigate";
    }
  | {
      readonly paths: readonly string[];
      readonly type: "openSelection";
    }
  | {
      readonly type: "cancel" | "ready";
    };

interface DialogState {
  allowMultipleSelection: boolean;
  currentPath: string;
  entries: readonly FileEntry[];
  filteredEntries: readonly FileEntry[];
  foldersFirst: boolean;
  forwardStack: string[];
  historyStack: string[];
  parentPath: string | undefined;
  selectedPaths: Set<string>;
}

const vscode = acquireVsCodeApi();

const state: DialogState = {
  allowMultipleSelection: false,
  currentPath: "",
  entries: [],
  filteredEntries: [],
  foldersFirst: true,
  forwardStack: [],
  historyStack: [],
  parentPath: undefined,
  selectedPaths: new Set<string>(),
};

const fileListSearchResetMs = 1000;
let fileListSearchPrefix = "";
let fileListSearchUpdatedAt = 0;

const elements = {
  addressInput: getElement("addressInput", HTMLInputElement),
  backButton: getElement("backButton", HTMLButtonElement),
  cancelButton: getElement("cancelButton", HTMLButtonElement),
  errorStatus: getElement("errorStatus", HTMLDivElement),
  fileList: getElement("fileList", HTMLDivElement),
  fileNameInput: getElement("fileNameInput", HTMLInputElement),
  forwardButton: getElement("forwardButton", HTMLButtonElement),
  itemCount: getElement("itemCount", HTMLDivElement),
  openButton: getElement("openButton", HTMLButtonElement),
  refreshButton: getElement("refreshButton", HTMLButtonElement),
  upButton: getElement("upButton", HTMLButtonElement),
};

globalThis.addEventListener("DOMContentLoaded", () => {
  registerEventHandlers();
  vscode.postMessage({ type: "ready" });
});

globalThis.addEventListener(
  "message",
  (event: MessageEvent<HostToWebviewMessage>) => {
    const message = event.data;

    if (message.type === "init") {
      state.allowMultipleSelection = message.options.allowMultipleSelection;
      state.foldersFirst = message.options.foldersFirst;
      elements.addressInput.value = message.directory;
      return;
    }

    if (message.type === "directoryListing") {
      setDirectoryListing(message.listing);
      return;
    }

    showError(message.message);
  },
);

function registerEventHandlers() {
  elements.addressInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      navigateTo(elements.addressInput.value);
    }
  });

  elements.fileNameInput.addEventListener("input", () => {
    renderFileList();
    selectFirstEntry(false);
  });

  elements.fileNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      openSelection();
    }
  });

  elements.openButton.addEventListener("click", openSelection);
  elements.cancelButton.addEventListener("click", () => {
    vscode.postMessage({ type: "cancel" });
  });

  elements.refreshButton.addEventListener("click", () => {
    vscode.postMessage({ path: state.currentPath, type: "listDirectory" });
  });

  elements.upButton.addEventListener("click", navigateUp);

  elements.backButton.addEventListener("click", () => {
    const previousPath = state.historyStack.pop();
    if (previousPath !== undefined) {
      state.forwardStack.push(state.currentPath);
      requestDirectory(previousPath);
    }
  });

  elements.forwardButton.addEventListener("click", () => {
    const nextPath = state.forwardStack.pop();
    if (nextPath !== undefined) {
      state.historyStack.push(state.currentPath);
      requestDirectory(nextPath);
    }
  });

  elements.fileList.addEventListener("keydown", (event) => {
    handleFileListKeydown(event);
  });
  elements.fileList.addEventListener("click", (event) => {
    if (isFileRowClick(event.target)) {
      return;
    }

    clearSelection();
    elements.fileList.focus();
  });

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.altKey && event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        navigateUp();
        return;
      }

      if (isPlainAltKeyEvent(event)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (event.key === "Escape") {
        vscode.postMessage({ type: "cancel" });
      }
    },
    { capture: true },
  );
  document.addEventListener(
    "keyup",
    (event) => {
      if (isPlainAltKeyEvent(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    { capture: true },
  );
}

function setDirectoryListing(listing: DirectoryListing) {
  state.currentPath = listing.path;
  state.entries = listing.entries;
  state.parentPath = listing.parentPath;
  state.selectedPaths.clear();
  resetFileListSearch();
  elements.addressInput.value = listing.path;
  elements.fileNameInput.value = "";

  renderFileList();
  selectFirstEntry(true);
  updateNavigationButtons();
  hideError();
  setItemCount(listing.entries.length);
}

function navigateTo(directoryPath: string) {
  if (directoryPath === "" || directoryPath === state.currentPath) {
    return;
  }

  if (state.currentPath !== "") {
    state.historyStack.push(state.currentPath);
  }

  state.forwardStack = [];
  requestDirectory(directoryPath);
}

function navigateUp() {
  if (state.parentPath !== undefined) {
    navigateTo(state.parentPath);
  }
}

function requestDirectory(directoryPath: string) {
  vscode.postMessage({ path: directoryPath, type: "navigate" });
}

function renderFileList() {
  state.filteredEntries = getFilteredEntries();
  elements.fileList.textContent = "";

  for (const entry of state.filteredEntries) {
    elements.fileList.append(createFileRow(entry));
  }
}

function createFileRow(entry: FileEntry) {
  const row = document.createElement("div");
  row.className = "file-row";
  row.dataset["path"] = entry.path;
  row.role = "option";
  row.tabIndex = -1;

  const name = document.createElement("div");
  name.className = "file-name";

  const icon = document.createElement("span");
  icon.ariaHidden = "true";
  icon.className = `file-icon ${
    entry.isDirectory ? "folder-icon" : "document-icon"
  }`;
  name.append(icon);

  const nameText = document.createElement("span");
  nameText.className = "file-name-text";
  nameText.textContent = entry.name;
  name.append(nameText);

  row.append(name);

  const modified = document.createElement("div");
  modified.className = "file-meta";
  modified.textContent = new Date(entry.modified).toLocaleString();
  row.append(modified);

  const size = document.createElement("div");
  size.className = "file-meta";
  size.textContent = entry.isDirectory ? "" : formatSize(entry.size);
  row.append(size);

  row.addEventListener("click", (event) => {
    selectEntry(entry, event.ctrlKey || event.metaKey, event.shiftKey);
    focusEntry(entry.path);
  });
  row.addEventListener("dblclick", () => {
    if (entry.isDirectory) {
      navigateTo(entry.path);
      return;
    }

    state.selectedPaths = new Set([entry.path]);
    openSelection();
  });

  return row;
}

function getFilteredEntries(): readonly FileEntry[] {
  const fileNameNeedle = elements.fileNameInput.value.trim().toLowerCase();

  return state.entries.filter((entry) => {
    if (
      fileNameNeedle !== ""
      && !entry.name.toLowerCase().includes(fileNameNeedle)
    ) {
      return false;
    }

    return true;
  });
}

function selectEntry(
  entry: FileEntry,
  toggleSelection: boolean,
  rangeSelection: boolean,
) {
  if (!state.allowMultipleSelection || (!toggleSelection && !rangeSelection)) {
    state.selectedPaths = new Set([entry.path]);
  } else if (toggleSelection && state.selectedPaths.has(entry.path)) {
    state.selectedPaths.delete(entry.path);
  } else {
    state.selectedPaths.add(entry.path);
  }

  updateRenderedSelection();
  updateOpenButton();
}

function clearSelection() {
  state.selectedPaths.clear();
  updateRenderedSelection();
  updateOpenButton();
}

function selectFirstEntry(focusSelectedEntry: boolean) {
  const firstEntry = state.filteredEntries[0];
  if (firstEntry === undefined) {
    state.selectedPaths.clear();
    updateOpenButton();
    return;
  }

  state.selectedPaths = new Set([firstEntry.path]);
  updateRenderedSelection();
  updateOpenButton();
  if (focusSelectedEntry) {
    focusEntry(firstEntry.path);
  }
}

function isFileRowClick(target: EventTarget | null): boolean {
  return (
    target instanceof Element
    && target.closest(".file-row") !== null
    && elements.fileList.contains(target)
  );
}

function focusEntry(entryPath: string) {
  elements.fileList
    .querySelector<HTMLElement>(getEntrySelector(entryPath))
    ?.focus();
}

function updateRenderedSelection() {
  for (const row of elements.fileList.querySelectorAll<HTMLElement>(
    ".file-row",
  )) {
    const rowPath = row.dataset["path"];
    const isSelected =
      rowPath !== undefined && state.selectedPaths.has(rowPath);
    row.classList.toggle("selected", isSelected);
    row.ariaSelected = String(isSelected);
  }
}

function updateOpenButton() {
  elements.openButton.disabled = state.selectedPaths.size === 0;
}

function openSelection() {
  const selectedPaths = [...state.selectedPaths];
  if (selectedPaths.length > 0) {
    vscode.postMessage({ paths: selectedPaths, type: "openSelection" });
    return;
  }

  const typedName = elements.fileNameInput.value.trim();
  if (typedName === "") {
    showError("Select a file to open.");
    return;
  }

  const typedEntry = state.entries.find((entry) => entry.name === typedName);
  if (typedEntry !== undefined) {
    vscode.postMessage({ paths: [typedEntry.path], type: "openSelection" });
    return;
  }

  const separator = state.currentPath.includes("\\") ? "\\" : "/";
  vscode.postMessage({
    paths: [`${state.currentPath}${separator}${typedName}`],
    type: "openSelection",
  });
}

function handleFileListKeydown(event: KeyboardEvent) {
  if (state.filteredEntries.length === 0) {
    return;
  }

  if (event.key === "Enter") {
    resetFileListSearch();
    openSelection();
    return;
  }

  if (isFileListSearchKey(event)) {
    event.preventDefault();
    selectSearchMatch(event.key);
    return;
  }

  if (!["ArrowDown", "ArrowUp", "End", "Home"].includes(event.key)) {
    return;
  }

  resetFileListSearch();
  event.preventDefault();
  const selectedPaths = [...state.selectedPaths];
  const selectedPath = selectedPaths.at(-1);
  const selectedIndex = state.filteredEntries.findIndex(
    (entry) => entry.path === selectedPath,
  );
  let nextIndex: number;

  switch (event.key) {
    case "ArrowDown": {
      nextIndex = Math.min(state.filteredEntries.length - 1, selectedIndex + 1);
      break;
    }

    case "ArrowUp": {
      nextIndex = Math.max(0, selectedIndex - 1);
      break;
    }

    case "End": {
      nextIndex = state.filteredEntries.length - 1;
      break;
    }

    case "Home": {
      nextIndex = 0;
      break;
    }

    default: {
      return;
    }
  }

  if (nextIndex < 0) {
    nextIndex = 0;
  }

  const nextEntry = state.filteredEntries[nextIndex];
  if (nextEntry === undefined) {
    return;
  }

  selectAndFocusEntry(
    nextEntry,
    event.ctrlKey || event.metaKey,
    event.shiftKey,
  );
}

function isFileListSearchKey(event: KeyboardEvent): boolean {
  return (
    event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey
  );
}

function isPlainAltKeyEvent(event: KeyboardEvent): boolean {
  return (
    event.key === "Alt" && !event.ctrlKey && !event.metaKey && !event.shiftKey
  );
}

function selectSearchMatch(key: string) {
  const now = Date.now();
  if (now - fileListSearchUpdatedAt > fileListSearchResetMs) {
    fileListSearchPrefix = "";
  }

  fileListSearchUpdatedAt = now;
  const normalizedKey = key.toLowerCase();
  if (
    fileListSearchPrefix !== ""
    && fileListSearchPrefix
      === normalizedKey.repeat(fileListSearchPrefix.length)
  ) {
    fileListSearchPrefix = `${fileListSearchPrefix}${normalizedKey}`;
    selectNextEntryStartingWith(normalizedKey);
    return;
  }

  const nextPrefix = `${fileListSearchPrefix}${key}`.toLowerCase();
  const nextMatch = findFirstEntryStartingWith(nextPrefix);
  const searchPrefix = nextMatch === undefined ? normalizedKey : nextPrefix;
  const matchingEntry = nextMatch ?? findFirstEntryStartingWith(searchPrefix);

  fileListSearchPrefix = searchPrefix;
  if (matchingEntry !== undefined) {
    selectAndFocusEntry(matchingEntry, false, false);
  }
}

function selectNextEntryStartingWith(prefix: string) {
  const selectedPath = [...state.selectedPaths].at(-1);
  const selectedIndex = state.filteredEntries.findIndex(
    (entry) => entry.path === selectedPath,
  );
  const nextMatch =
    findNextEntryStartingWith(prefix, selectedIndex + 1)
    ?? findNextEntryStartingWith(prefix, 0);

  if (nextMatch !== undefined) {
    selectAndFocusEntry(nextMatch, false, false);
  }
}

function findNextEntryStartingWith(
  prefix: string,
  startIndex: number,
): FileEntry | undefined {
  return state.filteredEntries
    .slice(startIndex)
    .find((entry) => entry.name.toLowerCase().startsWith(prefix));
}

function findFirstEntryStartingWith(prefix: string): FileEntry | undefined {
  return state.filteredEntries.find((entry) =>
    entry.name.toLowerCase().startsWith(prefix),
  );
}

function selectAndFocusEntry(
  entry: FileEntry,
  toggleSelection: boolean,
  rangeSelection: boolean,
) {
  selectEntry(entry, toggleSelection, rangeSelection);
  focusEntry(entry.path);
  elements.fileList
    .querySelector(getEntrySelector(entry.path))
    ?.scrollIntoView({
      block: "nearest",
    });
}

function resetFileListSearch() {
  fileListSearchPrefix = "";
  fileListSearchUpdatedAt = 0;
}

function updateNavigationButtons() {
  elements.backButton.disabled = state.historyStack.length === 0;
  elements.forwardButton.disabled = state.forwardStack.length === 0;
  elements.upButton.disabled = state.parentPath === undefined;
}

function setItemCount(count: number) {
  elements.itemCount.textContent = `${count} ${count === 1 ? "item" : "items"}`;
}

function showError(message: string) {
  elements.errorStatus.textContent = message;
  elements.errorStatus.hidden = false;
}

function hideError() {
  elements.errorStatus.textContent = "";
  elements.errorStatus.hidden = true;
}

function formatSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function cssEscape(value: string): string {
  return globalThis.CSS.escape(value);
}

function getEntrySelector(entryPath: string): string {
  return `[data-path="${cssEscape(entryPath)}"]`;
}

function getElement<ElementType extends HTMLElement>(
  id: string,
  expectedType: new () => ElementType,
): ElementType {
  const element = document.querySelector(`#${id}`);
  if (!(element instanceof expectedType)) {
    throw new TypeError(`Missing element: ${id}`);
  }

  return element;
}
