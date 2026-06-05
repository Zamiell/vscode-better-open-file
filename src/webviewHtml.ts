import * as vscode from "vscode";

export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string {
  const nonce = getNonce();
  const cssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "dialog.css"),
  );
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "dialog.js"),
  );
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
    "img-src data:",
  ].join("; ");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta
      http-equiv="Content-Security-Policy"
      content="${csp}"
    >
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="${cssUri}">
    <title>Better Open File</title>
  </head>
  <body>
    <main class="dialog" aria-label="Better Open File">
      <header class="toolbar" aria-label="Navigation">
        <button id="backButton" class="icon-button" type="button" title="Back (Alt+Left)" aria-label="Back">
          <span class="navigation-icon back-icon" aria-hidden="true"></span>
        </button>
        <button id="forwardButton" class="icon-button" type="button" title="Forward (Alt+Right)" aria-label="Forward">
          <span class="navigation-icon forward-icon" aria-hidden="true"></span>
        </button>
        <button id="upButton" class="icon-button" type="button" title="Up (Alt+Up)" aria-label="Up">
          <span class="navigation-icon up-icon" aria-hidden="true"></span>
        </button>
        <button id="refreshButton" class="icon-button" type="button" title="Refresh (F5)" aria-label="Refresh">
          <svg class="refresh-icon" aria-hidden="true" viewBox="0 0 16 16" focusable="false">
            <path d="M13 5.5A5.5 5.5 0 1 0 13.5 10" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.4"/>
            <path d="M13 2.5v3h-3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.4"/>
          </svg>
        </button>
        <button id="newFileButton" class="icon-button" type="button" title="New File (Ctrl+Shift+M)" aria-label="New File">
          <svg class="new-file-icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
            <path d="M6.5 3.5h7l4 4v13h-11z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.8"/>
            <path d="M13.5 3.5v4h4M12 11.8v5.4M9.3 14.5h5.4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>
          </svg>
        </button>
        <button id="newDirectoryButton" class="icon-button" type="button" title="New Directory (Ctrl+Shift+N)" aria-label="New Directory">
          <svg class="new-directory-icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
            <path d="M3.5 6.5a2 2 0 0 1 2-2h5l2.5 2.5h5.5a2 2 0 0 1 2 2v5.5H3.5z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.8"/>
            <circle cx="17" cy="16.5" r="5" fill="var(--vscode-button-secondaryBackground)" stroke="currentColor" stroke-width="1.8"/>
            <path d="M17 13.8v5.4M14.3 16.5h5.4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/>
          </svg>
        </button>
        <input id="addressInput" class="address" aria-label="Directory path">
      </header>

      <section class="body">
        <section class="files-pane" aria-label="Files">
          <div class="table-header" role="row">
            <div class="table-header-cell" role="columnheader">Name</div>
            <div class="table-header-cell" role="columnheader">Date modified</div>
            <div class="table-header-cell" role="columnheader">Size</div>
          </div>
          <div
            id="fileList"
            class="file-list"
            role="listbox"
            aria-label="Files and directories"
            tabindex="0"
          ></div>
        </section>
      </section>

      <div id="errorStatus" class="error-status" role="alert" hidden></div>

      <div id="contextMenu" class="context-menu" role="menu" aria-label="File list actions" hidden>
        <button id="contextCopyButton" class="context-menu-item" type="button" role="menuitem" hidden>Copy (Ctrl+C)</button>
        <button id="contextCutButton" class="context-menu-item" type="button" role="menuitem" hidden>Cut (Ctrl+X)</button>
        <button id="contextPasteButton" class="context-menu-item" type="button" role="menuitem" hidden>Paste (Ctrl+V)</button>
        <button id="contextRenameButton" class="context-menu-item" type="button" role="menuitem" hidden>Rename (F2)</button>
        <button id="contextNewFileButton" class="context-menu-item" type="button" role="menuitem">New File (Ctrl+Shift+M)</button>
        <button id="contextNewDirectoryButton" class="context-menu-item" type="button" role="menuitem">New Directory (Ctrl+Shift+N)</button>
      </div>

      <footer class="footer">
        <div id="itemCount" class="item-count" aria-live="polite">0 items</div>
        <label for="fileNameInput">Filter files:</label>
        <input id="fileNameInput" aria-label="Filter files">
        <button id="clearFilterButton" type="button" title="Clear filter" hidden>Clear</button>
        <button id="openButton" type="button" class="primary" title="Open (Enter)" disabled>Open</button>
        <button id="cancelButton" type="button" title="Cancel (Escape)">Cancel</button>
      </footer>
    </main>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>
`;
}

function getNonce(): string {
  const possibleCharacters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";

  for (let index = 0; index < 32; index++) {
    const characterIndex = Math.floor(
      Math.random() * possibleCharacters.length,
    );
    nonce += possibleCharacters.charAt(characterIndex);
  }

  return nonce;
}
