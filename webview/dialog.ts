declare function acquireVsCodeApi(): {
  readonly postMessage: (message: WebviewToHostMessage) => void;
};

interface DialogOptions {
  readonly allowMultipleSelection: boolean;
  readonly foldersFirst: boolean;
}

interface FileEntry {
  readonly extension: string;
  readonly isDirectory: boolean;
  readonly modified: number;
  readonly name: string;
  readonly path: string;
  readonly size: number;
}

interface FileFilter {
  readonly label: string;
  readonly patterns: readonly string[];
}

interface LocationEntry {
  readonly label: string;
  readonly path: string;
}

interface DirectoryListing {
  readonly entries: readonly FileEntry[];
  readonly parentPath: string | undefined;
  readonly path: string;
}

type SortBy = "extension" | "modified" | "name" | "size";
type SortDirection = "asc" | "desc";

type HostToWebviewMessage =
  | {
      readonly directory: string;
      readonly filters: readonly FileFilter[];
      readonly locations: readonly LocationEntry[];
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
  filters: readonly FileFilter[];
  foldersFirst: boolean;
  forwardStack: string[];
  historyStack: string[];
  parentPath: string | undefined;
  selectedPaths: Set<string>;
  sortBy: SortBy;
  sortDirection: SortDirection;
}

const vscode = acquireVsCodeApi();

const state: DialogState = {
  allowMultipleSelection: false,
  currentPath: "",
  entries: [],
  filteredEntries: [],
  filters: [],
  foldersFirst: true,
  forwardStack: [],
  historyStack: [],
  parentPath: undefined,
  selectedPaths: new Set<string>(),
  sortBy: "name",
  sortDirection: "asc",
};

const elements = {
  addressInput: getElement("addressInput", HTMLInputElement),
  backButton: getElement("backButton", HTMLButtonElement),
  cancelButton: getElement("cancelButton", HTMLButtonElement),
  errorStatus: getElement("errorStatus", HTMLDivElement),
  fileList: getElement("fileList", HTMLDivElement),
  fileNameInput: getElement("fileNameInput", HTMLInputElement),
  filterSelect: getElement("filterSelect", HTMLSelectElement),
  forwardButton: getElement("forwardButton", HTMLButtonElement),
  itemCount: getElement("itemCount", HTMLDivElement),
  openButton: getElement("openButton", HTMLButtonElement),
  placesList: getElement("placesList", HTMLDivElement),
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
      state.filters = message.filters;
      renderFilters();
      renderLocations(message.locations);
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
  });

  elements.fileNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      openSelection();
    }
  });

  elements.filterSelect.addEventListener("change", () => {
    renderFileList();
  });

  elements.openButton.addEventListener("click", openSelection);
  elements.cancelButton.addEventListener("click", () => {
    vscode.postMessage({ type: "cancel" });
  });

  elements.refreshButton.addEventListener("click", () => {
    vscode.postMessage({ path: state.currentPath, type: "listDirectory" });
  });

  elements.upButton.addEventListener("click", () => {
    if (state.parentPath !== undefined) {
      navigateTo(state.parentPath);
    }
  });

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

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      vscode.postMessage({ type: "cancel" });
    }
  });

  for (const sortButton of document.querySelectorAll<HTMLButtonElement>(
    "[data-sort]",
  )) {
    sortButton.addEventListener("click", () => {
      const nextSortBy = parseSortBy(sortButton.dataset["sort"]);
      if (nextSortBy === undefined) {
        return;
      }

      state.sortDirection =
        state.sortBy === nextSortBy && state.sortDirection === "asc"
          ? "desc"
          : "asc";
      state.sortBy = nextSortBy;
      renderFileList();
    });
  }
}

function renderFilters() {
  elements.filterSelect.textContent = "";

  for (const filter of state.filters) {
    const option = document.createElement("option");
    option.textContent = filter.label;
    option.value = filter.patterns.join(";");
    elements.filterSelect.append(option);
  }
}

function renderLocations(locations: readonly LocationEntry[]) {
  elements.placesList.textContent = "";

  for (const location of locations) {
    const button = document.createElement("button");
    button.className = "place-button";
    button.title = location.path;
    button.textContent = location.label;
    button.type = "button";
    button.addEventListener("click", () => {
      navigateTo(location.path);
    });
    elements.placesList.append(button);
  }
}

function setDirectoryListing(listing: DirectoryListing) {
  state.currentPath = listing.path;
  state.entries = listing.entries;
  state.parentPath = listing.parentPath;
  state.selectedPaths.clear();
  elements.addressInput.value = listing.path;
  elements.fileNameInput.value = "";

  renderFileList();
  updateNavigationButtons();
  hideError();
  setItemCount(listing.entries.length);
  updateOpenButton();
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

function requestDirectory(directoryPath: string) {
  vscode.postMessage({ path: directoryPath, type: "navigate" });
}

function renderFileList() {
  state.filteredEntries = getFilteredEntries();
  elements.fileList.textContent = "";

  for (const entry of state.filteredEntries) {
    elements.fileList.append(createFileRow(entry));
  }

  updateSelectedFileName();
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

  const type = document.createElement("div");
  type.className = "file-meta";
  type.textContent = getEntryTypeLabel(entry);
  row.append(type);

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
  const filterPatterns = elements.filterSelect.value.split(";").filter(Boolean);
  const fileNameNeedle = elements.fileNameInput.value.trim().toLowerCase();

  return [...state.entries]
    .filter((entry) => {
      if (
        fileNameNeedle !== ""
        && !entry.name.toLowerCase().includes(fileNameNeedle)
      ) {
        return false;
      }

      if (entry.isDirectory || filterPatterns.includes("*")) {
        return true;
      }

      return filterPatterns.some((pattern) =>
        matchesPattern(entry.name, pattern),
      );
    })
    .toSorted(compareEntries);
}

function compareEntries(first: FileEntry, second: FileEntry) {
  if (state.foldersFirst && first.isDirectory !== second.isDirectory) {
    return first.isDirectory ? -1 : 1;
  }

  const result =
    state.sortBy === "modified" || state.sortBy === "size"
      ? first[state.sortBy] - second[state.sortBy]
      : first[state.sortBy].localeCompare(second[state.sortBy], undefined, {
          numeric: true,
          sensitivity: "base",
        });

  return state.sortDirection === "asc" ? result : -result;
}

function matchesPattern(fileName: string, pattern: string) {
  if (!pattern.startsWith("*.")) {
    return pattern === "*" || fileName === pattern;
  }

  return fileName.toLowerCase().endsWith(pattern.slice(1).toLowerCase());
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
  updateSelectedFileName();
  updateOpenButton();
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

function updateSelectedFileName() {
  const selectedEntries = state.filteredEntries.filter((entry) =>
    state.selectedPaths.has(entry.path),
  );
  if (selectedEntries.length > 0) {
    elements.fileNameInput.value = selectedEntries
      .map((entry) => entry.name)
      .join("; ");
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

  selectEntry(nextEntry, event.ctrlKey || event.metaKey, event.shiftKey);
  focusEntry(nextEntry.path);
  elements.fileList
    .querySelector(getEntrySelector(nextEntry.path))
    ?.scrollIntoView({
      block: "nearest",
    });
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

function getEntryTypeLabel(entry: FileEntry): string {
  if (entry.isDirectory) {
    return "Folder";
  }

  return entry.extension === "" ? "File" : entry.extension;
}

function parseSortBy(value: string | undefined): SortBy | undefined {
  if (
    value === "extension"
    || value === "modified"
    || value === "name"
    || value === "size"
  ) {
    return value;
  }

  return undefined;
}
