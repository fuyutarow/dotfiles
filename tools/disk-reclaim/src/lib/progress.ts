export type ProgressSnapshot = {
  target: string;
  phase: "scan" | "delete";
  entries: number;
  bytes: number;
  started: number;
  updated: number;
  done: boolean;
};

export type ProgressOptions = {
  tty: boolean;
  now?: () => number;
  write?: (text: string) => void;
};

const formatBytes = (bytes: number): string => `${bytes} bytes`;

export class ProgressReporter {
  readonly #tty: boolean;
  readonly #now: () => number;
  readonly #write: (text: string) => void;
  readonly #rows = new Map<string, ProgressSnapshot>();
  #drawn = 0;

  constructor(options: ProgressOptions) {
    this.#tty = options.tty;
    this.#now = options.now ?? (() => performance.now());
    this.#write = options.write ?? ((text) => process.stderr.write(text));
  }

  report(
    target: string,
    phase: ProgressSnapshot["phase"],
    entries: number,
    bytes: number,
    done = false,
  ): void {
    const now = this.#now();
    const previous = this.#rows.get(target);
    const row: ProgressSnapshot = {
      target,
      phase,
      entries,
      bytes,
      started: previous?.started ?? now,
      updated: now,
      done,
    };
    const interval = this.#tty ? 100 : 2000;
    if (!done && previous !== undefined && now - previous.updated < interval)
      return;
    this.#rows.set(target, row);
    if (this.#tty) this.#draw();
    else this.#write(`${this.#line(row)}\n`);
  }

  #line(row: ProgressSnapshot): string {
    const elapsed = Math.max(0.001, (row.updated - row.started) / 1000);
    const rate = Math.round(row.bytes / elapsed);
    return `[reclaim] ${row.target}: ${row.phase}${row.done ? " complete" : ""} · ${row.entries} entries · ${formatBytes(row.bytes)} · ${formatBytes(rate)}/s · ${elapsed.toFixed(1)}s`;
  }

  #draw(): void {
    const rows = [...this.#rows.values()];
    if (this.#drawn > 0) this.#write(`\u001B[${this.#drawn + 1}A`);
    const total = rows.reduce(
      (sum, row) => ({
        entries: sum.entries + row.entries,
        bytes: sum.bytes + row.bytes,
      }),
      { entries: 0, bytes: 0 },
    );
    for (const row of rows) this.#write(`\u001B[2K${this.#line(row)}\n`);
    const started = Math.min(...rows.map((row) => row.started));
    const elapsed = Math.max(0.001, (this.#now() - started) / 1000);
    this.#write(
      `\u001B[2K[reclaim] total: scan · ${total.entries} entries · ${formatBytes(total.bytes)} · ${formatBytes(Math.round(total.bytes / elapsed))}/s · ${elapsed.toFixed(1)}s\n`,
    );
    this.#drawn = rows.length + 1;
  }
}
