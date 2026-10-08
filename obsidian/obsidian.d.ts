declare module "obsidian" {
  export class Plugin {
    app: App;

    registerView(
      type: string,
      createView: (leaf: WorkspaceLeaf) => FileView,
    ): void;
    registerExtensions(extensions: string[], viewType: string): void;
  }

  export class FileView {
    constructor(leaf: WorkspaceLeaf);
    app: App;
    file: TFile | undefined;
    contentEl: ViewContainer;
  }

  export interface TFile {
    basename: string;
    extension: string;
    path: string;
  }

  export interface WorkspaceLeaf {
    view?: {
      file?: TFile;
      getViewType(): string;
    };
    setViewState(state: {
      type: string;
      state: { file: string };
      popstate: boolean;
    }): void | Promise<void>;
  }

  export interface ViewContainer extends HTMLElement {
    createDiv(options: { cls: string }): ViewContainer;
    createEl(tag: string, options: { text: string }): HTMLElement;
  }

  export interface App {
    viewRegistry: {
      getTypeByExtension(extension: string): string | undefined;
      unregisterExtensions(extensions: string[]): void;
    };
    workspace: {
      onLayoutReady(callback: () => void): void;
      iterateAllLeaves(callback: (leaf: WorkspaceLeaf) => void): void;
    };
    vault: { adapter: { getFullPath(path: string): string } };
    openWithDefaultApp(path: string): void | Promise<void>;
  }
}

declare namespace NodeJS {
  interface Require {
    (id: "obsidian"): typeof import("obsidian");
    (id: "node:child_process"): typeof import("node:child_process");
  }
}

declare const require: NodeJS.Require;

declare module "node:child_process" {
  export interface ExecFileError {
    code?: string;
    killed?: boolean | null;
  }

  export function execFile(
    file: string,
    args: string[],
    options: { timeout?: number; maxBuffer?: number; encoding: "utf8" },
    callback: (error: ExecFileError | null, stdout: string) => void,
  ): void;
}
