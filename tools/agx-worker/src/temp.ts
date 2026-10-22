import {
  existsSync,
  chmodSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  lstatSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "../../shared/src/zod.ts";
import { err, fromThrowable, ok, Result } from "neverthrow";

// Every agx worker run owns one directory under the temp root, named by its run id, with a sibling
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

const makeDirectoriesWritable = (path: string): Result<void, unknown> => {
  const stat = fromThrowable(
    () => lstatSync(path, { throwIfNoEntry: false }),
    (error) => error,
  )();
  return stat.andThen((entry) => {
    if (entry === undefined || !entry.isDirectory()) return ok();
    const chmod = fromThrowable(
      () => {
        chmodSync(path, entry.mode | 0o700);
      },
      (error) => error,
    )();
    if (chmod.isErr()) return chmod;
    const children = fromThrowable(
      () => readdirSync(path),
      (error) => error,
    )();
    return children.andThen((names) =>
      names.reduce<Result<void, unknown>>(
        (result, child) =>
          result.andThen(() => makeDirectoriesWritable(join(path, child))),
        ok(),
      ),
    );
  });
};

const removeEntry = (root: string, name: string): Result<void, unknown> => {
  const path = join(root, name);
  return makeDirectoriesWritable(path).andThen(() =>
    fromThrowable(
      () => {
        rmSync(path, { recursive: true, force: true });
        rmSync(join(root, `${name}.pid`), { force: true });
      },
      (error) => error,
    )(),
  );
};

const entryIsStale = fromThrowable(
  (root: string, name: string, self: number): boolean => {
    const pidText = existsSync(join(root, `${name}.pid`))
      ? readFileSync(join(root, `${name}.pid`), "utf8").trim()
      : "";
    const recorded = pidText === "" ? Number.NaN : Number(pidText);
    return Number.isInteger(recorded) && recorded > 0
      ? recorded !== self && !pidAlive(recorded)
      : Temporal.Now.instant().epochMilliseconds -
          (statSync(join(root, name), { throwIfNoEntry: false })?.mtimeMs ??
            0) >
          ORPHAN_GRACE_MS;
  },
  (error) => error,
);

const removalWarning = (path: string, error: unknown): void => {
  const code = z.looseObject({ code: z.string() }).safeParse(error);
  process.stderr.write(
    `WARN agx temp cleanup failed for ${path} (${code.success ? code.data.code : "UNKNOWN"}): ${String(error)}\n`,
  );
};

/** Remove run directories whose recorded owner is dead; a directory with no readable pid goes
 *  once it is older than the grace period (the owner may still be writing its pid). */
export function sweepStaleTemps(
  root: string,
  self = process.pid,
  remove: (root: string, name: string) => Result<void, unknown> = removeEntry,
): string[] {
  if (!existsSync(root)) return [];
  const removed: string[] = [];
  const names = new Set(
    readdirSync(root).map((name) => name.replace(/\.pid$/u, "")),
  );
  for (const name of names) {
    const path = join(root, name);
    entryIsStale(root, name, self).match(
      (stale) => {
        if (!stale) return;
        remove(root, name).match(
          () => {
            removed.push(name);
          },
          (error) => {
            removalWarning(path, error);
          },
        );
      },
      (error) => {
        removalWarning(path, error);
      },
    );
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
        removeEntry(root, id).match(
          () => {},
          (error) => {
            removalWarning(dir, error);
          },
        );
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
