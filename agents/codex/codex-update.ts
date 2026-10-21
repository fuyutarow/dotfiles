/**
 * Reconcile the declared Codex CLI update with the app-server version gap it can leave behind.
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
 * UPDATE OWNERSHIP
 * WSL's declared standalone provider is the Homebrew `codex` cask (Brewfile.core), so Topgrade's
 * `brew_cask` step owns its version transition. Calling `codex update` there duplicates that work
 * and is unsupported by the cask. macOS and ordinary Linux retain the standalone self-update;
 * the Windows Desktop package owns its bundle update lifecycle.
 *
 * WHY THE DAEMON NEEDS SEPARATE HANDLING
 * An updated Codex release does not replace a running app-server daemon. The
 * long-lived `codex app-server` daemon (remote control / ChatGPT desktop connector) keeps
 * running the binary it was launched with until something restarts it. Measured 2026-08-23: a
 * daemon started 2026-08-03 was still serving 0.146.0 after the managed release had moved through
 * 0.146.1 -> 0.147.0 -> 0.149.0. `codex app-server daemon version` reports the gap as
 * appServerVersion (running) vs managedCodexVersion (the installed release). That stale
 * daemon is not cosmetic: it also keeps serving its STARTUP-TIME config.toml, so config edits
 * silently do nothing until it is replaced.
 *
 * Restart only on a real gap, so a no-op `mise up` never gratuitously kills a live
 * remote-controlled session. And the manual recovery below is deliberately NOT automated:
 * stopping a daemon drops every session on it, which is not an unattended updater's call.
 */

// Script-scoped, not a library: this import (not an `export {}`, now redundant with it in
// scope) makes the file a module so the top-level `await` calls below are legal under TypeScript.
import { jsonOf, z } from "../hooks/zod.ts";
import { homedir } from "node:os";
import { join } from "node:path";
import { hostKind, resolveRuntime } from "./runtime.ts";
const recoverInvalid = <T extends z.ZodType>(schema: T) =>
  schema.optional().catch(undefined);

const CODEX = "codex";
const DOTFILES =
  process.env.DOTFILES ?? join(process.env.HOME ?? homedir(), "dotfiles");

// A field that is absent or not a string reads as undefined; a non-object payload is "no version".
const DaemonVersionSchema = z.object({
  appServerVersion: recoverInvalid(z.string()),
  managedCodexVersion: recoverInvalid(z.string()),
});
type DaemonVersion = z.output<typeof DaemonVersionSchema>;

// Every spawn below is bounded. This runs unattended inside `mise run up`, where a hung child
// would stall the whole topgrade run with no one watching; the updater in particular reaches
// the network. Values are generous enough that a slow link is not mistaken for a hang.
const UPDATE_TIMEOUT_MS = 10 * 60_000;
const QUERY_TIMEOUT_MS = 30_000;
const RESTART_TIMEOUT_MS = 2 * 60_000;

async function run(args: string[]): Promise<{ code: number; stdout: string }> {
  const signal = AbortSignal.timeout(UPDATE_TIMEOUT_MS);
  const proc = Bun.spawn([CODEX, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    signal,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  return { code: signal.aborted ? 124 : code, stdout };
}

async function daemonVersion(): Promise<DaemonVersion | null> {
  // stderr swallowed: "no daemon running" is an ordinary outcome here, not a failure.
  const signal = AbortSignal.timeout(QUERY_TIMEOUT_MS);
  const proc = Bun.spawn([CODEX, "app-server", "daemon", "version"], {
    stdout: "pipe",
    stderr: "ignore",
    signal,
  });
  const [out, code] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  if (code !== 0 || signal.aborted) return null;
  const version = jsonOf(DaemonVersionSchema).safeParse(out);
  return version.success ? version.data : null;
}

// The Windows desktop package owns its bundle update lifecycle. Calling `codex update` through
// the WSL shim would wrongly treat the app-owned executable as a standalone payload.
const runtime = await resolveRuntime(DOTFILES);
if (runtime.provider === "windows-desktop") {
  console.log(
    "codex: Windows desktop owns updates — standalone update skipped",
  );
  const config = Bun.spawn(["bun", `${import.meta.dir}/codex-config.ts`], {
    stdout: "inherit",
    stderr: "inherit",
    timeout: RESTART_TIMEOUT_MS,
    env: { ...process.env, DOTFILES },
  });
  process.exit(await config.exited);
}

// Shared with macOS, where codex may simply be absent: skip, never fail the topgrade run.
if (Bun.which(CODEX) === null) {
  console.log("codex absent — skipped");
  process.exit(0);
}

let updateCode = 0;
if (hostKind() === "wsl") {
  // Brewfile.core declares the WSL standalone CLI as a Homebrew cask. Topgrade's brew_cask
  // step owns errors from that update; this follow-up must not mask them with a second updater.
  console.log("codex: Homebrew owns WSL CLI updates — self-update skipped");
} else {
  updateCode = (await run(["update"])).code;
}

const v = await daemonVersion();
const running = v?.appServerVersion;
const current = v?.managedCodexVersion;

if (running !== undefined && current !== undefined && running !== current) {
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

// An update path can restart the daemon, and a restart is where remote control was lost on
// 2026-10-01. Re-converge to agents/codex/app-server.toml; report, never mask the standalone
// updater's own status.
const converge = Bun.spawn(
  ["bun", `${import.meta.dir}/codex-remote-control.ts`],
  {
    stdout: "inherit",
    stderr: "inherit",
    timeout: RESTART_TIMEOUT_MS,
  },
);
await converge.exited;

const sandboxNetwork = Bun.spawn(
  ["bun", `${import.meta.dir}/codex-config.ts`],
  {
    stdout: "inherit",
    stderr: "inherit",
    timeout: RESTART_TIMEOUT_MS,
  },
);
await sandboxNetwork.exited;

process.exit(updateCode);
