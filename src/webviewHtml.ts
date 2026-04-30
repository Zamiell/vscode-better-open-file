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
        <button id="backButton" class="icon-button" type="button" title="Back" aria-label="Back">
          <span class="navigation-icon back-icon" aria-hidden="true"></span>
        </button>
        <button id="forwardButton" class="icon-button" type="button" title="Forward" aria-label="Forward">
          <span class="navigation-icon forward-icon" aria-hidden="true"></span>
        </button>
        <button id="upButton" class="icon-button" type="button" title="Up" aria-label="Up">
          <span class="navigation-icon up-icon" aria-hidden="true"></span>
        </button>
        <button id="refreshButton" class="icon-button" type="button" title="Refresh" aria-label="Refresh">
          <svg class="refresh-icon" aria-hidden="true" viewBox="0 0 16 16" focusable="false">
            <path d="M13 5.5A5.5 5.5 0 1 0 13.5 10" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.4"/>
            <path d="M13 2.5v3h-3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.4"/>
          </svg>
        </button>
        <input id="addressInput" class="address" aria-label="Folder path">
      </header>

      <section class="body">
        <nav class="places" aria-label="Places">
          <div class="pane-title">Places</div>
          <div id="placesList" class="places-list"></div>
        </nav>

        <section class="files-pane" aria-label="Files">
          <div class="table-header" role="row">
            <button type="button" data-sort="name">Name</button>
            <button type="button" data-sort="modified">Date modified</button>
            <button type="button" data-sort="extension">Type</button>
            <button type="button" data-sort="size">Size</button>
          </div>
          <div
            id="fileList"
            class="file-list"
            role="listbox"
            aria-label="Files and folders"
            tabindex="0"
          ></div>
        </section>
      </section>

      <div id="errorStatus" class="error-status" role="alert" hidden></div>

      <footer class="footer">
        <div id="itemCount" class="item-count" aria-live="polite">0 items</div>
        <label for="fileNameInput">File name:</label>
        <input id="fileNameInput" aria-label="File name">
        <label for="filterSelect">Files of type:</label>
        <select id="filterSelect" aria-label="Files of type"></select>
        <button id="openButton" type="button" class="primary" disabled>Open</button>
        <button id="cancelButton" type="button">Cancel</button>
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
