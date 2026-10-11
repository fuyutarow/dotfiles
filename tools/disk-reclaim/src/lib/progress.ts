import {
  TerminalProgress,
  type TerminalProgressOptions,
} from "../../../shared/src/terminal-progress.ts";

export type ProgressOptions = TerminalProgressOptions;
export class ProgressReporter extends TerminalProgress {
  constructor(options: ProgressOptions) {
    super({ title: "Disk reclamation", ...options });
  }
  readonly #activities = new Map<string, string>();
  override activity(target: string, task: string): void {
    this.#activities.set(target, task);
    super.activity(target, task);
  }
  report(
    target: string,
    phase: "scan" | "delete",
    entries: number,
    bytes: number,
    done = false,
    totalBytes?: number,
  ): void {
    this.update({
      id: target,
      task:
        this.#activities.get(target) ??
        (phase === "scan" ? "scan found" : "delete freed"),
      entries,
      bytes,
      done,
      ...(totalBytes === undefined ? {} : { total: totalBytes }),
    });
    if (done) this.#activities.delete(target);
  }
}
