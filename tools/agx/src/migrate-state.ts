// Consumer: the owner invoking mise run agx:migrate-state (verdict lines).
// This is the only reader of the previous state directory; runtime has no fallback.
import { existsSync, readFileSync, readdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { cli } from "cleye";
import { attempt, errorMessage } from "../../shared/src/attempt.ts";
import { jsonOf, z } from "../../shared/src/zod.ts";

const Marker = z.looseObject({
  run_id: z.string().min(1),
  pid: z.number().int().positive(),
});

async function liveRunId(
  path: string,
): Promise<{ id?: string; refusal?: string }> {
  const marker = jsonOf(Marker).safeParse(readFileSync(path, "utf8"));
  if (!marker.success)
    return { refusal: `REFUSED: unreadable run marker ${path}` };
  const status = await attempt(() => process.kill(marker.data.pid, 0));
  // EPERM also means a live process: lack of permission must not permit moving its state.
  const denied =
    !status.ok &&
    z.looseObject({ code: z.literal("EPERM") }).safeParse(status.error).success;
  return status.ok || denied ? { id: marker.data.run_id } : {};
}

async function liveRuns(
  active: string,
): Promise<{ ids: string[]; refusal?: string }> {
  const ids: string[] = [];
  if (!existsSync(active)) return { ids };
  const markers = readdirSync(active)
    .filter(
      (file) => file.endsWith(".json") && !file.endsWith(".progress.json"),
    )
    .toSorted();
  for (const file of markers) {
    const run = await liveRunId(join(active, file));
    if (run.refusal !== undefined) return { ids, refusal: run.refusal };
    if (run.id !== undefined) ids.push(run.id);
  }
  return { ids };
}

export async function migrateState(base: string): Promise<string> {
  const previous = join(base, ["agent", "router"].join("-"));
  const current = join(base, "agx");
  if (existsSync(previous) && existsSync(current))
    return `REFUSED: both ${previous} and ${current} exist; reconcile them before migrating`;
  if (!existsSync(previous)) return `OK: nothing to move from ${previous}`;
  const live = await liveRuns(join(previous, "active"));
  if (live.refusal !== undefined) return live.refusal;
  if (live.ids.length > 0)
    return `REFUSED: live run ids: ${live.ids.join(", ")}; leave ${previous} in place until they exit`;
  renameSync(previous, current);
  return `OK: moved ${previous} -> ${current}`;
}

const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`FATAL: unknown option '--${flag}'\n`);
    process.exit(2);
  }
};

async function main(): Promise<void> {
  const argv = cli({
    name: basename(import.meta.path),
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    parameters: [],
    help: {
      description:
        "Move the previous dispatch state into agx once, refusing live workers or two directories.",
    },
  });
  if (argv._.length > 0) {
    process.stderr.write(`FATAL: unexpected argument: ${String(argv._[0])}\n`);
    process.exit(2);
  }
  const text = await migrateState(
    process.env.XDG_STATE_HOME ?? join(homedir(), ".local/state"),
  );
  process.stdout.write(`${text}\n`);
  process.exitCode = text.startsWith("REFUSED:") ? 1 : 0;
}

if (import.meta.main)
  await main().catch((error: unknown) => {
    process.stderr.write(`FATAL: ${errorMessage(error)}\n`);
    process.exitCode = 2;
  });
