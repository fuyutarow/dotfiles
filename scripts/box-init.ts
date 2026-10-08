// `mise run box:init -- <alias> [--root-host H --root-port P] [--gh] [--repo owner/name …]` — from the
// Mac: take a rented box that is renting-done (Vast instance created, ssh answering) to "experiments
// can resume". Until 2026-10-08 that was ~8 hand-run steps per rental; the human ruled it routine.
//   reach    ssh <alias> true; else (with --root-host/--root-port) the dotfiles bootstrap as root
//   gh       (--gh) copy this Mac's gh login to the box over ssh stdin — the token is never printed
//   per repo clone → mise trust + install → jj (setup:jj, else `jj git init --colocate`) → setup
//   doctor   per repo `mise run doctor` where the repo has it, then `mise run doctor:remote`
// Renting (offer, price cap, tier) is NOT here — it stays a judgment (skill renting-cloud-gpus).
// Every step is idempotent: a PROBE that already holds makes it a fast PASS no-op. Slow steps log on
// the box (~/.cache/box-init/<step>.log) and name the log on failure. A timeout kills the local ssh and
// the box-side `timeout` the script wraps around the work.
// Consumer: a human or agent reading verdict lines. Exit: 0 no FAIL · 1 a FAIL · 2 usage/FATAL.

import { join } from "node:path";
import { cli } from "cleye";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";

type Verdict = "PASS" | "FAIL" | "WARN" | "SKIP";

/** A command run on this machine; `stdinFrom` is another local command whose stdout feeds stdin. */
export type Cmd = { argv: string[]; stdinFrom?: string[] };

export type Step = {
  /** Verdict-line name, e.g. `clone firedancer`. */
  name: string;
  /** Steps sharing a group stop at the group's first FAIL; "" = the box itself (a FAIL stops all). */
  group: string;
  /** Exit 0 means the step already holds: PASS without acting. */
  probe?: Cmd;
  act?: Cmd;
  /** What a PASS says when `act` ran. */
  done: string;
  timeoutMs: number;
  /** Box-side log the act writes (named on failure). */
  log?: string;
  /** Verdict-line text is the last line of the act's output matching this. */
  surface?: RegExp;
  /**
   * Sub-check names whose FAIL is a human step (a browser login), not a defect of the box: when they
   * are the ONLY FAILs in the act's output, the step is a WARN naming them.
   */
  humanOnly?: string[];
  /** The repair a FAIL names. */
  fix?: string;
  /** A failed act is a warning when the step is allowed to fail softly. */
  softFail?: boolean;
};

export type Opts = {
  alias: string;
  rootHost?: string;
  rootPort?: string;
  gh: boolean;
  repos: string[];
  error?: never;
};

const MIN = 60_000;
const SSH = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15"] as const;
const BOOTSTRAP_URL =
  "https://raw.githubusercontent.com/fuyutarow/dotfiles/alpha/scripts/bootstrap-linux.sh";
const LOG_DIR = "$HOME/.cache/box-init";
const ALIAS_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const REPO_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const HOST_RE = /^[A-Za-z0-9][A-Za-z0-9.:_-]*$/u;
const DOCTOR_REMOTE = join(import.meta.dir, "doctor-remote.ts");

