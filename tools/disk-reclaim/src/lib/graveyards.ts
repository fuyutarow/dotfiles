import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  statfsSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fromThrowable } from "../../../shared/src/zod.ts";

export type Graveyard = { readonly label: string; readonly path: string };
export type RipRecord = {
  readonly time: number;
  readonly original: string;
  readonly destination: string;
};

// Doctor's declared safety ceiling; 10 GiB leaves room for recovery while catching runaway
// graveyards such as the 18 GiB tmpfs directory reported on r99-u26.
export const RIP_GRAVEYARD_MAX_BYTES = 10 * 1024 ** 3;
const TMPFS_MAGIC = 0x01021994n;
const RAMFS_MAGIC = 0x858458f6n;

export function inspectRipGraveyard(
  path: string,
  timeoutMs = 40_000,
): {
  bytes: number;
  ramBacked: boolean;
  complete: boolean;
  timedOut: boolean;
  visited: number;
  elapsedMs: number;
} {
  let bytes = 0;
  const started = Temporal.Now.instant().epochMilliseconds;
  const elapsed = (): number =>
    Temporal.Now.instant().epochMilliseconds - started;
  let visited = 0;
  let timedOut = false;
  const pending = existsSync(path) ? [path] : [];
  const inspect = (entry: string): boolean => {
    const stat = lstatSync(entry, { bigint: true });
    visited += 1;
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      bytes += Number(stat.size);
      return false;
    }
    for (const child of readdirSync(entry, { withFileTypes: true })) {
      const childPath = join(entry, child.name);
      if (child.isDirectory()) pending.push(childPath);
      else {
        bytes += Number(lstatSync(childPath, { bigint: true }).size);
        visited += 1;
      }
      if (elapsed() >= timeoutMs) return true;
    }
    return false;
  };
  while (pending.length > 0) {
    if (elapsed() >= timeoutMs) {
      timedOut = true;
      break;
    }
    const entry = pending.pop();
    if (entry === undefined) break;
    timedOut = inspect(entry);
    if (timedOut) break;
  }

  let filesystemPath = path;
  while (!existsSync(filesystemPath)) {
    const parent = dirname(filesystemPath);
    if (parent === filesystemPath) break;
    filesystemPath = parent;
  }
  const type = statfsSync(filesystemPath, { bigint: true }).type;
  return {
    bytes,
    ramBacked: type === TMPFS_MAGIC || type === RAMFS_MAGIC,
    complete: !timedOut && pending.length === 0,
    timedOut,
    visited,
    elapsedMs: elapsed(),
  };
}

export function graveyardCandidates(
  env: Record<string, string | undefined>,
  home = homedir(),
): Graveyard[] {
  const xdgData = env.XDG_DATA_HOME ?? join(home, ".local/share");
  const ripGraveyard = env.RIP_GRAVEYARD;
  return [
    ...(ripGraveyard === undefined
      ? []
      : [{ label: "rip graveyard", path: ripGraveyard }]),
    { label: "XDG trash: files", path: join(xdgData, "Trash/files") },
    { label: "XDG trash: info", path: join(xdgData, "Trash/info") },
  ];
}

export function existingGraveyards(
  candidates: Graveyard[],
  isDir: (path: string) => boolean = (path) =>
    fromThrowable(() => lstatSync(path).isDirectory())().unwrapOr(false),
): Graveyard[] {
  return candidates.filter((g) => isDir(g.path));
}

export function graveyardEntries(path: string): string[] {
  return fromThrowable(() => readdirSync(path))()
    .map((names) => names.map((name) => join(path, name)))
    .unwrapOr([]);
}

// rm-improved writes local ctime text; newer writers may use ISO instants.
// Interpret the former in the machine's zone, just as rip does when restoring.
function ripTime(timestamp: string): number | undefined {
  const iso = fromThrowable(
    () => Temporal.Instant.from(timestamp.trim()).epochMilliseconds,
  )();
  if (iso.isOk()) return iso.value;
  const fields = timestamp
    .trim()
    .match(
      /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/u,
    );
  if (fields === null) return undefined;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return fromThrowable(
    () =>
      Temporal.PlainDateTime.from(
        {
          year: Number(fields[6]),
          month: months.indexOf(fields[1] ?? "") + 1,
          day: Number(fields[2]),
          hour: Number(fields[3]),
          minute: Number(fields[4]),
          second: Number(fields[5]),
        },
        { overflow: "reject" },
      ).toZonedDateTime(Temporal.Now.timeZoneId()).epochMilliseconds,
  )().unwrapOr(undefined);
}

export function ripRecords(path: string): RipRecord[] {
  const contents = fromThrowable(() =>
    readFileSync(join(path, ".record"), "utf8"),
  )();
  if (contents.isErr()) return [];
  return contents.value.split(/\r?\n/u).flatMap((line) => {
    const [timestamp, original, destination] = line.split("\t");
    if (
      timestamp === undefined ||
      original === undefined ||
      destination === undefined
    )
      return [];
    const time = ripTime(timestamp);
    return time === undefined ? [] : [{ time, original, destination }];
  });
}
