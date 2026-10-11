import { taskLog } from "@clack/prompts";
import { Writable } from "node:stream";
import { stripVTControlCharacters } from "node:util";

export type ProgressRow = {
  id: string;
  task: string;
  entries: number;
  bytes: number;
  total?: number;
  done?: boolean;
};
export type TerminalProgressOptions = {
  tty: boolean;
  title?: string;
  now?: () => number;
  write?: (text: string) => void;
  columns?: () => number;
};
type TimedRow = ProgressRow & { started: number; updated: number };
const clean = (text: string) =>
  stripVTControlCharacters(text)
    .split("")
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || (code >= 127 && code <= 159) ? " " : character;
    })
    .join("");
const bytes = (value: number) => {
  if (value < 1024) return `${Math.round(value)} B`;
  const unit = Math.min(3, Math.floor(Math.log2(value) / 10));
  return `${(value / 1024 ** unit).toFixed(1)}${["B", "KiB", "MiB", "GiB"][unit]}`;
};

/** Clack owns all terminal redraws; the adapter owns counters and plain output. */
export class TerminalProgress {
  readonly #options: TerminalProgressOptions;
  readonly #now: () => number;
  readonly #write: (text: string) => void;
  readonly #rows = new Map<string, TimedRow>();
  readonly #printed = new Map<string, number>();
  readonly #groups = new Map<
    string,
    ReturnType<ReturnType<typeof taskLog>["group"]>
  >();
  readonly #messages: string[] = [];
  #log: ReturnType<typeof taskLog> | undefined;
  #closed = false;
  #lastFrame = -Infinity;
  #timer: ReturnType<typeof setInterval> | undefined;

  constructor(options: TerminalProgressOptions) {
    this.#options = options;
    this.#now = options.now ?? (() => performance.now());
    this.#write =
      options.write ??
      ((text) => {
        process.stderr.write(text);
      });
  }

  start(): void {
    if (this.#timer !== undefined || this.#closed) return;
    this.#timer = setInterval(
      () => {
        this.refresh();
      },
      this.#options.tty ? 100 : 2000,
    );
    this.#timer.unref();
  }

