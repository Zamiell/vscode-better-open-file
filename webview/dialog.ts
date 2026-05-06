declare function acquireVsCodeApi(): {
  readonly postMessage: (message: WebviewToHostMessage) => void;
};

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
      readonly type: "init";
    }
  | {
      readonly listing: DirectoryListing;
      readonly renamePath?: string;
      readonly selectedPath?: string;
      readonly type: "directoryListing";
    }
  | {
      readonly message: string;
      readonly type: "error";
    };

type WebviewToHostMessage =
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
      readonly type: "cancel" | "ready";
    };

interface DialogState {
  currentPath: string;
  entries: readonly FileEntry[];
  filteredEntries: readonly FileEntry[];
  forwardStack: string[];
  historyStack: string[];
  parentPath: string | undefined;
  copiedPaths: readonly string[];
  pendingSelectedPath:
    | {
        readonly directoryPath: string;
        readonly entryPath: string;
      }
    | undefined;
  renamingPath: string | undefined;
  selectedPaths: Set<string>;
}

const vscode = acquireVsCodeApi();

const state: DialogState = {
  currentPath: "",
  entries: [],
  filteredEntries: [],
  forwardStack: [],
  historyStack: [],
  parentPath: undefined,
  copiedPaths: [],
  pendingSelectedPath: undefined,
  renamingPath: undefined,
  selectedPaths: new Set<string>(),
};

const elements = {
  addressInput: getElement("addressInput", HTMLInputElement),
  backButton: getElement("backButton", HTMLButtonElement),
  cancelButton: getElement("cancelButton", HTMLButtonElement),
  contextCopyButton: getElement("contextCopyButton", HTMLButtonElement),
  contextMenu: getElement("contextMenu", HTMLDivElement),
  contextNewDirectoryButton: getElement(
    "contextNewDirectoryButton",
    HTMLButtonElement,
  ),
  contextNewFileButton: getElement("contextNewFileButton", HTMLButtonElement),
  contextPasteButton: getElement("contextPasteButton", HTMLButtonElement),
  contextRenameButton: getElement("contextRenameButton", HTMLButtonElement),
  clearFilterButton: getElement("clearFilterButton", HTMLButtonElement),
  errorStatus: getElement("errorStatus", HTMLDivElement),
  fileList: getElement("fileList", HTMLDivElement),
  fileNameInput: getElement("fileNameInput", HTMLInputElement),
  forwardButton: getElement("forwardButton", HTMLButtonElement),
  itemCount: getElement("itemCount", HTMLDivElement),
  newFileButton: getElement("newFileButton", HTMLButtonElement),
  newDirectoryButton: getElement("newDirectoryButton", HTMLButtonElement),
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
      elements.addressInput.value = message.directory;
      return;
    }

    if (message.type === "directoryListing") {
      setDirectoryListing(
        message.listing,
        message.selectedPath,
        message.renamePath,
      );
      return;
    }

    state.pendingSelectedPath = undefined;
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
    applyFileNameFilter(false);
  });

  elements.fileNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      openSelection();
    }
  });

  elements.clearFilterButton.addEventListener("click", () => {
    clearFileNameFilter(true);
  });

  elements.openButton.addEventListener("click", openSelection);
  elements.cancelButton.addEventListener("click", () => {
    vscode.postMessage({ type: "cancel" });
  });

  elements.refreshButton.addEventListener("click", refreshDirectory);

  elements.newFileButton.addEventListener("click", createFile);
  elements.newDirectoryButton.addEventListener("click", createDirectory);
  registerContextMenuItem(elements.contextCopyButton, copySelection);
  registerContextMenuItem(elements.contextNewDirectoryButton, createDirectory);
  registerContextMenuItem(elements.contextNewFileButton, createFile);
  registerContextMenuItem(elements.contextPasteButton, pasteSelection);
  registerContextMenuItem(elements.contextRenameButton, beginRenameSelection);

  elements.upButton.addEventListener("click", navigateUp);

  elements.backButton.addEventListener("click", navigateBack);

  elements.forwardButton.addEventListener("click", navigateForward);

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
  elements.fileList.addEventListener("scroll", hideContextMenu);

  document.addEventListener(
    "contextmenu",
    (event) => {
      if (isNativeContextMenuTarget(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      showContextMenu(event.clientX, event.clientY, event.target);
    },
    { capture: true },
  );

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!isContextMenuTarget(event.target)) {
        hideContextMenu();
      }
    },
    { capture: true },
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (isRenameInputTarget(event.target)) {
        return;
      }

      if (event.ctrlKey && !event.altKey && !event.shiftKey) {
        const key = event.key.toLowerCase();
        if (key === "c" && !isNativeContextMenuTarget(event.target)) {
          event.preventDefault();
          event.stopPropagation();
          copySelection();
          return;
        }

        if (key === "v" && !isNativeContextMenuTarget(event.target)) {
          event.preventDefault();
          event.stopPropagation();
          pasteSelection();
          return;
        }
      }

      if (event.key === "Escape" && elements.contextMenu.hidden === false) {
        event.preventDefault();
        event.stopPropagation();
        hideContextMenu();
        return;
      }

      if (event.altKey && event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        navigateUp();
        return;
      }

      if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        navigateBack();
        return;
      }

      if (event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        event.stopPropagation();
        navigateForward();
        return;
      }

      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        event.stopPropagation();
        createDirectory();
        return;
      }

      if (event.key === "F5") {
        event.preventDefault();
        event.stopPropagation();
        refreshDirectory();
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
  globalThis.addEventListener("resize", hideContextMenu);
}

