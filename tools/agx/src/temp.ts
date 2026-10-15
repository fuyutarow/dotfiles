import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "../../../agents/hooks/zod.ts";
import { err, fromThrowable, ok, Result } from "neverthrow";

// Every agx run owns one directory under the temp root, named by its run id, with a sibling
// `<run-id>.pid` that records the owning agx process. The owner removes the directory when the
// run ends; a SIGKILLed owner leaves both behind and the next run's sweep removes them once the
// recorded pid is dead.

const ORPHAN_GRACE_MS = 60_000;

export function agxTempRoot(): string {
  return (
    process.env.AGX_TMP_ROOT ??
    join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "agx", "tmp")
  );
}

const signalZero = fromThrowable(
  (pid: number) => process.kill(pid, 0),
  (error) => error,
);

const pidAlive = (pid: number): boolean =>
  signalZero(pid).match(
    () => true,
    (error) =>
      z.looseObject({ code: z.literal("EPERM") }).safeParse(error).success,
  );

const removeEntry = (root: string, name: string): void => {
  rmSync(join(root, name), { recursive: true, force: true });
  rmSync(join(root, `${name}.pid`), { force: true });
};

/** Remove run directories whose recorded owner is dead; a directory with no readable pid goes
 *  once it is older than the grace period (the owner may still be writing its pid). */
export function sweepStaleTemps(root: string, self = process.pid): string[] {
  if (!existsSync(root)) return [];
  const removed: string[] = [];
  const names = new Set(
    readdirSync(root).map((name) => name.replace(/\.pid$/u, "")),
  );
  for (const name of names) {
    const pidText = existsSync(join(root, `${name}.pid`))
      ? readFileSync(join(root, `${name}.pid`), "utf8").trim()
      : "";
    const recorded = pidText === "" ? Number.NaN : Number(pidText);
    const stale =
      Number.isInteger(recorded) && recorded > 0
        ? recorded !== self && !pidAlive(recorded)
        : Temporal.Now.instant().epochMilliseconds -
            (statSync(join(root, name), { throwIfNoEntry: false })?.mtimeMs ??
              0) >
          ORPHAN_GRACE_MS;
    if (!stale) continue;
    removeEntry(root, name);
    removed.push(name);
  }
  return removed;
}

export type RunTemp = Readonly<{
  dir: string;
  /** TMPDIR, TMP and TEMP for every process the run starts. */
  env: Readonly<Record<"TMPDIR" | "TMP" | "TEMP", string>>;
  remove: () => void;
}>;

const openDir = fromThrowable(
  (id: string, root: string): RunTemp => {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    sweepStaleTemps(root);
    const dir = join(root, id);
    mkdirSync(dir, { mode: 0o700 });
    writeFileSync(join(root, `${id}.pid`), `${process.pid}\n`);
    return {
      dir,
      env: { TMPDIR: dir, TMP: dir, TEMP: dir },
      remove: () => {
        removeEntry(root, id);
      },
    };
  },
  (error) => `agx: cannot create run temp directory: ${String(error)}`,
);

const resolveReal = fromThrowable(
  (path: string) => realpathSync(path),
  (error) => `agx: cannot resolve temp root: ${String(error)}`,
);

/** Sweep dead owners' leftovers, then create this run's directory. Refuses a directory that
 *  would be the system /tmp itself. */
export function createRunTemp(
  id: string,
  root = agxTempRoot(),
): Result<RunTemp, string> {
  if (id === "" || /[/\\]/u.test(id) || id === "." || id === "..")
    return err(`agx: invalid run id for temp directory: ${id}`);
  const systemTmp = resolveReal("/tmp");
  const resolvedRoot = resolveReal(root).orElse(() => ok(root));
  return Result.combine([systemTmp, resolvedRoot]).andThen(([tmp, real]) =>
    real === tmp
      ? err(
          `agx: refusing to start a worker with TMPDIR=${tmp}; set AGX_TMP_ROOT to a private directory`,
        )
      : openDir(id, root),
  );
}
