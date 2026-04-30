# vscode-better-open-file

Better Open File is a [Visual Studio Code](https://code.visualstudio.com/) extension that provides a custom file-open dialog inspired by the normal Windows open-file dialog.

The extension contributes the `Better Open File: Open File` command.

## Limitations

Visual Studio Code extensions cannot replace the built-in `File: Open...` dialog or modify the internal "simple dialog". This extension provides a separate command that can be invoked from the Command Palette or assigned to a user keybinding.

## Development

Install dependencies, build the extension, and launch an Extension Development Host:

```sh
bun ci
bun run build
```

In VS Code, use the `Run Extension` launch configuration.

## Configuration

- `betterOpenFile.initialDirectory`: choose `workspaceRoot`, `currentEditor`, `home`, or `lastUsed`.
- `betterOpenFile.showHiddenFiles`: show hidden files and folders.
- `betterOpenFile.allowMultipleSelection`: allow opening multiple selected files.
- `betterOpenFile.foldersFirst`: sort folders before files.

To replace your normal open-file shortcut, bind `betterOpenFile.openFile` in your user keybindings.
