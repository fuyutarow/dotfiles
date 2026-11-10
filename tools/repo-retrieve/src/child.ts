// Bounded child-process helpers shared by the router (repo-retrieve.ts) and its ccc index
// adapter (ccc-index.ts). Moved verbatim out of repo-retrieve.ts on 2026-09-22; the timeout
// contract (exit 124 on abort) is part of repo-retrieve's documented exit codes.
import { err, fromThrowable, ok, type Result } from "neverthrow";
import { basename } from "node:path";
import { readonlyCommand } from "@dotfiles/shared/src/readonly-command.ts";

export function requireExecutable(name: string): Result<string, Error> {
  const executable = Bun.which(name);
  if (executable === null || executable === "")
    return err(new Error(`${name} is not available on PATH`));
  return ok(executable);
}

// A child's deadline covers its whole process tree. ccc is a Bun policy wrapper that spawns the
// real Python backend, and Bun's `signal` kills only the direct child: the backend survived the
// SIGTERM, kept the stdout pipe open, and so held rr past its own deadline until it finished
// (observed 2026-11-10: 20 s timeout, 33-41 s wall, complete hits printed, then exit 124).
// The tree is read before the first signal because killing the root reparents its children.
const KILL_GRACE_MS = 1_000;
const DRAIN_GRACE_MS = 500;

async function descendants(root: number): Promise<number[]> {
  const ps = Bun.spawn({
    cmd: ["ps", "-eo", "pid=,ppid="],
    stdout: "pipe",
    stderr: "ignore",
  });
  const [listing, listed] = await Promise.all([
    new Response(ps.stdout).text(),
    ps.exited,
  ]);
  if (listed !== 0) return [];
  const children = new Map<number, number[]>();
  for (const line of listing.split("\n")) {
    const [pid, ppid] = line.trim().split(/\s+/u).map(Number);
    if (pid === undefined || ppid === undefined) continue;
    if (!Number.isInteger(pid) || !Number.isInteger(ppid)) continue;
    children.set(ppid, [...(children.get(ppid) ?? []), pid]);
  }
  const found: number[] = [];
  const queue = [root];
  for (let next = queue.shift(); next !== undefined; next = queue.shift())
    for (const child of children.get(next) ?? []) {
      found.push(child);
      queue.push(child);
    }
  return found.toReversed();
}

function signalPid(pid: number, signal: NodeJS.Signals): void {
  // A pid that is already gone is the goal of the signal; the failure carries no information.
  fromThrowable(() => process.kill(pid, signal))();
}

function pidAlive(pid: number): boolean {
  return fromThrowable(() => process.kill(pid, 0))().isOk();
}

async function terminateTree(root: number): Promise<void> {
  const pids = [...(await descendants(root)), root];
  for (const pid of pids) signalPid(pid, "SIGTERM");
  const giveUpAt = performance.now() + KILL_GRACE_MS;
  let alive = pids.filter((pid) => pidAlive(pid));
  while (alive.length > 0 && performance.now() < giveUpAt) {
    await Bun.sleep(25);
    alive = alive.filter((pid) => pidAlive(pid));
  }
  for (const pid of alive) signalPid(pid, "SIGKILL");
}

// The deadline is "the child had not exited when the timer fired". Deciding it from the child's
// own exit, not from a signal read after draining its pipes, keeps a search that exited 0 in time
// from being reported as a timeout.
function superviseDeadline(
  child: { pid: number },
  timeoutMs: number,
): { settle: () => Promise<boolean> } {
  let timedOut = false;
  let killing: Promise<void> = Promise.resolve();
  const timer = setTimeout(() => {
    timedOut = true;
    killing = terminateTree(child.pid);
  }, timeoutMs);
  return {
    settle: async () => {
      clearTimeout(timer);
      await killing;
      return timedOut;
    },
  };
}

function collect(stream: ReadableStream<Uint8Array>): {
  done: Promise<void>;
  text: () => string;
} {
  const decoder = new TextDecoder();
  const parts: string[] = [];
  const done = (async () => {
    for await (const chunk of stream)
      parts.push(decoder.decode(chunk, { stream: true }));
    parts.push(decoder.decode());
  })();
  return { done, text: () => parts.join("") };
}

export async function runChild(
  command: string[],
  timeoutMs: number,
  cwd = process.cwd(),
): Promise<number> {
  const invocation =
    basename(command[0] ?? "") === "git"
      ? readonlyCommand(command, cwd)
      : { cmd: command, env: process.env };
  const child = Bun.spawn({
    cmd: invocation.cmd,
    cwd,
    env: invocation.env,
    stdout: "inherit",
    stderr: "inherit",
  });
  const deadline = superviseDeadline(child, timeoutMs);
  const exitCode = await child.exited;
  if (await deadline.settle()) {
    process.stderr.write(
      `FATAL: search child timed out after ${timeoutMs}ms: ${command[0]}\n`,
    );
    return 124;
  }
  return exitCode;
}

export async function runChildCaptured(
  command: string[],
  timeoutMs: number,
  relay = true,
  cwd = process.cwd(),
  reportTimeout = true,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}> {
  const invocation =
    basename(command[0] ?? "") === "git"
      ? readonlyCommand(command, cwd, environment)
      : { cmd: command, env: environment };
  const child = Bun.spawn({
    cmd: invocation.cmd,
    cwd,
    env: invocation.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = collect(child.stdout);
  const errors = collect(child.stderr);
  const deadline = superviseDeadline(child, timeoutMs);
  const exitCode = await child.exited;
  const timedOut = await deadline.settle();
  const drained = Promise.all([out.done, errors.done]);
  // After a timeout, a straggler outside the tree may still hold the pipes: keep what arrived.
  if (timedOut) await Promise.race([drained, Bun.sleep(DRAIN_GRACE_MS)]);
  else await drained;
  const stdout = out.text();
  const stderr = errors.text();
  if (relay && stdout !== "") process.stdout.write(stdout);
  if (relay && stderr !== "") process.stderr.write(stderr);
  if (timedOut) {
    if (reportTimeout)
      process.stderr.write(
        `FATAL: search child timed out after ${timeoutMs}ms: ${command[0]}\n`,
      );
    return { exitCode: 124, stdout, stderr, timedOut: true };
  }
  return { exitCode, stdout, stderr, timedOut: false };
}
