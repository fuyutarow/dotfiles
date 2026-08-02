/**
 * captive-probe — the U3 (DELEGABILITY) mechanical floor, COMMAND REGIME ONLY.
 *
 * Consumer: agent/human — verdict lines on stdout (`FAIL <code>: …` / `WARN <code>: …` /
 * `OK …`). `--json` switches stdout to the single-line machine envelope instead. stderr carries
 * FATAL diagnostics only. Run: `bun scripts/captive-probe.ts [flags] -- <command> [args...]`.
 *
 * THIS IS NOT A SEMANTIC CHECK. It runs one command with no controlling terminal and no stdin,
 * and reports the mechanical symptoms of a captive surface. It cannot tell you whether the
 * interactivity IS the deliverable (the legitimacy carve-out — references/delegability.md §3),
 * whether the machine output is well-shaped, whether errors teach the next call, or anything at
 * all about a GUI, touch, voice, or physical surface. A clean run means "not captive in the ways
 * a probe can see," never "delegable."
 *
 * It also cannot check the rules that need a second invocation to compare against: whether every
 * promptable value has a flag, whether --json is stable across releases, whether exit codes
 * distinguish failure classes. Those stay with the U3 delegation table.
 *
 * Seams: Bun script craft — Cleye (pinned in the repo lockfile, BG3 graduation), no shebang,
 * main().catch, exit 0/1/2, AbortSignal timeout read off the SIGNAL, one Promise.all drain,
 * bounded relay — is owned by the writing-bun-scripts skill (BG1/BG2/BG3). The rules being probed
 * are owned by references/delegability.md §4. Change either there, not here.
 *
 * Exit: 0 clean · 1 findings · 2 environment-FATAL.
 */
import { cli } from "cleye";

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new Error(`unknown flag(s): --${flag}`);
  }
}

type Finding = { level: "FAIL" | "WARN"; code: string; detail: string };

const USAGE =
  "usage: bun captive-probe.ts [--timeout MS] [--expect-fail] [--json] -- <command> [args...]\n";
const RELAY_CAP = 64_000;
const DETAIL_CAP = 80;

// A prompt this process can never answer, because it gave the child no stdin and no terminal.
const PROMPT =
  /\[y\/n\]|\(y\/n\)|\[Y\/n\]|\[y\/N\]|\(yes\/no\)|press any key|press enter|continue\?|are you sure|overwrite\?|^\s*\?\s+\S/im;
const ANSI_ESCAPE = new RegExp(
  `${String.fromCharCode(0x1b)}\\[[0-9;]*[A-Za-z]`,
);

function inspect(
  stdout: string,
  stderr: string,
  exitCode: number | null,
  timedOut: boolean,
  timeout: number,
  expectFail: boolean,
): Finding[] {
  const findings: Finding[] = [];

  // F1 HANG — the load-bearing check. The timeout is read off the SIGNAL, never off
  // proc.killed or proc.signalCode: those cannot separate our own timeout from an external
  // kill (writing-bun-scripts BG2, measured).
  if (timedOut) {
    findings.push({
      level: "FAIL",
      code: "HANG",
      detail: `did not exit within ${timeout}ms with stdin closed and no TTY — a driver that is not a human at a keyboard blocks here forever`,
    });
  }

  // F2 PROMPT-WITHOUT-TTY — asked a question it could never receive an answer to.
  for (const [stream, text] of [
    ["stdout", stdout],
    ["stderr", stderr],
  ] as const) {
    const match = PROMPT.exec(text);
    if (match !== null) {
      findings.push({
        level: "FAIL",
        code: "PROMPT-WITHOUT-TTY",
        detail: `${stream} contains a prompt with no TTY to answer it: ${JSON.stringify(match[0].trim().slice(0, DETAIL_CAP))} — every promptable value needs a flag (delegability.md §4)`,
      });
    }
  }

  // F3 ANSI-TO-PIPE — decorated output for a terminal that is not there.
  if (ANSI_ESCAPE.test(stdout)) {
    findings.push({
      level: "WARN",
      code: "ANSI-TO-PIPE",
      detail:
        "stdout carries ANSI escapes though it is a pipe — gate colour on isatty(stdout) and honour NO_COLOR",
    });
  }

  // F4 CR-FLOOD — a spinner or progress bar rendering into a captured transcript.
  const carriageReturns = (stdout.match(/\r/g) ?? []).length;
  if (carriageReturns > 5) {
    findings.push({
      level: "WARN",
      code: "CR-FLOOD",
      detail: `${carriageReturns} carriage returns on stdout — an animated indicator is being written to a non-TTY`,
    });
  }

  // F5 SILENT-FAILURE — only checkable when the caller declares the expected outcome.
  if (expectFail && exitCode === 0) {
    findings.push({
      level: "FAIL",
      code: "SILENT-FAILURE",
      detail:
        "exited 0 on an invocation the caller declared should fail — exit code is the only failure signal a non-human driver has",
    });
  }

  // F6 ERROR-ON-STDOUT — diagnostics on the payload channel. Weak, but real.
  if (
    exitCode !== null &&
    exitCode !== 0 &&
    stdout.trim() !== "" &&
    stderr.trim() === ""
  ) {
    findings.push({
      level: "WARN",
      code: "ERROR-ON-STDOUT",
      detail:
        "failed with output on stdout and nothing on stderr — diagnostics belong on stderr so a piped consumer gets clean payload",
    });
  }

  return findings;
}