/** POSIX single-quote for the box's shell. */
export const sq = (s: string): string => `'${s.replaceAll("'", `'\\''`)}'`;

/** `ssh <alias> <script>` — the box's login shell (zsh) runs it, so the script is POSIX-only. */
const onBox = (alias: string, script: string): Cmd => ({
  argv: [...SSH, alias, script],
});

/**
 * The work of one slow step: run under a box-side `timeout` in `sh`, output to
 * ~/.cache/box-init/<log>.log, status passed through. `tail` then lets the line we surface survive.
 */
export function logged(
  log: string,
  script: string,
  timeoutMs: number,
  tail = "",
): string {
  const secs = Math.ceil(timeoutMs / 1000) - 5;
  const file = `${LOG_DIR}/${log}.log`;
  return (
    `mkdir -p ${LOG_DIR}; timeout -k 10 ${secs} sh -c ${sq(script)} > "${file}" 2>&1; rc=$?; ` +
    `${tail}exit $rc`
  );
}

const hasTask = (task: string): string =>
  `mise tasks info ${task} > /dev/null 2>&1`;

// Cleye 2.6.0's strictFlags misses prototype-sensitive names before assignment (BG1).
function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (
    type === "unknown-flag" &&
    (flag === "__proto__" || flag === "constructor")
  ) {
    process.stderr.write(`unknown flag(s): --${flag}\n`);
    process.exit(2);
  }
}

/** The ordered steps for `opts` — pure, no ssh: the unit under test. */
export function buildPlan(o: Opts): Step[] {
  const { alias } = o;
  const plan: Step[] = [];
  const bootstrap: Cmd | undefined =
    o.rootHost !== undefined && o.rootPort !== undefined
      ? {
          argv: [
            "ssh",
            "-p",
            o.rootPort,
            "-o",
            "StrictHostKeyChecking=accept-new",
            `root@${o.rootHost}`,
            `curl -fsSL ${BOOTSTRAP_URL} | bash -s -- --rented`,
          ],
        }
      : undefined;
  plan.push({
    name: "reach",
    group: "",
    probe: { argv: [...SSH, alias, "true"] },
    ...(bootstrap === undefined ? {} : { act: bootstrap }),
    done: `bootstrapped ${alias} as root (bootstrap-linux.sh)`,
    timeoutMs: 30 * MIN,
    fix:
      bootstrap === undefined
        ? `ssh ${alias} failed: add its Host block to ~/.ssh/config.local, or give --root-host/--root-port to bootstrap it as root`
        : `the alias ${alias} must exist in ~/.ssh/config.local (Hostname = root-host, user fuyu, a Tag smart-open line) — then re-run`,
  });
  if (o.gh) {
    plan.push({
      name: "gh",
      group: "",
      probe: onBox(alias, "gh auth status > /dev/null 2>&1"),
      act: {
        argv: [
          ...SSH,
          alias,
          "gh auth login --with-token && gh auth setup-git",
        ],
        stdinFrom: ["gh", "auth", "token"],
      },
      done: "copied this machine's gh login to the box",
      timeoutMs: 2 * MIN,
      fix: "run `gh auth login` on this machine first (the token is read from `gh auth token`)",
    });
  }
  plan.push({
    name: "codex host",
    group: "",
    probe: onBox(
      alias,
      "bun $HOME/dotfiles/scripts/codex-host-bootstrap.ts --check",
    ),
    act: onBox(
      alias,
      logged(
        "codex-host",
        "bun $HOME/dotfiles/scripts/codex-host-bootstrap.ts --rented",
        2 * MIN,
      ),
    ),
    done: "codex-run host declaration",
    timeoutMs: 2 * MIN,
    log: "codex-host",
    fix: "the rented Linux box must have Bun available and pass the measured container and user-namespace checks",
  });
  for (const repo of o.repos) {
    const base = repo.split("/")[1] ?? repo;
    const dir = `$HOME/Workspace/${base}`;
    const g = base;
    const inRepo = (script: string): string => `cd ${dir} && ${script}`;
    plan.push(
      {
        name: `clone ${base}`,
        group: g,
        probe: onBox(alias, `test -d ${dir}/.git || test -d ${dir}/.jj`),
        act: onBox(
          alias,
          logged(
            `clone-${base}`,
            `mkdir -p $HOME/Workspace && gh repo clone ${repo}${dir}`,
            5 * MIN,
          ),
        ),
        done: `cloned ${repo} into ~/Workspace/${base}`,
        timeoutMs: 5 * MIN,
        log: `clone-${base}`,
        fix: "needs --gh (or a gh login on the box) with read access to the repo",
      },
      {
        name: `mise ${base}`,
        group: g,
        // `mise install` is its own idempotence: seconds when everything is installed.
        act: onBox(
          alias,
          logged(
            `mise-${base}`,
            inRepo("mise trust && mise install"),
            25 * MIN,
          ),
        ),
        done: "mise trust + install",
        timeoutMs: 25 * MIN,
        log: `mise-${base}`,
        fix: "read the log; cargo/Julia toolchain builds fail on disk or memory",
      },
      {
        name: `jj ${base}`,
        group: g,
        act: onBox(
          alias,
          logged(
            `jj-${base}`,
            inRepo(
              `if ${hasTask("setup:jj")}; then mise run setup:jj; ` +
                `elif [ ! -d .jj ]; then jj git init --colocate && { jj bookmark track alpha@origin || true; }; fi`,
            ),
            5 * MIN,
          ),
        ),
        done: "jj ready (setup:jj, or colocated onto the git checkout)",
        timeoutMs: 5 * MIN,
        log: `jj-${base}`,
        fix: "read the log; `jj git init --colocate` needs a git checkout with an origin",
      },
      {
        name: `setup ${base}`,
        group: g,
        act: onBox(
          alias,
          logged(
            `setup-${base}`,
            inRepo(`if ${hasTask("setup")}; then mise run setup; fi`),
            25 * MIN,
          ),
        ),
        done: "mise run setup (or the repo has no setup task)",
        timeoutMs: 25 * MIN,
        log: `setup-${base}`,
        fix: "read the log (Julia instantiate/precompile, cargo builds)",
      },
      {
        name: `doctor ${base}`,
        group: g,
        act: onBox(
          alias,
          logged(
            `doctor-${base}`,
            inRepo(
              `if ${hasTask("doctor")}; then mise run doctor; else echo 'RESULT: no doctor task'; fi`,
            ),
            10 * MIN,
            `grep -a 'RESULT' "${LOG_DIR}/doctor-${base}.log" | tail -n 1; `,
          ),
        ),
        done: "doctor",
        timeoutMs: 10 * MIN,
        log: `doctor-${base}`,
        surface: /RESULT/u,
        fix: "its FAIL lines name their repairs",
      },
    );
  }
  plan.push({
    name: "doctor:remote",
    group: "",
    act: { argv: ["bun", DOCTOR_REMOTE, alias] },
    done: "doctor:remote",
    timeoutMs: 5 * MIN,
    surface: /RESULT\(/u,
    // codex/claude logins finish in a browser: the human's step, listed by doctor:remote's fix line.
    humanOnly: ["agents"],
    fix: `mise run doctor:remote -- ${alias} names each repair`,
  });
  return plan;
}

/** Validated options, or the usage error to print (exit 2). */
export function parseOpts(argv: string[]): Opts | { error: string } {
  const parsed = cli(
    {
      name: "box-init.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: ["[alias]"],
      flags: {
        rootHost: {
          type: String,
          description: "ssh host of the fresh box's root login (to bootstrap)",
        },
        rootPort: {
          type: String,
          description: "ssh port of the fresh box's root login",
        },
        gh: {
          type: Boolean,
          description: "copy this machine's gh login to the box",
        },
        repo: {
          type: [String],
          description: "owner/name to clone and set up (repeatable)",
        },
      },
      help: {
        description:
          "Bring a rented box up so experiments can resume: reach, codex host declaration, gh, repos (clone, mise, jj, setup), doctors. Run from the Mac; every step is idempotent.",
        usage:
          "box-init.ts <alias> [--root-host H --root-port P] [--gh] [--repo owner/name …]",
      },
    },
    undefined,
    argv,
  );
  const alias = parsed._.alias;
  if (alias === undefined || !ALIAS_RE.test(alias))
    return { error: `an ssh Host alias is required (got ${alias ?? "none"})` };
  if (parsed._.length > 1)
    return {
      error: `one alias only; unexpected: ${parsed._.slice(1).join(" ")}`,
    };
  const { rootHost, rootPort, gh, repo } = parsed.flags;
  if ((rootHost === undefined) !== (rootPort === undefined))
    return { error: "--root-host and --root-port go together" };
  if (rootHost !== undefined && !HOST_RE.test(rootHost))
    return { error: `not a host: ${rootHost}` };
  if (rootPort !== undefined && !/^[0-9]{1,5}$/u.test(rootPort))
    return { error: `not a port: ${rootPort}` };
  const bad = repo.find((r) => !REPO_RE.test(r));
  if (bad !== undefined)
    return { error: `--repo wants owner/name, got ${bad}` };
  return {
    alias,
    gh: gh ?? false,
    repos: [...new Set(repo)],
    ...(rootHost === undefined ? {} : { rootHost }),
    ...(rootPort === undefined ? {} : { rootPort }),
  };
}

type Ran = { code: number; out: string; err: string; timedOut: boolean };

// Bounded child, both pipes drained in one Promise.all, timeout read off the signal (BG2).
async function run(c: Cmd, ms: number): Promise<Ran> {
  const sig = AbortSignal.timeout(ms);
  let stdin: Blob | "ignore" = "ignore";
  if (c.stdinFrom !== undefined) {
    // The secret stays in this process: piped from one child to the other, never logged.
    const src = Bun.spawn(c.stdinFrom, {
      stdout: "pipe",
      stderr: "ignore",
      signal: sig,
    });
    const [text, code] = await Promise.all([
      new Response(src.stdout).text(),
      src.exited,
    ]);
    if (code !== 0)
      return {
        code,
        out: "",
        err: `${c.stdinFrom[0]} failed`,
        timedOut: false,
      };
    stdin = new Blob([text]);
  }
  const proc = Bun.spawn(c.argv, {
    stdin,
    stdout: "pipe",
    stderr: "pipe",
    signal: sig,
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return {
    code,
    out: Bun.stripANSI(out).replaceAll("\r", ""),
    err: Bun.stripANSI(err).replaceAll("\r", ""),
    timedOut: sig.aborted,
  };
}

const lastLine = (s: string, re?: RegExp): string | undefined =>
  s
    .split("\n")
    .map((l) => l.trim())
    .findLast((l) => l !== "" && (re === undefined || re.test(l)));

type Line = { verdict: Verdict; name: string; detail: string; fix?: string };

async function runStep(step: Step, alias: string): Promise<Line> {
  const t0 = performance.now();
  const secs = (): string => `${((performance.now() - t0) / 1000).toFixed(1)}s`;
  if (step.probe !== undefined) {
    const p = await run(step.probe, 60_000);
    if (p.code === 0)
      return {
        verdict: "PASS",
        name: step.name,
        detail: `already holds (${secs()})`,
      };
  }
  if (step.act === undefined)
    return {
      verdict: "FAIL",
      name: step.name,
      detail: "does not hold, and no way to make it hold was given",
      ...(step.fix === undefined ? {} : { fix: step.fix }),
    };
  const r = await run(step.act, step.timeoutMs);
  const surfaced =
    step.surface === undefined
      ? undefined
      : lastLine(r.out + "\n" + r.err, step.surface);
  if (step.name === "reach" && r.code === 0 && !r.timedOut) {
    // The bootstrap ran; the alias must now answer.
    const again = await run(step.probe ?? { argv: ["true"] }, 60_000);
    if (again.code !== 0)
      return {
        verdict: "FAIL",
        name: step.name,
        detail: `bootstrap finished but ssh ${alias} still fails: ${lastLine(again.err) ?? ""}`,
        ...(step.fix === undefined ? {} : { fix: step.fix }),
      };
  }
  if (r.code === 0 && !r.timedOut) {
    return {
      verdict: "PASS",
      name: step.name,
      detail: `${surfaced ?? step.done} (${secs()})`,
    };
  }
  const failing = [...r.out.matchAll(/^FAIL {2}(\S+)/gmu)].map((m) => m[1]);
  if (
    step.humanOnly !== undefined &&
    !r.timedOut &&
    failing.length > 0 &&
    failing.every((f) => step.humanOnly?.includes(f ?? "") === true)
  )
    return {
      verdict: "WARN",
      name: step.name,
      detail: `only a human step is open: ${failing.join(", ")} (${surfaced ?? ""}) (${secs()})`,
      ...(step.fix === undefined ? {} : { fix: step.fix }),
    };
  const why = r.timedOut
    ? `timed out after ${Math.round(step.timeoutMs / MIN)} min`
    : `exit ${r.code}`;
  const log =
    step.log === undefined
      ? ""
      : ` — log: ${alias}:~/.cache/box-init/${step.log}.log`;
  const tail = surfaced ?? lastLine(r.err) ?? lastLine(r.out) ?? "";
  const line: Line = {
    verdict: step.softFail === true ? "WARN" : "FAIL",
    name: step.name,
    detail: `${why}${log}${tail === "" ? "" : ` — ${tail}`}`,
  };
  if (step.fix !== undefined) line.fix = step.fix;
  return line;
}

function render(l: Line, width: number): string {
  const head = `${l.verdict.padEnd(4)}  ${l.name.padEnd(width)}  ${l.detail}`;
  return l.fix === undefined
    ? head
    : `${head}\n${" ".repeat(width + 8)}fix: ${l.fix}`;
}

async function main(): Promise<void> {
  const o = parseOpts(Bun.argv.slice(2));
  if (o.error !== undefined) {
    process.stderr.write(
      `${o.error}\nUsage: mise run box:init -- <alias> [--root-host H --root-port P] [--gh] [--repo owner/name …]\n`,
    );
    process.exitCode = 2;
    return;
  }
  const plan = buildPlan(o);
  const width = Math.max(...plan.map((s) => s.name.length));
  const failed = new Set<string>();
  const lines: Line[] = [];
  for (const step of plan) {
    const blocked =
      failed.has("") || (step.group !== "" && failed.has(step.group));
    const detail = failed.has("")
      ? "an earlier box-level step failed"
      : `an earlier ${step.group} step failed`;
    const l: Line = blocked
      ? { verdict: "SKIP", name: step.name, detail }
      : await runStep(step, o.alias);
    if (l.verdict === "FAIL") failed.add(step.group);
    lines.push(l);
    process.stdout.write(`${render(l, width)}\n`);
  }
  const n = (v: Verdict): number => lines.filter((l) => l.verdict === v).length;
  const result = n("FAIL") > 0 ? "FAIL" : "PASS";
  process.stdout.write(
    `RESULT(${o.alias}): ${result} · FAIL ${n("FAIL")} · WARN ${n("WARN")} · PASS ${n("PASS")} · SKIP ${n("SKIP")}\n`,
  );
  process.exitCode = n("FAIL") > 0 ? 1 : 0;
}

if (import.meta.main) {
  const r = await attempt(main);
  if (!r.ok) {
    process.stderr.write(`FATAL: ${errorMessage(r.error)}\n`);
    process.exitCode = 2;
  }
}
