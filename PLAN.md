# PLAN: Better Open File VS Code Extension

## Feasibility

Yes, this is possible as a VS Code extension, with one important limitation: VS Code extensions cannot replace every built-in `File: Open...` path with a fully native Windows common-file-dialog implementation. Extensions can:

- Contribute a new command, such as `Better Open File: Open File`.
- Bind that command to a shortcut if the user wants it to replace their normal open-file workflow.
- Open files, folders, and workspace entries through the VS Code API.
- Render a custom UI in a webview that visually imitates the normal Windows open-file dialog.
- Use VS Code or Node file-system APIs to enumerate drives, folders, and files.

Extensions cannot:

- Embed the actual Windows Explorer open-file dialog inside VS Code while also customizing it.
- Directly modify VS Code's internal simple dialog UI.
- Reliably intercept every built-in open-file command from the workbench.
- Provide a true modal native dialog from a webview.

The recommended product direction is therefore a Windows-style custom dialog implemented as an extension webview, backed by extension-host file-system operations, and exposed through a command that users can invoke from the Command Palette or bind to their preferred keyboard shortcut.

## Goals

Build a VS Code extension that provides a custom file-open dialog with a Windows-open-dialog-inspired layout:

- Address bar with breadcrumb navigation.
- Back, forward, up, and refresh controls.
- Sidebar shortcuts such as Home, Desktop, Documents, Downloads, workspace roots, and drives.
- Main file list with name, type, modified date, and size columns.
- Filename input.
- File type filter dropdown.
- Open and Cancel buttons.
- Keyboard navigation close to a native dialog.
- Integration with VS Code so selected files open in editors.

## Non-goals

- Replacing VS Code's internal file dialog globally.
- Perfectly cloning copyrighted Windows UI assets, icons, or exact visual design.
- Implementing a privileged native Windows shell extension.
- Supporting remote file systems in the first version unless explicitly enabled through VS Code workspace APIs.

## Phase 1: Convert the TypeScript template into a VS Code extension

1. Update `package.json` extension metadata:
   - Set a VS Code extension description.
   - Add `publisher`, `displayName`, `categories`, `keywords`, `engines.vscode`, and `license`.
   - Set `main` to the compiled extension entry point, for example `./dist/extension.js`.
   - Add `activationEvents` for the contributed command.
   - Add `contributes.commands` for `betterOpenFile.openFile`.
   - Decide whether to contribute a default keybinding or document user keybinding setup instead. Avoid overriding `Ctrl+O` by default unless that is explicitly desired.

2. Add VS Code extension dependencies:
   - Add `@types/vscode` for compile-time API types.
   - Add `@vscode/test-electron` if integration tests are added.
   - Add packaging tooling such as `@vscode/vsce` or equivalent release tooling.

3. Adjust TypeScript build output:
   - Replace the generic `src/main.ts` entry point with `src/extension.ts`.
   - Export `activate(context: vscode.ExtensionContext)` and `deactivate()`.
   - Ensure the compiler emits code compatible with the VS Code extension host.
   - Keep existing linting where possible and update configuration only where required for VS Code globals and extension output.

4. Add launch/debug configuration:
   - Add `.vscode/launch.json` for launching an Extension Development Host.
   - Add `.vscode/tasks.json` if needed for prelaunch build tasks.

## Phase 2: Add the extension command and shell behavior

1. Register the command:
   - Implement `betterOpenFile.openFile`.
   - Create and reveal the custom dialog webview.
   - Pass initial state to the webview, including current workspace roots and initial directory.

2. Define opening behavior:
   - Single file selection opens with `vscode.window.showTextDocument`.
   - Multi-file selection opens each selected file.
   - Folder selection can either navigate into the folder or open the folder in VS Code, depending on the active mode.
   - Cancel closes the dialog without changing the workspace.

3. Define configuration settings:
   - Initial directory behavior: current editor folder, workspace root, home directory, or last-used directory.
   - Show hidden files.
   - Allow multiple selection.
   - Default file filters.
   - Whether folders are selectable or navigation-only.

## Phase 3: Implement file-system service in the extension host

1. Build a file-system abstraction:
   - List directory entries.
   - Resolve parent directories.
   - Detect drives on Windows.
   - Read file metadata: type, size, modified time.
   - Normalize paths safely across Windows, macOS, and Linux.

