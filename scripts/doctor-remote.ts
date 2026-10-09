// `mise run doctor:remote -- <host>` — from the machine you sit at: is <host> usable the way dotfiles
// promises (README invariant 7)? `mise run doctor` asks that of THIS machine; this asks it of a box
// you drive over ssh / `herdr --remote`, through each kind of session that box will actually see:
//   reach      ssh <host> true, key auth only        (BatchMode: a password prompt is a FAIL)
//   ssh-cmd    `ssh <host> 'cmd'` — herdr --remote's bridge lives here — finds the core CLIs
//   login      an interactive login lands in zsh with the dotfiles aliases loaded
//   pane       an interactive NON-login shell (how herdr opens a pane: `$SHELL`, no -l) does too
//   agents     codex and claude logged in; Jev's key opens via fnox (else stated as WARN)
//   time-zone  the box's clock reads the human's time zone (zsh/timezone, e.g. +0900)
//   commands   every alias target and topic command (btm, herdr, …) resolves there
//   smart-open a host tagged `Tag smart-open` gets its forwarded socket bound on attach
// Every check here was first a hand-run ssh during the 2026-10-05 rentals, and two of them found
// real defects (a bash pane on sol; a forward refused by a stale socket) — silent until asked.
//
// Read-only on both ends, with one exception it owns: the smart-open probe binds the forward (that
// is what it tests) and removes the socket its OWN session bound before leaving, because a host
// whose sshd lacks StreamLocalBindUnlink would otherwise refuse the next real attach.
// Consumer: a human or agent reading verdict lines. Exit: 0 no FAIL · 1 a FAIL · 2 usage/FATAL.

import { readFileSync } from "node:fs";
import { join } from "node:path";
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

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(
      `unknown flag(s): --${flag}\nUsage: bun scripts/doctor-remote.ts <host>\n`,
    );
    process.exit(2);
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

async function checkCodexRoute(host: string): Promise<Finding> {
  const r = await run([...SSH, host, "agx pick doctor"], null, 30_000);
  const status = /agx: codex: (available|unavailable) — (.*)/u.exec(r.err);
  if (status?.[1] === "available")
    return finding(
      "codex-route",
      "PASS",
      `agx pick doctor: codex available — ${status[2]}`,
    );
  if (status?.[1] === "unavailable")
    return finding(
      "codex-route",
      "FAIL",
      `agx pick doctor: codex unavailable — ${status[2]}`,
      status[2]?.includes("not logged in") === true
        ? `from the Mac: mise run auth:push -- ${host}`
        : `on ${host}: cd ~/dotfiles && mise run linux:init -- --rented (only for an owner's disposable Vast container; never on a shared server)`,
    );
  const diagnostic = r.err.trim();
  const detail = diagnostic.length > 0 ? diagnostic : r.out.trim();
  return finding(
    "codex-route",
    "FAIL",
    `agx pick doctor did not report Codex route status (exit ${r.code}${r.timedOut ? ", timed out" : ""}): ${detail}`,
    `on ${host}: cd ~/dotfiles && mise run linux:init; use --rented only for an owner's disposable Vast container`,
  );
}

// The agents can work there: Codex and Claude logged in (a luna worker fails at launch without
// Codex's login — 2026-10-06), and Jev's key opens through fnox (else agx uses its default
// row and rr its local judge: stated, not silent).
async function checkAgents(host: string): Promise<Finding> {
  const probe = [
    `codex login status > /dev/null 2>&1 && echo "${MARK("CODEX")}=in" || echo "${MARK("CODEX")}=out"`,
    `claude auth status > /dev/null 2>&1 && echo "${MARK("CLAUDE")}=in" || echo "${MARK("CLAUDE")}=out"`,
    `gh auth status > /dev/null 2>&1 && echo "${MARK("GH")}=in" || echo "${MARK("GH")}=out"`,
    `fnox get TYPESAFE_API_KEY > /dev/null 2>&1 && echo "${MARK("JEV")}=yes" || echo "${MARK("JEV")}=no"`,
  ].join("; ");
  const r = await run(
    [...SSH, host, `zsh -lc '${probe.replaceAll("'", "'\\''")}'`],
    null,
    60_000,
  );
  const codex = marker(r.out, "CODEX");
  if (codex === null)
    return finding(
      "agents",
      "WARN",
      "the probe did not finish (exit " + r.code + ")",
    );
  const states = [
    ["codex", codex],
    ["claude", marker(r.out, "CLAUDE")],
    ["gh", marker(r.out, "GH")],
  ] as const;
  const stateDetails = states.map(
    ([name, state]) =>
      name + (state === "in" ? " logged in" : " not logged in"),
  );
  if (states.some(([, state]) => state !== "in"))
    return finding(
      "agents",
      "FAIL",
      stateDetails.join("; "),
      `from the Mac: mise run auth:push -- ${host}`,
    );
  return marker(r.out, "JEV") === "yes"
    ? finding(
        "agents",
        "PASS",
        stateDetails.join("; ") + "; Jev's key opens via fnox",
      )
    : finding(
        "agents",
        "WARN",
        stateDetails.join("; ") +
          "; no Jev key here — agx uses its default row, rr its local judge",
        `if ${host}'s root is trusted: mise run secrets:push -- ${host}`,
      );
}

// The human's time zone reaches the box (zsh/zshenv, zsh/bashrc): a rented box runs in UTC, and a
// TZ whose zone file is missing would silently fall back to UTC — so this asks the clock itself.
// The zone NAME is read from this checkout's zsh/timezone (its one home); the offset to expect is
// that zone's offset NOW, in `date +%z` form, so a DST zone is judged at the moment of the probe.
const ZONE = readFileSync(
  join(import.meta.dir, "..", "zsh", "timezone"),
  "utf8",
).trim();

