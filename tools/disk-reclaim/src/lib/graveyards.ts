import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  statfsSync,
} from "node:fs";
import { homedir } from "node:os";
import { lstat, readdir } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fromThrowable } from "@dotfiles/shared/src/zod.ts";

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

export async function inspectRipGraveyard(
  path: string,
  timeoutMs = 40_000,
): Promise<{
  bytes: number;
  ramBacked: boolean;
  complete: boolean;
  timedOut: boolean;
  visited: number;
  elapsedMs: number;
}> {
  let bytes = 0;
  const started = Temporal.Now.instant().epochMilliseconds;
  const elapsed = (): number =>
    Temporal.Now.instant().epochMilliseconds - started;
  let visited = 0;
  let timedOut = false;
  const pending = existsSync(path) ? [path] : [];
  const inspect = async (entry: string): Promise<boolean> => {
    const stat = await lstat(entry, { bigint: true });
    visited += 1;
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      bytes += Number(stat.size);
      return false;
    }
    for (const child of await readdir(entry, { withFileTypes: true })) {
      const childPath = join(entry, child.name);
      if (child.isDirectory()) pending.push(childPath);
      else {
        bytes += Number((await lstat(childPath, { bigint: true })).size);
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
    timedOut = await inspect(entry);
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
  const xdgData = env["XDG_DATA_HOME"] ?? join(home, ".local/share");
  const ripGraveyard = env["RIP_GRAVEYARD"];
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

export const UNKNOWN_RIP_BURIAL =
  "burial time unknown: missing, unreadable, or invalid burial record";

export function ripGraveyardRoot(env = process.env, home = homedir()): string {
  return resolve(
    env["RIP_GRAVEYARD"] ??
      join(env["XDG_DATA_HOME"] ?? join(home, ".local/share"), "graveyard"),
  );
}

/** A mirrored parent is dated only when every payload below it has a record.
 * Descendants of a recorded payload share its burial, never their source mtime.
 */
export async function ripBurialTime(
  root: string,
  path: string,
  records = ripRecords(root),
  check: () => void = () => {},
): Promise<number | undefined> {
  const times = new Map<string, number>();
  const containers = new Set<string>();
  for (const record of records) {
    check();
    const destination = resolve(record.destination);
    if (!destination.startsWith(`${root}${sep}`)) continue;
    times.set(
      destination,
      Math.max(times.get(destination) ?? -Infinity, record.time),
    );
    let parent = dirname(destination);
    while (parent !== root && parent.startsWith(`${root}${sep}`)) {
      containers.add(parent);
      parent = dirname(parent);
    }
  }
  let ancestor = path;
  while (ancestor !== root && ancestor.startsWith(`${root}${sep}`)) {
    const time = times.get(ancestor);
    if (time !== undefined) {
      const newer = records.filter((record) =>
        resolve(record.destination).startsWith(`${path}${sep}`),
      );
      return Math.max(time, ...newer.map((record) => record.time));
    }
    ancestor = dirname(ancestor);
  }
  const descendantTimes = records
    .filter((record) => resolve(record.destination).startsWith(`${path}${sep}`))
    .map((record) => record.time);
  let newest: number | undefined =
    descendantTimes.length === 0 ? undefined : Math.max(...descendantTimes);
  const pending = [path];
  while (pending.length > 0) {
    check();
    const entry = pending.pop();
    if (entry === undefined) break;
    const time = times.get(entry);
    if (time !== undefined) {
      newest = Math.max(newest ?? -Infinity, time);
      continue;
    }
    if (entry !== root && !containers.has(entry)) return undefined;
    const stat = await lstat(entry);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return undefined;
    pending.push(
      ...(await readdir(entry))
        .filter((name) => entry !== root || name !== ".record")
        .map((name) => join(entry, name)),
    );
  }
  return newest;
}