function registerContextMenuItem(
  menuItem: HTMLButtonElement,
  action: () => void,
) {
  menuItem.addEventListener("click", () => {
    hideContextMenu();
    action();
  });
  menuItem.addEventListener("pointerenter", () => {
    menuItem.focus();
  });
}

function setDirectoryListing(
  listing: DirectoryListing,
  selectedPath?: string,
  renamePath?: string,
) {
  const pendingSelectedPath =
    selectedPath ?? getPendingSelectedPath(listing.path);
  state.currentPath = listing.path;
  state.entries = listing.entries;
  state.parentPath = listing.parentPath;
  state.renamingPath = renamePath;
  state.selectedPaths.clear();
  elements.addressInput.value = listing.path;
  elements.fileNameInput.value = "";

  renderFileList();
  if (
    pendingSelectedPath === undefined
    || !selectEntryByPath(pendingSelectedPath, true)
  ) {
    selectFirstEntry(true);
  }
  updateNavigationButtons();
  hideError();
  focusRenameInput(renamePath);
}

function navigateTo(directoryPath: string) {
  if (directoryPath === "" || directoryPath === state.currentPath) {
    return;
  }

  if (state.currentPath !== "") {
    state.historyStack.push(state.currentPath);
  }

  state.forwardStack = [];
  requestDirectory(directoryPath, state.currentPath);
}

function navigateUp() {
  if (state.parentPath !== undefined) {
    navigateTo(state.parentPath);
  }
}

function navigateBack() {
  const previousPath = state.historyStack.pop();
  if (previousPath !== undefined) {
    state.forwardStack.push(state.currentPath);
    requestDirectory(previousPath, state.currentPath);
  }
}

function navigateForward() {
  const nextPath = state.forwardStack.pop();
  if (nextPath !== undefined) {
    state.historyStack.push(state.currentPath);
    requestDirectory(nextPath, state.currentPath);
  }
}

function requestDirectory(directoryPath: string, selectedPath?: string) {
  setPendingSelectedPath(directoryPath, selectedPath);
  vscode.postMessage({ path: directoryPath, type: "navigate" });
}

function refreshDirectory() {
  state.pendingSelectedPath = undefined;
  vscode.postMessage({ path: state.currentPath, type: "listDirectory" });
}

function createDirectory() {
  hideContextMenu();

  if (state.currentPath === "") {
    showError(
      "You must be in a valid directory before creating a new directory.",
    );
    return;
  }

  vscode.postMessage({
    currentDirectory: state.currentPath,
    type: "createDirectory",
  });
}

function createFile() {
  hideContextMenu();

  if (state.currentPath === "") {
    showError("You must be in a valid directory before creating a new file.");
    return;
  }

  vscode.postMessage({
    currentDirectory: state.currentPath,
    type: "createFile",
  });
}

