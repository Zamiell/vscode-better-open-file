# vscode-better-open-file

Better Open File is a [Visual Studio Code](https://code.visualstudio.com/) extension that provides a custom file-open dialog inspired by the normal Windows open-file dialog.

The extension contributes the `Better Open File: Open File` command.

## Why Does This Exist?

Sometimes, when using Visual Studio Code, you are working in a remote repository. (For example, on Windows, it is common to clone Git repositories inside of a WSL virtual machine for performance and tooling reasons.)

When Visual Studio Code is opened to a remote repository, pressing "Ctrl + O" to open a file will not show the "Open" file selection dialog that normally comes from the operating system. Instead, it uses the "[simple file dialog](https://code.visualstudio.com/docs/getstarted/tips-and-tricks#_simple-file-dialog)", which is terrible because it does support the same hotkeys and navigation features that the operating system dialog does.

In situations like this, it is desirable to have a better file dialog. Hence this extension.

## How Should I Use It?

It is not possible for Visual Studio Code extensions to replace the vanilla "File --> Open File..." functionality. Instead, you can remap the "Ctrl + O" hotkey to trigger the `Better Open File: Open File` command. To accomplish this:

- Press "Ctrl + Shift + P" to bring up the [Command Palette](https://code.visualstudio.com/api/ux-guidelines/command-palette).
- Select: `Preferences: Open Keyboard Shortcuts (JSON)`
- Add the following to the array:

```json
  {
    "key": "ctrl+o",
    "command": "betterOpenFile.openFile",
  },
```

## Limitations

Visual Studio Code extensions cannot replace the built-in `File: Open...` dialog or modify the internal "simple dialog". This extension provides a separate command that can be invoked from the Command Palette or assigned to a user keybinding.

## Development

Install dependencies, build the extension, and launch an Extension Development Host:

```sh
bun ci
bun run build
```

In VS Code, use the `Run Extension` launch configuration.

To replace your normal open-file shortcut, bind `betterOpenFile.openFile` in your user keybindings.
