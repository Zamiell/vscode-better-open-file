"use strict";
const vscode = acquireVsCodeApi();
const state = {
    allowMultipleSelection: false,
    currentPath: "",
    entries: [],
    filteredEntries: [],
    filters: [],
    foldersFirst: true,
    forwardStack: [],
    historyStack: [],
    parentPath: undefined,
    selectedPaths: new Set(),
    sortBy: "name",
    sortDirection: "asc",
};
const elements = {
    addressInput: getElement("addressInput"),
    backButton: getElement("backButton"),
    cancelButton: getElement("cancelButton"),
    fileList: getElement("fileList"),
    fileNameInput: getElement("fileNameInput"),
    filterSelect: getElement("filterSelect"),
    forwardButton: getElement("forwardButton"),
    openButton: getElement("openButton"),
    placesList: getElement("placesList"),
    refreshButton: getElement("refreshButton"),
    status: getElement("status"),
    upButton: getElement("upButton"),
};
window.addEventListener("DOMContentLoaded", () => {
    registerEventHandlers();
    vscode.postMessage({ type: "ready" });
});
window.addEventListener("message", (event) => {
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
    setStatus(message.message, true);
});
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
    for (const sortButton of document.querySelectorAll("[data-sort]")) {
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
    elements.filterSelect.replaceChildren();
    for (const filter of state.filters) {
        const option = document.createElement("option");
        option.textContent = filter.label;
        option.value = filter.patterns.join(";");
        elements.filterSelect.append(option);
    }
}
function renderLocations(locations) {
    elements.placesList.replaceChildren();
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
function setDirectoryListing(listing) {
    state.currentPath = listing.path;
    state.entries = listing.entries;
    state.parentPath = listing.parentPath;
    state.selectedPaths.clear();
    elements.addressInput.value = listing.path;
    elements.fileNameInput.value = "";
    renderFileList();
    updateNavigationButtons();
    setStatus(`${listing.entries.length} items`);
}
function navigateTo(directoryPath) {
    if (directoryPath === "" || directoryPath === state.currentPath) {
        return;
    }
    if (state.currentPath !== "") {
        state.historyStack.push(state.currentPath);
    }
    state.forwardStack = [];
    requestDirectory(directoryPath);
}
function requestDirectory(directoryPath) {
    vscode.postMessage({ path: directoryPath, type: "navigate" });
}
function renderFileList() {
    state.filteredEntries = getFilteredEntries();
    elements.fileList.replaceChildren();
    for (const entry of state.filteredEntries) {
        elements.fileList.append(createFileRow(entry));
    }
    updateSelectedFileName();
}
function createFileRow(entry) {
    const row = document.createElement("div");
    row.className = "file-row";
    row.dataset["path"] = entry.path;
    row.role = "option";
    row.tabIndex = -1;
    const name = document.createElement("div");
    name.className = "file-name";
    const icon = document.createElement("span");
    icon.ariaHidden = "true";
    icon.className = `file-icon ${entry.isDirectory ? "folder-icon" : "document-icon"}`;
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
    type.textContent = entry.isDirectory ? "Folder" : entry.extension || "File";
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
function getFilteredEntries() {
    const filterPatterns = elements.filterSelect.value.split(";").filter(Boolean);
    const fileNameNeedle = elements.fileNameInput.value.trim().toLowerCase();
    return [...state.entries]
        .filter((entry) => {
        if (fileNameNeedle !== ""
            && !entry.name.toLowerCase().includes(fileNameNeedle)) {
            return false;
        }
        if (entry.isDirectory || filterPatterns.includes("*")) {
            return true;
        }
        return filterPatterns.some((pattern) => matchesPattern(entry.name, pattern));
    })
        .sort(compareEntries);
}
function compareEntries(first, second) {
    if (state.foldersFirst && first.isDirectory !== second.isDirectory) {
        return first.isDirectory ? -1 : 1;
    }
    let result = 0;
    if (state.sortBy === "modified" || state.sortBy === "size") {
        result = first[state.sortBy] - second[state.sortBy];
    }
    else {
        result = String(first[state.sortBy]).localeCompare(String(second[state.sortBy]), undefined, {
            numeric: true,
            sensitivity: "base",
        });
    }
    return state.sortDirection === "asc" ? result : -result;
}
function matchesPattern(fileName, pattern) {
    if (!pattern.startsWith("*.")) {
        return pattern === "*" || fileName === pattern;
    }
    return fileName.toLowerCase().endsWith(pattern.slice(1).toLowerCase());
}
function selectEntry(entry, toggleSelection, rangeSelection) {
    if (!state.allowMultipleSelection || (!toggleSelection && !rangeSelection)) {
        state.selectedPaths = new Set([entry.path]);
    }
    else if (toggleSelection && state.selectedPaths.has(entry.path)) {
        state.selectedPaths.delete(entry.path);
    }
    else {
        state.selectedPaths.add(entry.path);
    }
    updateRenderedSelection();
    updateSelectedFileName();
}
function focusEntry(entryPath) {
    elements.fileList
        .querySelector(getEntrySelector(entryPath))
        ?.focus();
}
function updateRenderedSelection() {
    for (const row of elements.fileList.querySelectorAll(".file-row")) {
        const rowPath = row.dataset["path"];
        const isSelected = rowPath !== undefined && state.selectedPaths.has(rowPath);
        row.classList.toggle("selected", isSelected);
        row.ariaSelected = String(isSelected);
    }
}
function updateSelectedFileName() {
    const selectedEntries = state.filteredEntries.filter((entry) => state.selectedPaths.has(entry.path));
    if (selectedEntries.length > 0) {
        elements.fileNameInput.value = selectedEntries
            .map((entry) => entry.name)
            .join("; ");
    }
}
function openSelection() {
    const selectedPaths = [...state.selectedPaths];
    if (selectedPaths.length > 0) {
        vscode.postMessage({ paths: selectedPaths, type: "openSelection" });
        return;
    }
    const typedName = elements.fileNameInput.value.trim();
    if (typedName === "") {
        setStatus("Select a file to open.", true);
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
function handleFileListKeydown(event) {
    if (state.filteredEntries.length === 0) {
        return;
    }
    if (event.key === "Enter") {
        openSelection();
        return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        return;
    }
    event.preventDefault();
    const selectedPaths = [...state.selectedPaths];
    const selectedPath = selectedPaths[selectedPaths.length - 1];
    const selectedIndex = state.filteredEntries.findIndex((entry) => entry.path === selectedPath);
    let nextIndex = selectedIndex;
    if (event.key === "ArrowDown") {
        nextIndex = Math.min(state.filteredEntries.length - 1, selectedIndex + 1);
    }
    else if (event.key === "ArrowUp") {
        nextIndex = Math.max(0, selectedIndex - 1);
    }
    else if (event.key === "Home") {
        nextIndex = 0;
    }
    else if (event.key === "End") {
        nextIndex = state.filteredEntries.length - 1;
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
function setStatus(message, isError = false) {
    elements.status.textContent = message;
    elements.status.classList.toggle("error", isError);
}
function formatSize(size) {
    if (size < 1024) {
        return `${size} B`;
    }
    if (size < 1024 * 1024) {
        return `${(size / 1024).toFixed(1)} KB`;
    }
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
function cssEscape(value) {
    if (globalThis.CSS?.escape !== undefined) {
        return globalThis.CSS.escape(value);
    }
    return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
function getEntrySelector(entryPath) {
    return `[data-path="${cssEscape(entryPath)}"]`;
}
function getElement(id) {
    const element = document.querySelector(`#${id}`);
    if (element === null) {
        throw new Error(`Missing element: ${id}`);
    }
    return element;
}
function parseSortBy(value) {
    if (value === "extension"
        || value === "modified"
        || value === "name"
        || value === "size") {
        return value;
    }
    return undefined;
}
