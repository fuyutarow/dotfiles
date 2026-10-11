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

export function inspectRipGraveyard(path: string): {
  bytes: number;
  ramBacked: boolean;
} {
  let bytes = 0;
  const visit = (entry: string): void => {
    const stat = lstatSync(entry, { bigint: true });
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      for (const name of readdirSync(entry)) visit(join(entry, name));
    } else {
      bytes += Number(stat.size);
    }
  };
  if (existsSync(path)) visit(path);

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
    const time = fromThrowable(
      () => Temporal.Instant.from(timestamp.trim()).epochMilliseconds,
    )();
    return time.isOk() ? [{ time: time.value, original, destination }] : [];
  });
}