2. Start with local file support:
   - Use Node `fs/promises`, `path`, and `os` APIs for local paths.
   - Use Windows drive discovery when running on Windows.
   - Gracefully surface permission errors in the dialog.

3. Decide remote-workspace behavior:
   - For v1, either clearly mark remote file systems as unsupported or implement support through `vscode.workspace.fs` for workspace-scoped URIs.
   - Do not silently mix local extension-host paths with remote workspace paths.

4. Add history state:
   - Back stack.
   - Forward stack.
   - Last-used directory stored in `context.globalState`.
   - Recently visited locations.

## Phase 4: Build the Windows-style webview UI

1. Create webview assets:
   - HTML shell.
   - CSS approximating Windows open-dialog layout without copying proprietary assets.
   - TypeScript client code compiled or bundled for the webview.

2. Layout components:
   - Title/header area.
   - Toolbar with back, forward, up, and refresh.
   - Breadcrumb/address bar with editable path mode.
   - Left navigation pane.
   - Main file table/list.
   - Status/error area.
   - Footer with file name, type filter, Open, and Cancel.

3. Interaction behavior:
   - Double-click folder to navigate.
   - Double-click file to open.
   - Type path and press Enter to navigate.
   - Select file and press Enter to open.
   - Escape cancels.
   - Arrow keys move selection.
   - Ctrl/Shift selection if multi-select is enabled.
   - Refresh reloads the current directory.

4. Accessibility:
   - Use semantic roles where appropriate.
   - Ensure keyboard-only operation.
   - Provide focus indicators.
   - Respect VS Code theme variables for fonts, colors, contrast, and high-contrast modes.

5. Security:
   - Use a strict webview content security policy.
   - Avoid inline scripts.
   - Sanitize all rendered file names and paths.
   - Use nonce-based scripts and VS Code webview URIs for local assets.

## Phase 5: Wire webview messaging

1. Define message contracts:
   - `ready`
   - `listDirectory`
   - `navigate`
   - `openSelection`
   - `cancel`
   - `setFilter`
   - `showError`
   - `directoryListing`

2. Add typed shared message definitions:
   - Keep host-to-webview and webview-to-host messages type-safe.
   - Validate message payloads before using them.

3. Handle errors explicitly:
   - Permission denied.
   - Path does not exist.
   - Not a directory.
   - File disappeared between listing and opening.
   - Unsupported URI or remote workspace.

## Phase 6: File filtering and sorting

1. Implement filters:
   - All files.
   - Common source files.
   - User-configured patterns.
   - Optional extension-specific filters.

2. Implement sorting:
   - Name.
   - Date modified.
   - Type.
   - Size.
   - Folders first option.

3. Add search/narrowing:
   - Filename input should select matching entries.
   - Optional simple wildcard support such as `*.ts`.
   - Avoid expensive recursive search for v1 unless explicitly added as a separate mode.

## Phase 7: Tests and validation

1. Unit-test pure logic:
   - Path normalization.
   - Filter matching.
   - Sorting.
   - Message validation.
   - History behavior.

2. Extension integration tests:
   - Command registration.
   - Webview creation.
   - Opening a selected file.
   - Error handling for invalid paths.

3. Manual validation:
   - Launch Extension Development Host.
   - Run the contributed command from the Command Palette.
   - Navigate through workspace folders.
   - Open a file.
   - Verify keyboard navigation.
   - Verify theming in light, dark, and high-contrast themes.

4. Existing repo checks:
   - Keep `bun run build` passing.
   - Keep `bun run lint` passing.

## Phase 8: Documentation and packaging

1. Update `README.md`:
   - Explain what the extension does.
   - Document the limitation that it provides a custom command rather than replacing every built-in VS Code file-open path.
   - Document setup, usage, configuration, and keybinding override instructions.
   - Include screenshots once the UI exists.

2. Add extension marketplace metadata:
   - Icon.
   - Gallery banner.
   - Categories.
   - Keywords.
   - Changelog.

3. Add packaging script:
   - Build the extension.
   - Package a `.vsix`.
   - Optionally publish through VS Code Marketplace tooling.

## Suggested first implementation milestone

The first useful milestone should be:

1. Convert the repository into a loadable VS Code extension.
2. Add a `Better Open File: Open File` command.
3. Show a webview with a simple Windows-style shell.
4. List files for the current workspace root.
5. Open a selected file in VS Code.

After that works, iterate on navigation, filters, polish, accessibility, and packaging.
