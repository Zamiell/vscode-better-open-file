# vscode-better-open-file

Better Open File is a [Visual Studio Code](https://code.visualstudio.com/) extension that provides a custom file selection dialog that allows you to navigate the file system much faster than the default one.

The extension contributes the `Better Open File: Open File` command.

## Why Does This Exist?

One of the best things about Visual Studio Code is the "Ctrl + P" hotkey, which toggles the [Quick Open](https://code.visualstudio.com/docs/editing/editingevolved) feature. This allows you to immediately start typing and fuzzy-match the name of the file that you want to open. However, in some situations, you want to open a file, but you don't know the exact name, or the file is not inside of the project workspace. In those situations, you have to resort to the "Ctrl + O" hotkey to open the normal "Open File..." dialog. This will either:

1. Open the file selection dialog provided by the operating system (in normal situations).
2. Open the "[simple file dialog](https://code.visualstudio.com/docs/getstarted/tips-and-tricks#_simple-file-dialog)" provided by Visual Studio Code (when the project is on a remote computer).

Unfortunately, both of these file dialogs suck - they don't allow the same fuzzy matching that makes Quick Open great. Thus, this extension provides a minimal file selection dialog that supports fuzzy matching and basic navigational hotkeys.

## How Do I Use It?

It is not possible for Visual Studio Code extensions to replace the vanilla "File --> Open File..." functionality. Instead, you can remap the "Ctrl + O" hotkey to trigger the `Better Open File: Open File` command. To accomplish this:

- Press "Ctrl + Shift + P" to bring up the [Command Palette](https://code.visualstudio.com/api/ux-guidelines/command-palette).
- Type: `Preferences: Open Keyboard Shortcuts (JSON)`
- Add the following to the array:

```json
  {
    "key": "ctrl+o",
    "command": "betterOpenFile.openFile",
  },
```

## List of Features

The aim is to be in the [Goldilocks zone](https://en.wikipedia.org/wiki/Goldilocks_principle): extremely minimal, but not suck.

- A three column file view:
  - Name
  - Date modified
  - Size
- Use the up and down keyboard arrows to move the cursor.
- Fuzzy match:
  - Type anything to fuzzy match.
  - Use backspace to clear.
- Basic navigation buttons with hotkeys:
  - Back (Alt + Left)
  - Forward (Alt + Right)
  - Up (Alt + Up)
  - Refresh (F5)
  - Open (Enter)
  - Cancel (Escape)

## Development

Clone the repository, then run:

```sh
cd vscode-better-open-file
bun ci # Install dependencies
bun run build # To convert the TypeScript to JavaScript
code . # Open Visual Studio Code to this directory
```

In VS Code, use the `Run Extension` launch configuration.
