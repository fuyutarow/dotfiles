import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fromThrowable } from "../../../shared/src/zod.ts";

export type Graveyard = { readonly label: string; readonly path: string };
export type RipRecord = {
  readonly time: number;
  readonly original: string;
  readonly destination: string;
};

export function graveyardCandidates(
  env: Record<string, string | undefined>,
  home = homedir(),
): Graveyard[] {
  const xdgData = env.XDG_DATA_HOME ?? join(home, ".local/share");
  return [
    {
      label: "rip graveyard",
      path: env.GRAVEYARD ?? `/tmp/graveyard-${env.USER ?? ""}`,
    },
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