function showContextMenu(
  clientX: number,
  clientY: number,
  target: EventTarget | null,
) {
  const contextEntry = getContextMenuEntry(target);
  elements.contextCopyButton.hidden = contextEntry === undefined;
  elements.contextPasteButton.hidden = false;
  elements.contextPasteButton.disabled = state.copiedPaths.length === 0;
  elements.contextRenameButton.hidden = contextEntry === undefined;
  if (contextEntry !== undefined) {
    selectEntry(contextEntry, false, false);
    focusEntry(contextEntry.path);
  }

  elements.contextMenu.hidden = false;
  elements.contextMenu.style.left = "0";
  elements.contextMenu.style.top = "0";

  const menuRect = elements.contextMenu.getBoundingClientRect();
  const maxLeft = Math.max(0, globalThis.innerWidth - menuRect.width - 4);
  const maxTop = Math.max(0, globalThis.innerHeight - menuRect.height - 4);
  const left = Math.min(clientX, maxLeft);
  const top = Math.min(clientY, maxTop);

  elements.contextMenu.style.left = `${left}px`;
  elements.contextMenu.style.top = `${top}px`;
  getFirstVisibleContextMenuItem().focus();
}

function hideContextMenu() {
  elements.contextMenu.hidden = true;
}

function getFirstVisibleContextMenuItem(): HTMLButtonElement {
  return (
    [
      ...elements.contextMenu.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.hidden === false) ?? elements.contextNewFileButton
  );
}

function renderFileList() {
  state.filteredEntries = getFilteredEntries();
  elements.fileList.textContent = "";
  updateFilterControls();

  if (state.entries.length === 0) {
    elements.fileList.append(createFileListMessage("[directory is empty]"));
    return;
  }

  if (state.filteredEntries.length === 0) {
    elements.fileList.append(createFileListMessage("[no files match]"));
    return;
  }

  for (const entry of state.filteredEntries) {
    elements.fileList.append(createFileRow(entry));
  }
}

function createFileListMessage(messageText: string) {
  const message = document.createElement("div");
  message.className = "file-list-message";
  message.textContent = messageText;

  return message;
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
  if (state.renamingPath === entry.path) {
    name.append(createRenameInput(entry));
  } else {
    name.append(nameText);
  }

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
  const fileNameNeedle = getFileNameFilter().toLowerCase();

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
  if (!toggleSelection && !rangeSelection) {
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
    if (focusSelectedEntry) {
      elements.fileList.focus();
    }
    return;
  }

  state.selectedPaths = new Set([firstEntry.path]);
  updateRenderedSelection();
  updateOpenButton();
  if (focusSelectedEntry) {
    focusEntry(firstEntry.path);
  }
}

function selectEntryByPath(entryPath: string, focusSelectedEntry: boolean) {
  const entry = state.filteredEntries.find(
    (filteredEntry) => filteredEntry.path === entryPath,
  );
  if (entry === undefined) {
    return false;
  }

  selectEntry(entry, false, false);
  if (focusSelectedEntry) {
    focusEntry(entry.path);
  }

  return true;
}

function getSelectedEntry(): FileEntry | undefined {
  const selectedPath = [...state.selectedPaths].at(-1);
  return state.entries.find((entry) => entry.path === selectedPath);
}

function getPendingSelectedPath(directoryPath: string): string | undefined {
  const { pendingSelectedPath } = state;
  state.pendingSelectedPath = undefined;

  if (pendingSelectedPath?.directoryPath !== directoryPath) {
    return undefined;
  }

  return pendingSelectedPath.entryPath;
}

function setPendingSelectedPath(directoryPath: string, entryPath?: string) {
  state.pendingSelectedPath =
    entryPath === undefined || entryPath === ""
      ? undefined
      : { directoryPath, entryPath };
}

function isFileRowClick(target: EventTarget | null): boolean {
  return (
    target instanceof Element
    && target.closest(".file-row") !== null
    && elements.fileList.contains(target)
  );
}

function getContextMenuEntry(
  target: EventTarget | null,
): FileEntry | undefined {
  if (!(target instanceof Element)) {
    return undefined;
  }

  const row = target.closest<HTMLElement>(".file-row");
  const rowPath = row?.dataset["path"];
  if (
    row === null
    || rowPath === undefined
    || !elements.fileList.contains(row)
  ) {
    return undefined;
  }

  return state.entries.find((entry) => entry.path === rowPath);
}

function isContextMenuTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element
    && target.closest(".context-menu") === elements.contextMenu
  );
}

function isNativeContextMenuTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element
    && target.closest("input, textarea, select") !== null
  );
}

