#!/usr/bin/env bun
// wsl-interop-session — print the /run/WSL/*_interop socket whose Windows processes run in the
// owner's INTERACTIVE desktop session (explorer.exe's SessionId), so the clipboard read shim
// (wsl/bin/wsl-clipboard) reads the clipboard the owner just wrote with Win+Shift+S.
//
// Consumer: wsl/bin/wsl-clipboard, as `WSL_INTEROP=$(bun wsl-interop-session.ts)`. stdout is the
// socket path and nothing else. Exit: 0 chosen · 1 no socket qualifies (stderr says why) or unknown flag · 2 stray arguments.
//
// WHY. Windows clipboards are per Windows session. A process started through a stale or
// session-0 interop socket lands in session 0 and sees only what session-0 processes set, never a
// capture made in session 1 (measured 2026-11-18: `powershell.exe` via /run/WSL/2_interop →
// SessionId 0, formats `System.Drawing.Bitmap, Bitmap`; via 1646784_interop → SessionId 1, formats
// also `PNG`). Every long-lived `claude` pane keeps the WSL_INTEROP it inherited at start — a
// socket (/run/WSL/554_interop) that may no longer exist, and zsh/zshenv picks the newest socket
// without spawning, so it cannot know the session. Sockets outlive their sessions, so liveness
// and session both have to be measured, here, by spawning.
//
// SELECTION. Candidates are real socket files (symlinks such as 1_interop are the same endpoint as
// their target and dropped), newest mtime first. A candidate that refuses a connect() is dead and
// costs no spawn. A live one is probed with one powershell.exe that reports its own SessionId and
// the SessionIds of every explorer.exe; the first successful probe fixes the target session
// (the only explorer session, or with several the active console session, asked of that same
// socket). The first candidate whose own SessionId equals the target wins.
//
// CACHE. The winner is stored in $XDG_RUNTIME_DIR/wsl-interop-session.json and reused while the
// socket file still exists and still accepts a connect(); otherwise the selection runs again. There
// is no fallback location: without XDG_RUNTIME_DIR nothing is cached and every call probes.
// A cache hit costs one bun start plus one connect(), no powershell.exe.
//
// BOUNDS. Each probe is cut at PROBE_MS, the whole selection at BUDGET_MS, both well under Claude
// Code's 20 s image check. A candidate that times out is skipped, not retried.
import {
  mkdir,
  readdir,
  lstat,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import { connect } from "node:net";
import { join } from "node:path";
import { cli } from "cleye";
import { Result, errorMessage } from "../tools/shared/src/result.ts";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";

export const WSL_DIR = "/run/WSL";
export const PROBE_MS = 4_000;
export const BUDGET_MS = 12_000;
const ALIVE_MS = 1_000;
const POWERSHELL =
  "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
const CACHE_FILE = "wsl-interop-session.json";

/** What one powershell.exe run reports: its own session and every explorer.exe session. */
export type Probed = { session: number; explorer: number[] };

export type Deps = {
  /** Live-or-not socket files, newest first, symlink aliases removed. */
  sockets: () => Promise<string[]>;
  /** True when a connect() to the socket is accepted. Spawns nothing. */
  alive: (socket: string) => Promise<boolean>;
  /** Run powershell.exe through the socket; null on failure or after `ms`. */
  probe: (socket: string, ms: number) => Promise<Probed | null>;
  /** The active console session, asked through the socket; null on failure. */
  consoleSession: (socket: string, ms: number) => Promise<number | null>;
  readCache: () => Promise<string | null>;
  writeCache: (socket: string) => Promise<void>;
  now: () => number;
  probeMs?: number;
  budgetMs?: number;
};

/** A chosen socket, or why none qualifies — a value, because this repo bans `throw`. */
export type Selection =
  | { ok: true; socket: string }
  | { ok: false; reason: string };

/** Resolve `work`, or null once `ms` has passed — the bound holds even if `work` never settles. */
function within<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const handle = setTimeout(
      () => {
        resolve(null);
      },
      Math.max(ms, 0),
    );
    const settle = (value: T | null) => {
      clearTimeout(handle);
      resolve(value);
    };
    void work.then(settle, () => {
      settle(null);
    });
  });
}

