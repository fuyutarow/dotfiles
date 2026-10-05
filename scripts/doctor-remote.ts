// `mise run doctor:remote -- <host>` — from the machine you sit at: is <host> usable the way dotfiles
// promises (README invariant 7)? `mise run doctor` asks that of THIS machine; this asks it of a box
// you drive over ssh / `herdr --remote`, through each kind of session that box will actually see:
//   reach      ssh <host> true, key auth only        (BatchMode: a password prompt is a FAIL)
//   ssh-cmd    `ssh <host> 'cmd'` — herdr --remote's bridge lives here — finds the core CLIs
//   login      an interactive login lands in zsh with the dotfiles aliases loaded
//   pane       an interactive NON-login shell (how herdr opens a pane: `$SHELL`, no -l) does too
//   commands   every alias target and topic command (btm, herdr, …) resolves there
//   smart-open a host tagged `Tag smart-open` gets its forwarded socket bound on attach
// Every check here was first a hand-run ssh during the 2026-10-05 rentals, and two of them found
// real defects (a bash pane on sol; a forward refused by a stale socket) — silent until asked.
//
// Read-only on both ends, with one exception it owns: the smart-open probe binds the forward (that
// is what it tests) and removes the socket its OWN session bound before leaving, because a host
// whose sshd lacks StreamLocalBindUnlink would otherwise refuse the next real attach.
// Consumer: a human or agent reading verdict lines. Exit: 0 no FAIL · 1 a FAIL · 2 usage/FATAL.

import { cli } from "cleye";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";

type Verdict = "PASS" | "FAIL" | "WARN" | "SKIP";
type Finding = { name: string; verdict: Verdict; detail: string; fix?: string };

// What `herdr --remote` and an agent session need from a non-interactive ssh command. claude and
// codex are core since 2026-10-05 (linux:init installs them).
const SSH_CMD_TOOLS = ["herdr", "mise", "jj", "claude", "codex"] as const;
const SSH = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15"] as const;
// Markers are assembled by the remote shell (`@@""X`), so the echo of the typed line never matches.
const MARK = (k: string): string => `@@""${k}`;

class UsageError extends Error {}

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new UsageError(`unknown flag(s): --${flag}`);
  }
}

type Ran = { code: number; out: string; err: string; timedOut: boolean };