  update(value: ProgressRow): void {
    if (this.#closed) return;
    const now = this.#now();
    const previous = this.#rows.get(value.id);
    const continuing =
      previous !== undefined &&
      previous.done !== true &&
      previous.task === value.task;
    const row = {
      ...value,
      bytes: continuing ? Math.max(previous.bytes, value.bytes) : value.bytes,
      entries: continuing
        ? Math.max(previous.entries, value.entries)
        : value.entries,
      started: continuing ? previous.started : now,
      updated: now,
    };
    this.#rows.set(value.id, row);
    if (value.done === true) {
      if (this.#options.tty) this.#group(row).success(this.#line(row, now));
      else this.#write(`${this.#line(row, now)}\n`);
      this.#printed.set(value.id, now);
    } else this.refresh(previous === undefined || previous.done === true);
  }

  activity(id: string, task: string): void {
    const previous = this.#rows.get(id);
    this.update({
      id,
      task,
      entries: previous?.entries ?? 0,
      bytes: previous?.bytes ?? 0,
    });
  }

  message(text: string): void {
    if (this.#closed) return;
    const message = clean(text);
    if (this.#log !== undefined) {
      this.#messages.push(message);
      this.#log.message(message);
    } else this.#write(`${message}\n`);
  }

  refresh(force = false): void {
    if (this.#closed) return;
    const now = this.#now();
    if (this.#options.tty && !force && now - this.#lastFrame < 100) return;
    this.#lastFrame = now;
    for (const row of this.#rows.values()) {
      if (row.done === true) continue;
      if (this.#options.tty) this.#group(row).message(this.#line(row, now));
      else if (now - (this.#printed.get(row.id) ?? -Infinity) >= 2000) {
        this.#write(`${this.#line(row, now)}\n`);
        this.#printed.set(row.id, now);
      }
    }
  }

  finish(): void {
    if (this.#closed) return;
    if (this.#timer !== undefined) clearInterval(this.#timer);
    let interrupted = false;
    for (const row of this.#rows.values()) {
      if (row.done === true) continue;
      interrupted = true;
      const stopped = {
        ...row,
        task: `${row.task} interrupted`,
        done: true,
        updated: this.#now(),
      };
      this.#rows.set(row.id, stopped);
      const line = this.#line(stopped, stopped.updated);
      if (this.#options.tty) this.#group(row).error(line);
      else this.#write(`${line}\n`);
    }
    // taskLog never changes cursor visibility or terminal input modes. Finalizing
    // its region leaves the cursor on a fresh line, including on abort/errors.
    this.#flush(interrupted);
    this.#closed = true;
  }

  #flush(interrupted: boolean): void {
    if (interrupted)
      this.#log?.error("Progress interrupted", { showLog: false });
    else this.#log?.success("Progress finished", { showLog: false });
    const completed = [...this.#rows.values()].filter(
      (row) => row.done === true,
    );
    if (this.#log !== undefined)
      for (const row of completed)
        this.#write(`${this.#line(row, row.updated)}\n`);
    for (const message of this.#messages) this.#write(`${message}\n`);
    this.#log = undefined;
    this.#groups.clear();
    this.#rows.clear();
    this.#printed.clear();
    this.#messages.length = 0;
  }

  #group(row: TimedRow) {
    if (this.#log === undefined) {
      const write = this.#write;
      const output = Object.assign(
        new Writable({
          write(chunk, _encoding, callback) {
            write(String(chunk));
            callback();
          },
        }),
        {
          isTTY: true,
          columns: this.#columns(),
        },
      );
      this.#log = taskLog({
        title: this.#options.title ?? "Progress",
        output,
        limit: 1,
        spacing: 0,
      });
    }
    let group = this.#groups.get(row.id);
    if (group === undefined || this.#printed.has(row.id)) {
      group = this.#log.group("");
      this.#groups.set(row.id, group);
      this.#printed.delete(row.id);
    }
    return group;
  }

  #line(row: TimedRow, now: number): string {
    const elapsed = Math.max(0, (now - row.started) / 1000);
    const rate = elapsed > 0 ? row.bytes / elapsed : 0;
    const icon =
      row.done === true
        ? "done"
        : ["|", "/", "-", "\\"][Math.floor(now / 100) % 4];
    const eta =
      row.total !== undefined && rate > 0 && row.bytes < row.total
        ? ` · ETA ${((row.total - row.bytes) / rate).toFixed(1)}s`
        : "";
    const name = clean(row.id);
    const id =
      this.#options.tty && name.length > 18
        ? `${name.slice(0, 8)}…${name.slice(-8)}`
        : name;
    const completion =
      row.done === true &&
      !this.#options.tty &&
      !row.task.endsWith("interrupted")
        ? " complete"
        : "";
    const line = `${icon} ${id}: ${clean(row.task)}${completion} · ${row.entries} entries · ${bytes(row.bytes)} · ${bytes(rate)}/s · ${elapsed.toFixed(1)}s${eta}`;
    if (!this.#options.tty) return line;
    const width = Math.max(1, this.#columns() - 4);
    const metrics = `${bytes(row.bytes)} · ${bytes(rate)}/s · ${elapsed.toFixed(1)}s${eta} · ${row.entries} entries`;
    const label = `${icon} ${id}: ${clean(row.task)}${completion}`;
    const budget = Math.max(1, width - metrics.length - 3);
    const candidate =
      metrics.length < width ? `${label.slice(0, budget)} · ${metrics}` : line;
    let clipped = "";
    let used = 0;
    for (const { segment } of new Intl.Segmenter().segment(candidate)) {
      const cells =
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}]/u.test(
          segment,
        )
          ? 2
          : 1;
      if (used + cells > width) break;
      clipped += segment;
      used += cells;
    }
    return clipped;
  }

  #columns(): number {
    const columns = this.#options.columns?.() ?? process.stderr.columns ?? 80;
    return columns > 0 ? columns : 80;
  }
}