type Target = { ok: true; session: number } | { ok: false; reason: string };

/** The session to serve: the only explorer.exe session, or with several the active console one. */
async function targetSession(
  deps: Deps,
  explorer: number[],
  socket: string,
  ms: number,
): Promise<Target> {
  const sessions = [...new Set(explorer)];
  const only = sessions[0];
  if (only === undefined) {
    return {
      ok: false,
      reason: "explorer.exe is not running: no interactive desktop session",
    };
  }
  if (sessions.length === 1) return { ok: true, session: only };
  const active = await within(deps.consoleSession(socket, ms), ms);
  if (active === null) {
    return {
      ok: false,
      reason: `explorer.exe runs in sessions ${sessions.join(",")} and the active console session is unknown`,
    };
  }
  return { ok: true, session: active };
}

export async function selectSocket(deps: Deps): Promise<Selection> {
  const probeMs = deps.probeMs ?? PROBE_MS;
  const budgetMs = deps.budgetMs ?? BUDGET_MS;
  const start = deps.now();
  const left = () => budgetMs - (deps.now() - start);
  const candidates = await deps.sockets();

  const cached = await deps.readCache();
  if (
    cached !== null &&
    candidates.includes(cached) &&
    (await within(deps.alive(cached), ALIVE_MS)) === true
  ) {
    return { ok: true, socket: cached };
  }

  let target: number | null = null;
  const notes: string[] = [];
  for (const socket of candidates) {
    if (left() <= 0) {
      notes.push(`budget ${budgetMs} ms spent before ${socket}`);
      break;
    }
    if ((await within(deps.alive(socket), ALIVE_MS)) !== true) {
      notes.push(`${socket}: refused connect`);
      continue;
    }
    const probed = await within(
      deps.probe(socket, Math.min(probeMs, left())),
      Math.min(probeMs, left()),
    );
    if (probed === null) {
      notes.push(`${socket}: probe failed or timed out`);
      continue;
    }
    const wanted: Target =
      target === null
        ? await targetSession(
            deps,
            probed.explorer,
            socket,
            Math.min(probeMs, left()),
          )
        : { ok: true as const, session: target };
    if (!wanted.ok) return wanted;
    target = wanted.session;
    if (probed.session === target) {
      await deps.writeCache(socket).catch(() => null);
      return { ok: true, socket };
    }
    notes.push(`${socket}: session ${probed.session}, want ${target}`);
  }
  return {
    ok: false,
    reason: `no live ${WSL_DIR}/*_interop socket runs in the desktop session${target === null ? "" : ` ${target}`}: ${notes.length === 0 ? "no sockets" : notes.join("; ")}`,
  };
}

// ── real dependencies ────────────────────────────────────────────────────────────────────────

export async function listSockets(dir = WSL_DIR): Promise<string[]> {
  const names = (await readdir(dir).catch(() => [])).filter((n) =>
    n.endsWith("_interop"),
  );
  const found: { path: string; mtime: number }[] = [];
  for (const name of names) {
    const path = join(dir, name);
    const info = await lstat(path).catch(() => null);
    if (info?.isSocket() === true) found.push({ path, mtime: info.mtimeMs });
  }
  return found.toSorted((a, b) => b.mtime - a.mtime).map((f) => f.path);
}

export function alive(socket: string, ms = ALIVE_MS): Promise<boolean> {
  return new Promise((resolve) => {
    const conn = connect(socket);
    const done = (ok: boolean) => {
      clearTimeout(timer);
      conn.destroy();
      resolve(ok);
    };
    const timer = setTimeout(() => {
      done(false);
    }, ms);
    conn.once("connect", () => {
      done(true);
    });
    conn.once("error", () => {
      done(false);
    });
  });
}

