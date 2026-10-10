// Runs a ticket's verify commands for agx, after the worker has exited. Consumers:
// agx dispatch. A worker cannot hold a long verification (its foreground call is capped, and a
// backgrounded test dies with the worker), so the router runs them: in order, `sh -c`, stdin closed,
// stderr folded into stdout, under ONE shared time bound.

import { attempt } from "../../shared/src/attempt.ts";

export interface VerifyResult {
  cmd: string;
  exit: number;
  elapsed_s: number;
  timed_out: boolean;
  output_tail: string;
}

const TAIL_CHARS = 4000;
const TIMEOUT_EXIT = 124; // as timeout(1): killed at its bound, or never run for lack of time
const DRAIN_GRACE_MS = 1000; // an orphaned grandchild may hold the pipe open past the shell's exit

// Process groups of the verify commands running now, so a stopped router can kill them: each is its
// own group (below), so killing the router's own group does not reach them.
const running = new Set<number>();

/** SIGKILL every verify group that is running now; synchronous, for a signal handler. */
export function killRunningVerify(): void {
  for (const pid of running) void attempt(() => process.kill(-pid, "SIGKILL"));
  running.clear();
}

const tenths = (ms: number): number => Math.round(ms / 100) / 10;

async function runOne(
  cmd: string,
  cwd: string,
  boundMs: number,
): Promise<VerifyResult> {
  const t0 = performance.now();
  // Native timer (AbortSignal.timeout) for the bound; the shell runs in its OWN process group
  // (`detached` = setsid, pgid = pid) so the abort handler can kill the whole group: the native
  // kill reaches only the shell itself, and a test runner's servers and workers are grandchildren.
  const bound = AbortSignal.timeout(Math.ceil(boundMs));
  const child = Bun.spawn(["sh", "-c", `exec 2>&1\n${cmd}`], {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
    detached: true,
    signal: bound,
    killSignal: "SIGKILL",
  });
  running.add(child.pid);
  let tail = "";
  const decoder = new TextDecoder();
  const drained = (async () => {
    for await (const chunk of child.stdout)
      tail = (tail + decoder.decode(chunk, { stream: true })).slice(
        -TAIL_CHARS,
      );
  })();
  let timedOut = false;
  const killGroup = (): void => {
    timedOut = true;
    // Promise.try runs the kill synchronously; an already-gone group is the only throw
    void attempt(() => process.kill(-child.pid, "SIGKILL"));
  };
  bound.addEventListener("abort", killGroup, { once: true });
  const code = await child.exited;
  running.delete(child.pid);
  // after the shell is gone its pgid may be reused: never signal a group on a late abort
  bound.removeEventListener("abort", killGroup);
  await Promise.race([drained, Bun.sleep(DRAIN_GRACE_MS)]);
  return {
    cmd,
    exit: timedOut ? TIMEOUT_EXIT : code,
    elapsed_s: tenths(performance.now() - t0),
    timed_out: timedOut,
    output_tail: tail,
  };
}

/** Each command in order, in `cwd`; the remaining share of `timeoutS` bounds each one. A command
 *  that gets no time is recorded as timed out, never silently dropped. */
export async function runVerify(
  cmds: string[],
  cwd: string,
  timeoutS: number,
  onPhase?: (phase: string) => void,
): Promise<VerifyResult[]> {
  const deadline = performance.now() + timeoutS * 1000;
  const results: VerifyResult[] = [];
  for (const [index, cmd] of cmds.entries()) {
    const label = cmd.trim().replaceAll(/\s+/gu, " ");
    const shortLabel = label.length > 72 ? `${label.slice(0, 71)}…` : label;
    onPhase?.(`verifying ${index + 1}/${cmds.length} ${shortLabel}`);
    const remaining = deadline - performance.now();
    results.push(
      remaining <= 0
        ? {
            cmd,
            exit: TIMEOUT_EXIT,
            elapsed_s: 0,
            timed_out: true,
            output_tail: "not run: verify_timeout_s was already used up",
          }
        : await runOne(cmd, cwd, remaining),
    );
  }
  return results;
}

const failed = (r: VerifyResult): boolean => r.exit !== 0 || r.timed_out;

/** "3/3 passed", "1 failed: <cmd>", "2 failed: <cmd>; <cmd>". */
export function verifySummary(results: VerifyResult[]): string {
  if (results.length === 0) return "no verify commands";
  const bad = results.filter((r) => failed(r));
  return bad.length === 0
    ? `${results.length}/${results.length} passed`
    : `${bad.length} failed: ${bad.map((r) => r.cmd).join("; ")}`;
}

const EVIDENCE_CHARS = 4500; // inside the room the grade request leaves for evidence

/** What Jev reads: the summary first, then each command with the end of its output. */
export function verifyEvidence(results: VerifyResult[]): string {
  const share = Math.max(
    400,
    Math.floor(EVIDENCE_CHARS / Math.max(1, results.length)),
  );
  return [
    `verify, run by the router after the worker exited: ${verifySummary(results)}`,
    ...results.map(
      (r) =>
        `$ ${r.cmd}\nexit=${r.exit} elapsed=${r.elapsed_s}s timed_out=${r.timed_out}\n${r.output_tail.slice(-share)}`,
    ),
  ].join("\n\n");
}