function focusEntry(entryPath: string) {
  elements.fileList
    .querySelector<HTMLElement>(getEntrySelector(entryPath))
    ?.focus();
}

function getEntryElement(entryPath: string): HTMLElement | null {
  return elements.fileList.querySelector<HTMLElement>(
    getEntrySelector(entryPath),
  );
}

function scrollEntryIntoView(entryElement: HTMLElement) {
  const listRect = elements.fileList.getBoundingClientRect();
  const entryRect = entryElement.getBoundingClientRect();

  if (entryRect.top < listRect.top) {
    elements.fileList.scrollTop -= listRect.top - entryRect.top;
    return;
  }

  if (entryRect.bottom > listRect.bottom) {
    elements.fileList.scrollTop += entryRect.bottom - listRect.bottom;
  }
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

function beginRenameSelection() {
  if (state.selectedPaths.size !== 1) {
    showError("Select one item to rename.");
    return;
  }

  const selectedEntry = getSelectedEntry();
  if (selectedEntry === undefined) {
    showError("Select one item to rename.");
    return;
  }

  state.renamingPath = selectedEntry.path;
  renderFileList();
  updateRenderedSelection();

  focusRenameInput(selectedEntry.path);
}

function createRenameInput(entry: FileEntry): HTMLInputElement {
  const renameInput = document.createElement("input");
  renameInput.className = "rename-input";
  renameInput.value = entry.name;
  renameInput.ariaLabel = `Rename ${entry.name}`;

  renameInput.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  renameInput.addEventListener("dblclick", (event) => {
    event.stopPropagation();
  });
  renameInput.addEventListener("keydown", (event) => {
    event.stopPropagation();

    if (event.key === "Enter") {
      event.preventDefault();
      commitRename(entry, renameInput.value);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelRename(entry.path);
    }
  });
  renameInput.addEventListener("blur", () => {
    commitRename(entry, renameInput.value);
  });

  return renameInput;
}

function commitRename(entry: FileEntry, newName: string) {
  if (state.renamingPath !== entry.path) {
    return;
  }

  if (newName === entry.name) {
    cancelRename(entry.path);
    return;
  }

  if (!isValidRenameName(newName)) {
    showError("Enter a valid name without path separators.");
    return;
  }

  state.renamingPath = undefined;
  renderFileList();
  selectEntryByPath(entry.path, true);

  vscode.postMessage({
    currentDirectory: state.currentPath,
    newName,
    path: entry.path,
    type: "renameSelection",
  });
}

function cancelRename(entryPath: string) {
  if (state.renamingPath !== entryPath) {
    return;
  }

  state.renamingPath = undefined;
  renderFileList();
  selectEntryByPath(entryPath, true);
}

function isValidRenameName(name: string): boolean {
  return (
    name.trim() !== ""
    && name !== "."
    && name !== ".."
    && !name.includes("/")
    && !name.includes("\\")
  );
}

function getRenameSelectionEnd(entry: FileEntry): number {
  if (entry.isDirectory) {
    return entry.name.length;
  }

  const extensionIndex = entry.name.lastIndexOf(".");
  return extensionIndex > 0 ? extensionIndex : entry.name.length;
}

function getRenameInput(entryPath: string): HTMLInputElement | undefined {
  return (
    getEntryElement(entryPath)?.querySelector<HTMLInputElement>(".rename-input")
    ?? undefined
  );
}

function focusRenameInput(entryPath: string | undefined) {
  if (entryPath === undefined) {
    return;
  }

  const renameInput = getRenameInput(entryPath);
  const renamingEntry = state.entries.find((entry) => entry.path === entryPath);
  if (renameInput === undefined || renamingEntry === undefined) {
    return;
  }

  renameInput.focus();
  renameInput.setSelectionRange(0, getRenameSelectionEnd(renamingEntry));
}

function isRenameInputTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(".rename-input") !== null;
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

function deleteSelection() {
  const selectedPaths = [...state.selectedPaths];
  if (selectedPaths.length === 0) {
    showError("Select a file to delete.");
    return;
  }

  setPendingSelectedPath(
    state.currentPath,
    getPathToSelectAfterDelete(selectedPaths),
  );

  vscode.postMessage({
    currentDirectory: state.currentPath,
    paths: selectedPaths,
    type: "deleteSelection",
  });
}

function copySelection() {
  const selectedPaths = [...state.selectedPaths];
  if (selectedPaths.length === 0) {
    showError("Select a file to copy.");
    return;
  }

  state.copiedPaths = selectedPaths;
  hideError();
}

function pasteSelection() {
  if (state.copiedPaths.length === 0) {
    showError("Copy a file before pasting.");
    return;
  }

  if (state.currentPath === "") {
    showError("You must be in a valid directory before pasting.");
    return;
  }

  vscode.postMessage({
    currentDirectory: state.currentPath,
    paths: state.copiedPaths,
    type: "pasteSelection",
  });
}

function getPathToSelectAfterDelete(
  selectedPaths: readonly string[],
): string | undefined {
  const selectedPathSet = new Set(selectedPaths);
  const selectedIndexes = state.filteredEntries.flatMap((entry, index) =>
    selectedPathSet.has(entry.path) ? [index] : [],
  );
  const firstSelectedIndex = selectedIndexes[0];
  const lastSelectedIndex = selectedIndexes.at(-1);

  if (firstSelectedIndex === undefined || lastSelectedIndex === undefined) {
    return undefined;
  }

  const nextEntry = state.filteredEntries
    .slice(lastSelectedIndex + 1)
    .find((entry) => !selectedPathSet.has(entry.path));
  if (nextEntry !== undefined) {
    return nextEntry.path;
  }

  return state.filteredEntries
    .slice(0, firstSelectedIndex)
    .findLast((entry) => !selectedPathSet.has(entry.path))?.path;
}

function handleFileListKeydown(event: KeyboardEvent) {
  if (handleFileListFilterKeydown(event)) {
    return;
  }

  if (event.key === "F2") {
    event.preventDefault();
    beginRenameSelection();
    return;
  }

  if (event.key === "Delete") {
    event.preventDefault();
    deleteSelection();
    return;
  }

  if (state.filteredEntries.length === 0) {
    return;
  }

  if (event.key === "Enter") {
    openSelection();
    return;
  }

  if (!["ArrowDown", "ArrowUp", "End", "Home"].includes(event.key)) {
    return;
  }

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

function isPlainAltKeyEvent(event: KeyboardEvent): boolean {
  return (
    event.key === "Alt" && !event.ctrlKey && !event.metaKey && !event.shiftKey
  );
}

function handleFileListFilterKeydown(event: KeyboardEvent): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) {
    return false;
  }

  if (event.key.length === 1) {
    event.preventDefault();
    elements.fileNameInput.value = `${elements.fileNameInput.value}${event.key}`;
    applyFileNameFilter(true);
    return true;
  }

  if (event.key === "Backspace" && elements.fileNameInput.value !== "") {
    event.preventDefault();
    elements.fileNameInput.value = elements.fileNameInput.value.slice(0, -1);
    applyFileNameFilter(true);
    return true;
  }

  return false;
}