const PROBE_SCRIPT =
  '"{0}|{1}" -f (Get-Process -Id $PID).SessionId, ((Get-Process explorer -ErrorAction SilentlyContinue | ForEach-Object { $_.SessionId } | Sort-Object -Unique) -join ",")';
const CONSOLE_SCRIPT =
  "Add-Type -Namespace W -Name K -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint WTSGetActiveConsoleSessionId();'; [W.K]::WTSGetActiveConsoleSessionId()";

export function parseProbe(text: string): Probed | null {
  const m = /^(\d+)\|(\d*(?:,\d+)*)\s*$/u.exec(
    text.replaceAll("\r", "").trim(),
  );
  if (m === null) return null;
  const explorer =
    (m[2] ?? "") === "" ? [] : (m[2] ?? "").split(",").map(Number);
  return { session: Number(m[1]), explorer };
}

async function powershell(
  socket: string,
  script: string,
  ms: number,
): Promise<string | null> {
  const proc = Bun.spawn(
    [POWERSHELL, "-NoProfile", "-NonInteractive", "-Command", script],
    {
      env: { ...process.env, WSL_INTEROP: socket },
      stdout: "pipe",
      stderr: "pipe",
      timeout: ms,
      killSignal: "SIGKILL",
    },
  );
  const [out, , code] = await Promise.all([
    proc.stdout.text(),
    proc.stderr.text(),
    proc.exited,
  ]);
  return code === 0 ? out : null;
}

export async function probe(
  socket: string,
  ms: number,
): Promise<Probed | null> {
  const out = await powershell(socket, PROBE_SCRIPT, ms).catch(() => null);
  return out === null ? null : parseProbe(out);
}

export async function consoleSession(
  socket: string,
  ms: number,
): Promise<number | null> {
  const out = await powershell(socket, CONSOLE_SCRIPT, ms).catch(() => null);
  const n = out === null ? Number.NaN : Number(out.trim());
  return Number.isInteger(n) && n >= 0 && n < 0xffff_fff0 ? n : null;
}

const Cache = jsonOf(z.object({ socket: z.string() }));

export function fileCache(
  runtimeDir: string | undefined,
): Pick<Deps, "readCache" | "writeCache"> {
  if (runtimeDir === undefined || runtimeDir === "") {
    return {
      readCache: () => Promise.resolve(null),
      writeCache: () => Promise.resolve(),
    };
  }
  const path = join(runtimeDir, CACHE_FILE);
  return {
    readCache: async () => {
      const text = await readFile(path, "utf8").catch(() => null);
      const parsed = text === null ? null : Cache.safeParse(text);
      return parsed?.success === true ? parsed.data.socket : null;
    },
    writeCache: async (socket) => {
      await mkdir(runtimeDir, { recursive: true });
      const tmp = `${path}.${process.pid}`;
      await writeFile(tmp, JSON.stringify({ socket }), { mode: 0o600 });
      await rename(tmp, path);
    },
  };
}

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`FATAL: unknown option '--${flag}'\n`);
    process.exit(2);
  }
}

async function main(): Promise<number> {
  const parsed = cli({
    name: "wsl-interop-session.ts",
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    parameters: [],
    help: {
      description:
        "Print the live /run/WSL/*_interop socket whose powershell.exe runs in the interactive desktop session (explorer.exe's).",
    },
  });
  if (parsed._.length > 0) {
    process.stderr.write("wsl-interop-session: takes no arguments\n");
    return 2;
  }
  const result = await Result.tryPromise({
    try: () =>
      selectSocket({
        sockets: () => listSockets(),
        alive,
        probe,
        consoleSession,
        ...fileCache(process.env["XDG_RUNTIME_DIR"]),
        now: () => performance.now(),
      }),
    catch: (e: unknown) => e,
  });
  const outcome: Selection = result.isOk()
    ? result.value
    : { ok: false, reason: errorMessage(result.error) };
  if (!outcome.ok) {
    process.stderr.write(`wsl-interop-session: ${outcome.reason}\n`);
    return 1;
  }
  process.stdout.write(`${outcome.socket}\n`);
  return 0;
}

if (import.meta.main) process.exit(await main());
