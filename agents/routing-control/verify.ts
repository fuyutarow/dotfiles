// Runs a ticket's verify commands for agent-router, after the worker has exited. Consumers:
// agent-router run. A worker cannot hold a long verification (its foreground call is capped, and a
// backgrounded test dies with the worker), so the router runs them: in order, `sh -c`, stdin closed,
// stderr folded into stdout, under ONE shared time bound.

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
const BACKSTOP_MS = 5000;

const tenths = (ms: number): number => Math.round(ms / 100) / 10;

async function runOne(
  cmd: string,
  cwd: string,
  boundMs: number,
): Promise<VerifyResult> {
  const t0 = performance.now();
  const child = Bun.spawn(["sh", "-c", `exec 2>&1\n${cmd}`], {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
    // backstop only: the timer below also kills the shell's children, which this option does not
    timeout: Math.ceil(boundMs + BACKSTOP_MS),
    killSignal: "SIGKILL",
  });
  let tail = "";
  const decoder = new TextDecoder();
  const drained = (async () => {
    for await (const chunk of child.stdout)
      tail = (tail + decoder.decode(chunk, { stream: true })).slice(
        -TAIL_CHARS,
      );
  })();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    Bun.spawnSync(["pkill", "-KILL", "-P", String(child.pid)], {
      stdout: "ignore",
      stderr: "ignore",
      timeout: 5_000,
    });
    child.kill("SIGKILL");
  }, boundMs);
  const code = await child.exited;
  clearTimeout(timer);
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
): Promise<VerifyResult[]> {
  const deadline = performance.now() + timeoutS * 1000;
  const results: VerifyResult[] = [];
  for (const cmd of cmds) {
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
