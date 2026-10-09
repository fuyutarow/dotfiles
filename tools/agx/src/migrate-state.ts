// Consumer: the owner invoking mise run agx:migrate-state (verdict lines).
// This is the only reader of the previous state directory; runtime has no fallback.
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, sep } from "node:path";
import { cli } from "cleye";
import { attempt, errorMessage } from "../../shared/src/attempt.ts";
import { jsonOf, z } from "../../shared/src/zod.ts";

const Marker = z.looseObject({
  run_id: z.string().min(1),
  pid: z.number().int().positive(),
});
const LogRow = z.looseObject({ run_id: z.string().optional() });
const Timestamp = z.union([z.string(), z.number()]);
const TIMESTAMP_KEYS = ["timestamp", "at", "started_at", "created_at", "ts"];
const WAIT_MAX_SECONDS = 4 * 60 * 60;
const POLL_MS = 30_000;

export type MigrationOptions = {
  wait?: boolean;
  waitMaxSeconds?: number;
  report?: (text: string) => void;
  // Test seams exercise the real transaction and polling without a 30-second fixture.
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  beforeRename?: (destination: string, temporary: string) => Promise<void>;
};

type Live = { ids: string[]; names: string[]; refusal?: string };

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

async function liveRuns(active: string): Promise<Live> {
  const ids: string[] = [];
  const names: string[] = [];
  if (!existsSync(active)) return { ids, names };
  const markers = readdirSync(active)
    .filter(
      (file) => file.endsWith(".json") && !file.endsWith(".progress.json"),
    )
    .toSorted();
  for (const file of markers) {
    const run = await liveRunId(join(active, file));
    if (run.refusal !== undefined) return { ids, names, refusal: run.refusal };
    if (run.id === undefined) continue;
    ids.push(run.id);
    names.push(file.slice(0, -".json".length));
  }
  return { ids, names };
}

function rowRunId(line: string): string | undefined {
  const parsed = jsonOf(LogRow).safeParse(line);
  return parsed.success ? parsed.data.run_id : undefined;
}

function ownedByLiveRun(path: string, content: Buffer, live: Live): boolean {
  const names = [...live.ids, ...live.names];
  const named = path
    .split(sep)
    .some((part) =>
      names.some((id) => part === id || part.startsWith(`${id}.`)),
    );
  if (named) return true;
  const id = rowRunId(content.toString("utf8"));
  return id !== undefined && live.ids.includes(id);
}

async function timestamp(line: string): Promise<number | null> {
  const parsed = jsonOf(z.record(z.string(), z.unknown())).safeParse(line);
  if (!parsed.success) return null;
  const value = TIMESTAMP_KEYS.map((key) =>
    Timestamp.safeParse(parsed.data[key]),
  ).find((field) => field.success);
  if (value === undefined || !value.success) return null;
  if (typeof value.data === "number") return value.data;
  const input = value.data;
  const instant = await attempt(
    () => Temporal.Instant.from(input).epochMilliseconds,
  );
  return instant.ok ? instant.value : null;
}

async function mergeLines(
  current: string,
  previous: string,
  live: Live,
): Promise<string> {
  const lines = [
    ...current.split("\n"),
    ...previous.split("\n").filter((line) => {
      const id = rowRunId(line);
      return id === undefined || !live.ids.includes(id);
    }),
  ];
  const unique = [...new Set(lines.filter((line) => line !== ""))];
  const rows = await Promise.all(
    unique.map(async (line) => ({ line, at: await timestamp(line) })),
  );
  // Untimestamped lines keep their slots; dated lines are sorted stably within dated slots.
  const dated = rows
    .filter((row) => row.at !== null)
    .toSorted((a, b) => (a.at ?? 0) - (b.at ?? 0));
  let index = 0;
  const ordered = rows.map((row) =>
    row.at === null ? row.line : (dated[index++]?.line ?? row.line),
  );
  return ordered.length === 0 ? "" : `${ordered.join("\n")}\n`;
}

async function atomicWrite(
  path: string,
  content: Buffer | string,
  options: MigrationOptions,
): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  // A deterministic sibling is overwritten on retry. The source stays intact until rename succeeds.
  const temporary = `${path}.agx-migrate.tmp`;
  writeFileSync(temporary, content);
  await options.beforeRename?.(path, temporary);
  renameSync(temporary, path);
}

function filesIn(directory: string, prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = join(prefix, entry.name);
      return entry.isDirectory()
        ? filesIn(join(directory, entry.name), path)
        : [path];
    });
}

function removeEmptyDirectories(path: string): void {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory()) removeEmptyDirectories(join(path, entry.name));
  }
  if (readdirSync(path).length === 0) rmdirSync(path);
}

