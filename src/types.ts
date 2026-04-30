export interface DialogOptions {
  readonly allowMultipleSelection: boolean;
  readonly foldersFirst: boolean;
  readonly showHiddenFiles: boolean;
}

export interface FileEntry {
  readonly extension: string;
  readonly isDirectory: boolean;
  readonly modified: number;
  readonly name: string;
  readonly path: string;
  readonly size: number;
}

export interface FileFilter {
  readonly label: string;
  readonly patterns: readonly string[];
}

export interface DirectoryListing {
  readonly entries: readonly FileEntry[];
  readonly parentPath: string | undefined;
  readonly path: string;
}