async function main(): Promise<void> {
  // Cleye stops parsing at `--` and maps the remainder to the spread positional, so the probed
  // command's own flags reach it untouched and never register as unknown.
  //
  // One runtime quirk has to be absorbed first: bun 1.3.14 CONSUMES a `--` that sits directly
  // after the script path, but leaves it alone anywhere later. So `probe.ts -- cmd` arrives as
  // `["cmd"]` while `probe.ts --json -- cmd` arrives with the separator intact. This script takes
  // no positionals of its own, so a first token that is not a flag can only be the start of the
  // probed command — re-insert the separator the caller actually typed. A probed command whose
  // own name begins with `-` needs an explicit `-- --` and is rejected with a usage message
  // otherwise. Measured against bun 1.3.14 / Cleye 2.6.0, 2026-08-02.
  const raw = Bun.argv.slice(2);
  const argv =
    raw.length > 0 && !raw[0]?.startsWith("-") ? ["--", ...raw] : raw;

  const parsed = cli(
    {
      name: "captive-probe.ts",
      parameters: ["[command...]"],
      flags: { timeout: Number, expectFail: Boolean, json: Boolean },
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    argv,
  );

  const command = parsed._.command;
  if (command.length === 0) {
    process.stderr.write(
      `${parsed._.length > 0 ? "the probed command must follow `--`, so its own flags reach it untouched\n" : ""}${USAGE}`,
    );
    process.exitCode = 2;
    return;
  }

  // A malformed Number coerces to null rather than throwing, so the check is not optional.
  const timeout = parsed.flags.timeout ?? 10_000;
  if (timeout === null || !Number.isFinite(timeout) || timeout <= 0) {
    process.stderr.write(
      `--timeout must be a positive integer (got ${timeout})\n${USAGE}`,
    );
    process.exitCode = 2;
    return;
  }

  if (Bun.which(command[0] ?? "") === null && !command[0]?.includes("/")) {
    process.stderr.write(`FATAL: command not found on PATH: ${command[0]}\n`);
    process.exitCode = 2;
    return;
  }

  // The probe's whole premise: no TTY, no stdin, and none of the environment hints that make a
  // well-behaved tool degrade to non-interactive on its own. If it still needs a human, it will
  // hang, prompt, or decorate for a terminal that is not there.
  const signal = AbortSignal.timeout(timeout);
  const child = Bun.spawn({
    cmd: command,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    signal,
    killSignal: "SIGKILL",
    env: { ...process.env, TERM: "dumb", CI: "" },
  });

  // ONE Promise.all over both pipes and exited — draining sequentially deadlocks on whichever
  // pipe is not being read, and the only symptom is our own timeout (BG2).
  const [stdoutRaw, stderrRaw] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  const stdout = stdoutRaw.slice(0, RELAY_CAP);
  const stderr = stderrRaw.slice(0, RELAY_CAP);
  const timedOut = signal.aborted;
  const exitCode = timedOut ? null : child.exitCode;

  const findings = inspect(
    stdout,
    stderr,
    exitCode,
    timedOut,
    timeout,
    parsed.flags.expectFail ?? false,
  );

  if (parsed.flags.json ?? false) {
    process.stdout.write(
      `${JSON.stringify({ status: findings.some((f) => f.level === "FAIL") ? "fail" : findings.length > 0 ? "warn" : "ok", command, exit_code: exitCode, timed_out: timedOut, findings })}\n`,
    );
  } else {
    for (const finding of findings) {
      process.stdout.write(
        `${finding.level} ${finding.code}: ${finding.detail}\n`,
      );
    }
    if (findings.length === 0) {
      process.stdout.write(
        `OK ${command[0]} — exit ${exitCode}, no captive symptoms visible to a probe (NOT a delegability verdict)\n`,
      );
    }
  }

  process.exitCode = findings.some((finding) => finding.level === "FAIL")
    ? 1
    : 0;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`FATAL: ${message}\n`);
  process.exit(2);
});

export { inspect };
