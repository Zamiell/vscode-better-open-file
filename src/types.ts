export interface DialogOptions {
  readonly allowMultipleSelection: boolean;
  readonly foldersFirst: boolean;
  readonly showHiddenFiles: boolean;
}

export interface FileEntry {
  readonly isDirectory: boolean;
  readonly modified: number;
  readonly name: string;
  readonly path: string;
  readonly size: number;
}

export interface DirectoryListing {
  readonly entries: readonly FileEntry[];
  readonly parentPath: string | undefined;
  readonly path: string;
}