// Bounded child, both pipes drained in one Promise.all, timeout read off the signal (BG2).
async function run(
  cmd: readonly string[],
  input: string | null,
  ms: number,
): Promise<Ran> {
  const sig = AbortSignal.timeout(ms);
  const proc = Bun.spawn([...cmd], {
    stdin: input === null ? "ignore" : new Blob([input]),
    stdout: "pipe",
    stderr: "pipe",
    signal: sig,
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out: plain(out), err: plain(err), timedOut: sig.aborted };
}

/** Terminal output without escape sequences or carriage returns. */
function plain(s: string): string {
  return Bun.stripANSI(s).replaceAll("\r", "");
}

function marker(out: string, key: string): string | null {
  const m = new RegExp(`@@${key}=(\\S*)`, "u").exec(out);
  return m?.[1] ?? null;
}

const finding = (
  name: string,
  verdict: Verdict,
  detail: string,
  fix?: string,
): Finding =>
  fix === undefined
    ? { name, verdict, detail }
    : { name, verdict, detail, fix };

async function checkReach(host: string): Promise<Finding> {
  const r = await run([...SSH, host, "true"], null, 30_000);
  if (r.code === 0)
    return finding("reach", "PASS", `ssh ${host} answers with key auth`);
  return finding(
    "reach",
    "FAIL",
    `ssh ${host} failed (exit ${r.code}${r.timedOut ? ", timed out" : ""}): ${r.err.trim().split("\n").pop() ?? ""}`,
    `ssh-copy-id -i ~/.ssh/id_ed25519.pub ${host} (and a Host block in ~/.ssh/config.local)`,
  );
}

async function checkSshCmd(host: string): Promise<Finding> {
  const probe = `for c in ${SSH_CMD_TOOLS.join(" ")}; do command -v "$c" > /dev/null 2>&1 || echo "@@""MISSING=$c"; done; echo "@@""DONE=1"`;
  const r = await run([...SSH, host, probe], null, 30_000);
  if (marker(r.out, "DONE") === null)
    return finding(
      "ssh-cmd",
      "WARN",
      `the probe did not finish (exit ${r.code}): ${r.err.trim()}`,
    );
  const missing = [...r.out.matchAll(/@@MISSING=(\S+)/gu)].map(
    (m) => m[1] ?? "",
  );
  return missing.length === 0
    ? finding(
        "ssh-cmd",
        "PASS",
        `\`ssh ${host} cmd\` finds ${SSH_CMD_TOOLS.join(", ")}`,
      )
    : finding(
        "ssh-cmd",
        "FAIL",
        `\`ssh ${host} cmd\` (herdr --remote's bridge) cannot find: ${missing.join(", ")}`,
        `on ${host}: mise run linux:init (rootless: see scripts/linux-init.ts header)`,
      );
}

// Drive an interactive shell over a pty: type the probe, read the markers it prints.
async function interactive(
  host: string,
  remote: string | null,
  script: string,
): Promise<Ran> {
  const cmd =
    remote === null ? [...SSH, "-tt", host] : [...SSH, "-tt", host, remote];
  return run(cmd, `${script}\nexit\n`, 45_000);
}

const SHELL_PROBE = `echo "${MARK("ZSH")}=\${ZSH_VERSION:-none}"; alias l > /dev/null 2>&1 && echo "${MARK("ALIAS")}=l" || echo "${MARK("ALIAS")}=none"`;

function shellVerdict(name: string, what: string, r: Ran): Finding {
  const zsh = marker(r.out, "ZSH");
  const alias = marker(r.out, "ALIAS");
  if (zsh === null)
    return finding(
      name,
      "WARN",
      `${what}: the probe printed nothing (exit ${r.code}${r.timedOut ? ", timed out" : ""})`,
    );
  if (zsh !== "none" && alias === "l")
    return finding(
      name,
      "PASS",
      `${what} is zsh ${zsh} with the dotfiles aliases`,
    );
  return finding(
    name,
    "FAIL",
    zsh === "none"
      ? `${what} is not zsh`
      : `${what} is zsh ${zsh} but the dotfiles aliases are not loaded`,
    zsh === "none"
      ? "where chsh is not ours: mise run link:dots links ~/.bash_profile and ~/.bashrc (zsh/bash_profile, zsh/bashrc) to hand bash to zsh"
      : "mise run link:dots (zprofile → sheldon → zsh/aliases.zsh)",
  );
}

async function checkLogin(host: string): Promise<Finding> {
  // ClearAllForwardings: this probe must not bind the smart-open socket (checkSmartOpen does, and
  // cleans up after itself).
  const r = await run(
    [...SSH, "-o", "ClearAllForwardings=yes", "-tt", host],
    `${SHELL_PROBE}\nexit\n`,
    45_000,
  );
  return shellVerdict("login", "an interactive login", r);
}

async function checkPane(host: string): Promise<Finding> {
  const r = await interactive(host, 'exec "$SHELL" -i', SHELL_PROBE);
  return shellVerdict("pane", "a herdr pane (`$SHELL -i`, non-login)", r);
}

// The commands dotfiles itself relies on, beyond the aliases: each topic whose config is linked on
// every machine names its tool here. A tool missing from Brewfile.core surfaced one at a time on the
// 2026-10-05 boxes (gh, claude, topgrade, btm) — each found by hand. This asks for all of them at once.
const TOPIC_COMMANDS = [
  "btm",
  "bun", // interactive only: Claude Code hooks run `bun …` (zsh/zshrc runtime dir)

  "herdr",
  "jj",
  "lazygit",
  "sheldon",
  "topgrade",
  "tmux",
] as const;
// Words that start an alias but are not the command it needs.
const PREFIXES =
  "sudo|command|noglob|nocorrect|builtin|exec|cd|echo|print|source|*=*|\\$*";

async function checkCommands(host: string): Promise<Finding> {
  const probe =
    `for n v in \${(kv)aliases}; do c=\${(Q)\${\${(z)v}[1]}}; [[ $c == (${PREFIXES}) ]] && continue; ` +
    `whence -- $c > /dev/null || print -r -- "${MARK("UNRESOLVED")}=$n→$c"; done; ` +
    `for c in ${TOPIC_COMMANDS.join(" ")}; do whence -- $c > /dev/null || print -r -- "${MARK("UNRESOLVED")}=topic→$c"; done; ` +
    `print -r -- "${MARK("DONE")}=1"`;
  const r = await run(
    [...SSH, "-o", "ClearAllForwardings=yes", "-tt", host],
    `${probe}\nexit\n`,
    45_000,
  );
  if (marker(r.out, "DONE") === null)
    return finding(
      "commands",
      "WARN",
      `the probe did not finish (exit ${r.code})`,
    );
  const missing = [
    ...new Set(
      [...r.out.matchAll(/@@UNRESOLVED=(\S+)/gu)].map((m) => m[1] ?? ""),
    ),
  ].toSorted();
  return missing.length === 0
    ? finding(
        "commands",
        "PASS",
        "every alias target and topic command resolves",
      )
    : finding(
        "commands",
        "FAIL",
        `${missing.length} command(s) the dotfiles use do not resolve: ${missing.join(", ")}`,
        "a core tool → Brewfile.core, then mise run linux:init there; an alias for a tool this box should not have → define it only when the tool exists",
      );
}

async function checkSmartOpen(host: string): Promise<Finding> {
  const g = await run(["ssh", "-G", host], null, 10_000);
  const forward = g.out
    .split("\n")
    .find((l) => l.startsWith("remoteforward "))
    ?.split(" ")[1];
  if (forward === undefined)
    return finding(
      "smart-open",
      "SKIP",
      `${host} carries no smart-open forward (add \`Tag smart-open\` to its config.local block to opt in)`,
    );
  // LIVE = some process listens on the path (`ss -xl`): an attach's sshd, ours or another's. A
  // socket file with no listener is a dead bind a dropped session left behind.
  const probe =
    `test -S ${forward} && echo "${MARK("SOCK")}=present" || echo "${MARK("SOCK")}=absent"; ` +
    `ss -xlH 2> /dev/null | grep -qF " ${forward} " && echo "${MARK("LIVE")}=yes" || echo "${MARK("LIVE")}=no"`;
  const r = await interactive(host, null, probe);
  const sock = marker(r.out, "SOCK");
  const live = marker(r.out, "LIVE") === "yes";
  const refused = /remote port forwarding failed/u.test(r.err + r.out);
  if (!refused && sock === "present" && live) {
    // We bound it, and our session is gone: on an sshd without StreamLocalBindUnlink the file
    // now refuses the next real attach, so remove the one WE made. Never touch a socket another
    // session holds (the refused branches below leave it alone).
    await run([...SSH, host, `rm -f ${forward}`], null, 30_000);
    return finding(
      "smart-open",
      "PASS",
      `an attach binds ${forward} on ${host}`,
    );
  }
  if (refused && live)
    return finding(
      "smart-open",
      "WARN",
      `${forward} on ${host} is held by another live session (an open \`herdr --remote\` / ssh master): \`o\` works there, but a second attach cannot bind until that one exits`,
    );
  if (refused)
    return finding(
      "smart-open",
      "FAIL",
      `${host} refused the forward: ${forward} is a dead bind (no listener) a dropped session left, and its sshd has no StreamLocalBindUnlink`,
      `ssh ${host} rm -f ${forward}, then reattach (or StreamLocalBindUnlink yes in its sshd, where you have root)`,
    );
  return finding(
    "smart-open",
    "WARN",
    `could not confirm the socket (probe: ${sock ?? "nothing"}, listener ${live ? "yes" : "no"})`,
  );
}

function render(host: string, findings: Finding[]): string {
  const width = Math.max(...findings.map((f) => f.name.length));
  const lines = findings.flatMap((f) => {
    const head = `${f.verdict.padEnd(4)}  ${f.name.padEnd(width)}  ${f.detail}`;
    return f.fix === undefined
      ? [head]
      : [head, `${" ".repeat(width + 8)}fix: ${f.fix}`];
  });
  const count = (v: Verdict): number =>
    findings.filter((f) => f.verdict === v).length;
  const result = count("FAIL") > 0 ? "FAIL" : "PASS";
  lines.push(
    `RESULT(${host}): ${result} · FAIL ${count("FAIL")} · WARN ${count("WARN")} · PASS ${count("PASS")} · SKIP ${count("SKIP")}`,
  );
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "doctor-remote.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: ["<host>"],
      help: {
        description:
          "Check, from this machine, that an ssh host is usable as dotfiles promises.",
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length > 1)
    throw new UsageError(
      `one host only; unexpected: ${parsed._.slice(1).join(" ")}`,
    );
  const host = parsed._.host;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(host))
    throw new UsageError(`not an ssh Host alias: ${host}`);
  const reach = await checkReach(host);
  const rest =
    reach.verdict === "PASS"
      ? await Promise.all([
          checkSshCmd(host),
          checkLogin(host),
          checkPane(host),
          checkCommands(host),
        ])
      : (["ssh-cmd", "login", "pane", "commands"] as const).map((n) =>
          finding(n, "SKIP", "host unreachable"),
        );
  // smart-open last and alone: it binds the forward, and the sessions above must not race it.
  const so =
    reach.verdict === "PASS"
      ? await checkSmartOpen(host)
      : finding("smart-open", "SKIP", "host unreachable");
  const findings = [reach, ...rest, so];
  process.stdout.write(render(host, findings));
  process.exitCode = findings.some((f) => f.verdict === "FAIL") ? 1 : 0;
}

if (import.meta.main) {
  const r = await attempt(main);
  if (!r.ok) {
    const usage = r.error instanceof UsageError;
    process.stderr.write(
      usage
        ? `${errorMessage(r.error)}\nUsage: bun scripts/doctor-remote.ts <host>\n`
        : `FATAL: ${errorMessage(r.error)}\n`,
    );
    process.exitCode = 2;
  }
}