async function mergeFile(
  previous: string,
  current: string,
  path: string,
  live: Live,
  options: MigrationOptions,
): Promise<string | null> {
  const source = join(previous, path);
  const destination = join(current, path);
  if (!lstatSync(source).isFile())
    return `REFUSED: unsupported state file ${source}`;
  const content = readFileSync(source);
  if (ownedByLiveRun(path, content, live)) return null;
  if (existsSync(destination) && !lstatSync(destination).isFile())
    return `REFUSED: conflicting state file ${destination}`;
  const existing = existsSync(destination)
    ? readFileSync(destination)
    : undefined;
  if (path.endsWith(".jsonl")) {
    const merged = await mergeLines(
      existing?.toString("utf8") ?? "",
      content.toString("utf8"),
      live,
    );
    if (existing === undefined || existing.toString("utf8") !== merged)
      await atomicWrite(destination, merged, options);
    // Live writers may append to any shared log. Never rewrite or unlink that source log.
    if (live.ids.length === 0) unlinkSync(source);
    return null;
  }
  if (existing !== undefined && !existing.equals(content))
    return `REFUSED: conflicting state file ${destination}`;
  if (existing === undefined) await atomicWrite(destination, content, options);
  unlinkSync(source);
  return null;
}

async function migrate(
  base: string,
  options: MigrationOptions,
): Promise<string> {
  const previous = join(base, ["agent", "router"].join("-"));
  const current = join(base, "agx");
  if (!existsSync(previous)) return `OK: nothing to do (${previous} is absent)`;
  const maxSeconds = options.waitMaxSeconds ?? WAIT_MAX_SECONDS;
  if (!Number.isFinite(maxSeconds) || maxSeconds < 0)
    return "REFUSED: --wait-max must be a finite, nonnegative number of seconds";
  const now = options.now ?? (() => performance.now());
  const sleep = options.sleep ?? ((ms: number) => Bun.sleep(ms));
  const deadline = now() + maxSeconds * 1000;
  let live = await liveRuns(join(previous, "active"));
  if (live.refusal !== undefined) return live.refusal;
  while (options.wait === true && live.ids.length > 0 && now() < deadline) {
    options.report?.(`WAIT: live run ids: ${live.ids.join(", ")}`);
    await sleep(Math.min(POLL_MS, Math.max(0, deadline - now())));
    live = await liveRuns(join(previous, "active"));
    if (live.refusal !== undefined) return live.refusal;
  }
  for (const path of filesIn(previous)) {
    const error = await mergeFile(previous, current, path, live, options);
    if (error !== null) return error;
  }
  // Even an empty source directory is retained while a live worker owns it.
  if (live.ids.length > 0) {
    const left = filesIn(previous);
    const remaining =
      left.length === 0 ? "live state directory" : left.join(", ");
    return `PARTIAL: live run ids: ${live.ids.join(", ")}; left in ${previous}: ${remaining}; rerun later`;
  }
  removeEmptyDirectories(previous);
  return `OK: merged ${previous} -> ${current}`;
}

export async function migrateState(
  base: string,
  options: MigrationOptions = {},
): Promise<string> {
  const result = await attempt(() => migrate(base, options));
  return result.ok
    ? result.value
    : `REFUSED: migration failed: ${errorMessage(result.error)}`;
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
    flags: {
      wait: {
        type: Boolean,
        description: "Poll live runs every 30 seconds before merging",
      },
      waitMax: {
        type: Number,
        default: WAIT_MAX_SECONDS,
        description: "Maximum wait in seconds (default: 4 hours)",
      },
    },
    help: {
      description:
        "Merge previous dispatch state into agx; leave live runs in place (exit 3).",
    },
  });
  if (argv._.length > 0) {
    process.stderr.write(`FATAL: unexpected argument: ${String(argv._[0])}\n`);
    process.exit(2);
  }
  const text = await migrateState(
    process.env.XDG_STATE_HOME ?? join(homedir(), ".local/state"),
    {
      wait: argv.flags.wait === true,
      waitMaxSeconds: argv.flags.waitMax,
      report: (message) => {
        process.stdout.write(`${message}\n`);
      },
    },
  );
  process.stdout.write(`${text}\n`);
  if (text.startsWith("PARTIAL:")) process.exitCode = 3;
  else process.exitCode = text.startsWith("REFUSED:") ? 1 : 0;
}

if (import.meta.main)
  await main().catch((error: unknown) => {
    process.stderr.write(`FATAL: ${errorMessage(error)}\n`);
    process.exitCode = 2;
  });
