// `bun scripts/reclaim-run.ts <name> [--interactive] -- <command...>` — the one entry every
// disk-reclaiming task runs through (mise.toml reclaim:*). Two guarantees the tasks lacked
// (2026-10-06: a second session's reclaim:clean pruned tools this one had just reinstalled, and
// nothing recorded who deleted what — the cause had to be inferred from dangling links):
//
//   ONE AT A TIME   a machine-wide lock ($STATE/lock, agents/hooks/dir-lock.ts). A busy lock is
//                   WAITED for, not refused — `mise run reclaim` starts its dependencies in
//                   parallel, and they must queue, not reject each other — up to
//                   RECLAIM_LOCK_WAIT_S (default 900), printing who holds it; then exit 1 naming
//                   the holder. A dead holder's lock is taken over.
//   A RECEIPT       one JSON line per run in $STATE/log.jsonl: name, command, host, pid, start,
//                   end, exit code, free space before/after; a non-interactive run's whole output
//                   is also kept in $STATE/runs/<start>-<name>.log. --interactive (kondo's
//                   picker, purge's `yes`) keeps the terminal and records the line only.
//
// $STATE = $RECLAIM_STATE_DIR (test seam), else $XDG_STATE_HOME/reclaim, else ~/.local/state/reclaim.
// `mise run reclaim:audit` prints the latest receipts.
// Exit: the command's own exit code · 1 the lock stayed busy, or Cleye refused the argv · 2 usage.

import { appendFileSync, mkdirSync, statfsSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import { cli } from "cleye";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";
import { type Holder, tryAcquire } from "../agents/hooks/dir-lock.ts";
import { z } from "../agents/hooks/zod.ts";

const USAGE =
  "Usage: bun scripts/reclaim-run.ts <name> [--interactive] -- <command...>";

function usage(message: string): never {
  process.stderr.write(`usage: ${message}\n${USAGE}\n`);
  return process.exit(2);
}

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__")
    usage(`unknown flag(s): --${flag}`);
}

const nonEmpty = (s: string | undefined): string | undefined =>
  s === undefined || s === "" ? undefined : s;

/** The reclaim state directory (see header). */
export function stateDir(env: NodeJS.ProcessEnv = process.env): string {
  return (
    nonEmpty(env.RECLAIM_STATE_DIR) ??
    join(
      nonEmpty(env.XDG_STATE_HOME) ?? join(homedir(), ".local/state"),
      "reclaim",
    )
  );
}

export const Receipt = z.object({
  name: z.string(),
  command: z.array(z.string()),
  host: z.string(),
  pid: z.number().int(),
  started: z.string(),
  ended: z.string(),
  exit: z.number().int(),
  free_before: z.number(),
  free_after: z.number(),
  output: z.string().nullable(),
});
export type Receipt = z.output<typeof Receipt>;

/** Bytes free to an unprivileged user on the filesystem holding `path`. */
const freeBytes = (path: string): number => {
  const s = statfsSync(path);
  return s.bavail * s.bsize;
};

const gib = (b: number): string => `${(b / 2 ** 30).toFixed(1)}G`;

async function waitForLock(
  lock: string,
  me: Holder,
  waitS: number,
): Promise<(() => void) | Holder | undefined> {
  const deadline = Temporal.Now.instant().epochMilliseconds + waitS * 1000;
  let told = false;
  for (;;) {
    const got = tryAcquire(lock, me);
    if (got.ok) return got.release;
    if (Temporal.Now.instant().epochMilliseconds >= deadline) return got.holder;
    if (!told) {
      const h = got.holder;
      process.stderr.write(
        `reclaim-run: ${me.what} waits for ${h === undefined ? "a lock being taken" : `${h.what} (pid ${h.pid} on ${h.host}, since ${h.since})`}\n`,
      );
      told = true;
    }
    await Bun.sleep(2000);
  }
}

async function main(): Promise<number> {
  const parsed = cli(
    {
      name: "reclaim-run.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: ["<name>", "--", "<command...>"],
      help: {
        description:
          "Run one disk-reclaiming command under the machine-wide reclaim lock, and record a receipt.",
      },
      flags: {
        interactive: {
          type: Boolean,
          default: false,
          description:
            "keep the terminal (picker / confirmation); record the receipt line only",
        },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  const name = parsed._.name;
  const command = parsed._["--"];
  if (command.length === 0) usage("no command after --");

  const dir = stateDir();
  const started = Temporal.Now.instant().toString({
    fractionalSecondDigits: 0,
  });
  const me: Holder = {
    pid: process.pid,
    host: hostname(),
    what: `reclaim:${name}`,
    since: started,
  };
  const waitS = Number(process.env.RECLAIM_LOCK_WAIT_S ?? "900");
  const lock = await waitForLock(join(dir, "lock"), me, waitS);
  if (typeof lock !== "function") {
    process.stderr.write(
      `reclaim-run: reclaim:${name} not run — the reclaim lock stayed busy for ${waitS}s${lock === undefined ? "" : `, held by ${lock.what} (pid ${lock.pid} on ${lock.host}, since ${lock.since})`}\n`,
    );
    return 1;
  }
  using _lock = { [Symbol.dispose]: lock };

  const home = homedir();
  const before = freeBytes(home);
  const interactive = parsed.flags.interactive;
  mkdirSync(join(dir, "runs"), { recursive: true });
  const outPath = interactive
    ? null
    : join(dir, "runs", `${started.replaceAll(":", "")}-${name}.log`);
  // bounded: the command is the task's own; each carries its own bound or is interactive.
  const proc = Bun.spawn(command, {
    stdin: "inherit",
    stdout: interactive ? "inherit" : "pipe",
    stderr: interactive ? "inherit" : "pipe",
  });
  // Non-interactive output goes to the terminal AND straight into its log, chunk by chunk.
  const log = outPath === null ? undefined : Bun.file(outPath).writer();
  const tee = async (
    stream: ReadableStream<Uint8Array> | undefined,
    to: NodeJS.WriteStream,
  ): Promise<void> => {
    if (stream === undefined || log === undefined) return;
    for await (const chunk of stream) {
      to.write(chunk);
      await log.write(chunk);
    }
  };
  const [, , exit] = await Promise.all([
    tee(interactive ? undefined : proc.stdout, process.stdout),
    tee(interactive ? undefined : proc.stderr, process.stderr),
    proc.exited,
  ]);
  await log?.end();
  const after = freeBytes(home);

  const receipt: Receipt = {
    name,
    command,
    host: me.host,
    pid: me.pid,
    started,
    ended: Temporal.Now.instant().toString({ fractionalSecondDigits: 0 }),
    exit,
    free_before: before,
    free_after: after,
    output: outPath,
  };
  appendFileSync(join(dir, "log.jsonl"), `${JSON.stringify(receipt)}\n`);
  process.stderr.write(
    `reclaim-run: reclaim:${name} exit ${exit} · free ${gib(before)} → ${gib(after)} · receipt ${join(dir, "log.jsonl")}\n`,
  );
  return exit;
}

if (import.meta.main) {
  const r = await attempt(main);
  if (!r.ok) process.stderr.write(`FATAL: ${errorMessage(r.error)}\n`);
  process.exit(r.ok ? r.value : 2);
}