function clearFileNameFilter(focusSelectedEntry: boolean) {
  if (elements.fileNameInput.value === "") {
    return;
  }

  elements.fileNameInput.value = "";
  applyFileNameFilter(focusSelectedEntry);
}

function applyFileNameFilter(focusSelectedEntry: boolean) {
  renderFileList();
  selectFirstEntry(focusSelectedEntry);
}

function selectAndFocusEntry(
  entry: FileEntry,
  toggleSelection: boolean,
  rangeSelection: boolean,
) {
  selectEntry(entry, toggleSelection, rangeSelection);
  const entryElement = getEntryElement(entry.path);
  if (entryElement === null) {
    return;
  }

  entryElement.focus({ preventScroll: true });
  scrollEntryIntoView(entryElement);
}

function updateNavigationButtons() {
  elements.backButton.disabled = state.historyStack.length === 0;
  elements.forwardButton.disabled = state.forwardStack.length === 0;
  elements.upButton.disabled = state.parentPath === undefined;
}

function updateFilterControls() {
  const filterIsActive = getFileNameFilter() !== "";
  elements.clearFilterButton.hidden = elements.fileNameInput.value === "";
  elements.itemCount.textContent = filterIsActive
    ? `${state.filteredEntries.length} of ${formatItemCount(state.entries.length)}`
    : formatItemCount(state.entries.length);
}

function formatItemCount(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

function getFileNameFilter(): string {
  return elements.fileNameInput.value.trim();
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
