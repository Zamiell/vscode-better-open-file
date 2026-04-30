# vscode-better-open-file

Better Open File is a Visual Studio Code extension that provides a custom file-open dialog inspired by the normal Windows open-file dialog.

The extension contributes the `Better Open File: Open File` command. It opens a webview dialog with a places sidebar, address bar, navigation buttons, sortable file list, file-name input, file-type filters, and Open/Cancel actions. Selected files open in VS Code editors.

## Limitations

Visual Studio Code extensions cannot replace every built-in `File: Open...` flow or modify VS Code's internal simple dialog. This extension provides a separate command that can be invoked from the Command Palette or assigned to a user keybinding.

## Development

Install dependencies, build the extension, and launch an Extension Development Host:

```sh
bun install
bun run build
```

In VS Code, use the `Run Extension` launch configuration.

## Configuration

- `betterOpenFile.initialDirectory`: choose `workspaceRoot`, `currentEditor`, `home`, or `lastUsed`.
- `betterOpenFile.showHiddenFiles`: show hidden files and folders.
- `betterOpenFile.allowMultipleSelection`: allow opening multiple selected files.
- `betterOpenFile.foldersFirst`: sort folders before files.

To replace your normal open-file shortcut, bind `betterOpenFile.openFile` in your user keybindings.
