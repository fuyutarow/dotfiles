/**
 * Update the standalone Codex CLI, then close the app-server version gap it leaves behind.
 *
 * Invoked as a topgrade custom step (see topgrade/topgrade.toml). It lives here, as a real
 * file, rather than inline in that TOML for two measured reasons:
 *
 * 1. Code inside a config string is invisible to every linter. This repo lints shell via
 *    `mise run lint:sh` over scripts/ tmux/scripts agents/claude lazygit .githooks — a
 *    snippet in topgrade.toml is in none of them. A step that had NEVER once succeeded was
 *    committed and went unnoticed until 2026-08-24. As a .ts file it is covered by the
 *    existing `fmt:ts` / `lint:bun` tasks (`fd -e ts -E agents/skills .`).
 * 2. topgrade runs custom commands through `/usr/bin/zsh -c`, and zsh has read-only special
 *    parameters that bash does not. The original snippet used `status=$?`, which aborts with
 *    "read-only variable: status" because zsh defines `status` as a csh-compatible synonym
 *    for `$?`. shellcheck could not have caught it either: it does not analyse zsh. In TS the
 *    trap does not exist, and the JSON below is parsed natively instead of shelling out to jq.
 *
 * WHY THE DAEMON NEEDS SEPARATE HANDLING
 * `codex update` only repoints the `current` symlink at the newest downloaded release. The
 * long-lived `codex app-server` daemon (remote control / ChatGPT desktop connector) keeps
 * running the binary it was launched with until something restarts it. Measured 2026-08-23: a
 * daemon started 2026-08-03 was still serving 0.146.0 after `current` had moved through
 * 0.146.1 -> 0.147.0 -> 0.149.0. `codex app-server daemon version` reports the gap as
 * appServerVersion (running) vs managedCodexVersion (what `current` points at). That stale
 * daemon is not cosmetic: it also keeps serving its STARTUP-TIME config.toml, so config edits
 * silently do nothing until it is replaced.
 *
 * Restart only on a real gap, so a no-op `mise up` never gratuitously kills a live
 * remote-controlled session. And the manual recovery below is deliberately NOT automated:
 * stopping a daemon drops every session on it, which is not an unattended updater's call.
 */

const CODEX = "codex";

interface DaemonVersion {
  appServerVersion?: string;
  managedCodexVersion?: string;
}

// Every spawn below is bounded. This runs unattended inside `mise run up`, where a hung child
// would stall the whole topgrade run with no one watching; the updater in particular reaches
// the network. Values are generous enough that a slow link is not mistaken for a hang.
const UPDATE_TIMEOUT_MS = 10 * 60_000;
const QUERY_TIMEOUT_MS = 30_000;
const RESTART_TIMEOUT_MS = 2 * 60_000;

async function run(args: string[]): Promise<{ code: number; stdout: string }> {
  const proc = Bun.spawn([CODEX, ...args], {
    stdout: "pipe",
    stderr: "inherit",
    timeout: UPDATE_TIMEOUT_MS,
  });
  const stdout = await new Response(proc.stdout).text();
  const code = await proc.exited;
  process.stdout.write(stdout);
  return { code, stdout };
}

async function daemonVersion(): Promise<DaemonVersion | null> {
  // stderr swallowed: "no daemon running" is an ordinary outcome here, not a failure.
  const proc = Bun.spawn([CODEX, "app-server", "daemon", "version"], {
    stdout: "pipe",
    stderr: "ignore",
    timeout: QUERY_TIMEOUT_MS,
  });
  const out = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) return null;
  try {
    return JSON.parse(out) as DaemonVersion;
  } catch {
    return null;
  }
}

// Shared with macOS, where codex may simply be absent: skip, never fail the topgrade run.
if (!Bun.which(CODEX)) {
  console.log("codex absent — skipped");
  process.exit(0);
}

// This step's exit status is the updater's own, per the convention in topgrade.toml.
const { code: updateCode } = await run(["update"]);

const v = await daemonVersion();
const running = v?.appServerVersion;
const current = v?.managedCodexVersion;

if (running && current && running !== current) {
  console.log(
    `codex: app-server ${running} != current ${current} — restarting daemon`,
  );
  const proc = Bun.spawn([CODEX, "app-server", "daemon", "restart"], {
    stdout: "inherit",
    stderr: "inherit",
    timeout: RESTART_TIMEOUT_MS,
  });
  if ((await proc.exited) !== 0) {
    // Measured 2026-08-24: a daemon launched directly (and reparented to init) is refused with
    // "app server is running but is not managed by codex app-server daemon", so the gap this
    // step exists to close stays open. Report the recovery; let a human pick the moment.
    console.error(
      [
        `codex: 'daemon restart' refused — app-server ${running} was not started by`,
        `  'codex app-server daemon', so only a manual replacement closes the gap.`,
        `  Note the stale daemon also serves its startup-time config.toml.`,
        `  When no session is live:`,
        `    pkill -f 'codex .* app-server --listen' && codex app-server daemon start`,
      ].join("\n"),
    );
  }
}

process.exit(updateCode);