/** `date +%z` for `zone` at this instant: "+09:00" -> "+0900". */
export function wantOffset(zone: string): string {
  return Temporal.Now.zonedDateTimeISO(zone).offset.replace(":", "");
}

async function checkTimeZone(host: string): Promise<Finding> {
  const want = wantOffset(ZONE);
  const probe = `echo "@@""TZOFF=$(date +%z)"; echo "@@""TZ=\${TZ:-unset}"; test -e /usr/share/zoneinfo/${ZONE} && echo "@@""ZONEFILE=yes" || echo "@@""ZONEFILE=no"`;
  const r = await run([...SSH, host, probe], null, 30_000);
  const off = marker(r.out, "TZOFF");
  if (off === null)
    return finding(
      "time-zone",
      "WARN",
      `the probe did not finish (exit ${r.code})`,
    );
  if (off === want)
    return finding(
      "time-zone",
      "PASS",
      `${host}'s clock reads ${ZONE} (${off})`,
    );
  const zoneFile = marker(r.out, "ZONEFILE") === "yes";
  return finding(
    "time-zone",
    "FAIL",
    `${host}'s clock reads ${off}, not ${want} (TZ=${marker(r.out, "TZ") ?? "?"}, ${ZONE} zone file ${zoneFile ? "present" : "MISSING"})`,
    zoneFile
      ? "pull dotfiles there (zsh/zshenv and zsh/bashrc export TZ from zsh/timezone)"
      : `install the tz database there (Debian/Ubuntu: tzdata) — without it TZ=${ZONE} would read as UTC`,
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
  "cargo",
  "sccache", // RUSTC_WRAPPER=sccache is unconditional: without it every cargo call fails

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
    // Split into an ARRAY first: a nested ${${(z)v}[1]} collapses a one-word value to a scalar and
    // [1] then takes its first CHARACTER (`dl='yt-dlp'` read as `y`).
    `for n v in \${(kv)aliases}; do w=(\${(z)v}); c=\${(Q)w[1]}; [[ $c == (${PREFIXES}) ]] && continue; ` +
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
  // NEVER take a live socket (2026-10-06): on an sshd with StreamLocalBindUnlink (linux:init sets it
  // where sudo is ours) a new attach does not fail on an existing socket, it STEALS it — and the
  // probe used to remove "its" socket afterwards, which cut the forward of the human's own open
  // `herdr --remote` session. So: look first over a command session (which carries no forward),
  // and attach only when no one is listening; afterwards remove only a DEAD file (no listener).
  // LIVE = some process listens on the path (`ss -xl`). A socket file with none is a dead bind.
  const state =
    `test -S ${forward} && echo "${MARK("SOCK")}=present" || echo "${MARK("SOCK")}=absent"; ` +
    `ss -xlH 2> /dev/null | grep -qF " ${forward} " && echo "${MARK("LIVE")}=yes" || echo "${MARK("LIVE")}=no"`;
  const before = await run([...SSH, host, state], null, 30_000);
  if (marker(before.out, "LIVE") === "yes")
    return finding(
      "smart-open",
      "PASS",
      `a live attach holds ${forward} on ${host} — \`o\` there opens on its client (not probed further: an attach would take it over)`,
    );
  const r = await interactive(host, null, state);
  const boundByUs = marker(r.out, "LIVE") === "yes";
  const refused = /remote port forwarding failed/u.test(r.err + r.out);
  // Our session is gone now. Remove the file only if it is dead — never a socket someone listens on.
  await run(
    [
      ...SSH,
      host,
      `test -S ${forward} && ! (ss -xlH 2> /dev/null | grep -qF " ${forward} ") && rm -f ${forward}; true`,
    ],
    null,
    30_000,
  );
  if (boundByUs && !refused)
    return finding(
      "smart-open",
      "PASS",
      `an attach binds ${forward} on ${host}`,
    );
  if (refused)
    return finding(
      "smart-open",
      "FAIL",
      `${host} refused the forward: ${forward} was a dead bind (no listener) a dropped session left, and its sshd has no StreamLocalBindUnlink — removed now`,
      `reattach; for good: StreamLocalBindUnlink yes in its sshd (linux:init does it where sudo is ours)`,
    );
  return finding(
    "smart-open",
    "WARN",
    `could not confirm the socket (before: ${marker(before.out, "SOCK") ?? "nothing"}, during attach: listener ${boundByUs ? "yes" : "no"})`,
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
  if (parsed._.length > 1) {
    process.stderr.write(
      `one host only; unexpected: ${parsed._.slice(1).join(" ")}\nUsage: bun scripts/doctor-remote.ts <host>\n`,
    );
    process.exitCode = 2;
    return;
  }
  const host = parsed._.host;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(host)) {
    process.stderr.write(
      `not an ssh Host alias: ${host}\nUsage: bun scripts/doctor-remote.ts <host>\n`,
    );
    process.exitCode = 2;
    return;
  }
  const reach = await checkReach(host);
  const rest =
    reach.verdict === "PASS"
      ? await Promise.all([
          checkSshCmd(host),
          checkCodexRoute(host),
          checkTimeZone(host),
          checkAgents(host),
          checkLogin(host),
          checkPane(host),
          checkCommands(host),
        ])
      : (
          [
            "ssh-cmd",
            "codex-route",
            "time-zone",
            "agents",
            "login",
            "pane",
            "commands",
          ] as const
        ).map((n) => finding(n, "SKIP", "host unreachable"));
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
    process.stderr.write(`FATAL: ${errorMessage(r.error)}\n`);
    process.exitCode = 2;
  }
}
