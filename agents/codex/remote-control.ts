// Codex remote control as a DECLARED state: agents/codex/app-server.toml owns the value; this
// module reads it and compares it with the machine. No side effects — the converger
// (codex-remote-control.ts) and the doctor (scripts/doctor.ts, codex-remote) both import it.
//
// The machine holds the state in two places, and both can drift independently:
//   persisted  ~/.codex/app-server-daemon/settings.json `remoteControlEnabled` — what the managed
//              daemon is started with next time. ABSENT counts as off: the 0.159.3 self-update
//              restarted the daemon with initial_desired_state=Disabled while the file did not
//              exist (measured 2026-10-01).
//   running    the live daemon's argv carries `--remote-control` (pid from app-server.pid).
//              null = no daemon running, which is not drift: the next start reads `persisted`.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { jsonOf, z } from "../hooks/zod.ts";
import { attempt } from "../hooks/attempt.ts";

const RecordSchema = z.record(z.string(), z.unknown());

export type Live = { persisted: boolean; running: boolean | null };

const DAEMON_DIR = (home: string) => join(home, ".codex/app-server-daemon");

/** The declared value, or an Error naming the broken declaration (fail closed). */
export async function readDeclared(dotfiles: string): Promise<boolean | Error> {
  const path = join(dotfiles, "agents/codex/app-server.toml");
  const r = await attempt((): unknown =>
    Bun.TOML.parse(readFileSync(path, "utf8")),
  );
  if (!r.ok) return new Error(`${path}: unreadable or not TOML`);
  const table = RecordSchema.safeParse(r.value);
  if (!table.success) return new Error(`${path}: unreadable or not TOML`);
  const v = table.data.remote_control;
  return typeof v === "boolean"
    ? v
    : new Error(`${path}: remote_control must be true or false`);
}

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  if (!existsSync(path)) return null;
  const r = await attempt(() => readFileSync(path, "utf8"));
  if (!r.ok) return null;
  const parsed = jsonOf(RecordSchema).safeParse(r.value);
  return parsed.success ? parsed.data : null;
}

/** The machine's state; `running` is null when no managed daemon is alive. */
export async function readLive(home: string): Promise<Live> {
  const settings = await readJson(join(DAEMON_DIR(home), "settings.json"));
  const pidFile = await readJson(join(DAEMON_DIR(home), "app-server.pid"));
  const persisted = settings?.remoteControlEnabled === true;
  const pid = pidFile?.pid;
  if (typeof pid !== "number") return { persisted, running: null };
  // `ps -o args=` is the same on Linux and macOS; a dead pid prints nothing and exits 1.
  const proc = Bun.spawn(["ps", "-o", "args=", "-p", String(pid)], {
    stdout: "pipe",
    stderr: "ignore",
    timeout: 10_000,
  });
  const [args, code] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  if (code !== 0 || !args.includes("app-server"))
    return { persisted, running: null };
  return { persisted, running: args.split(/\s+/).includes("--remote-control") };
}

/** Human-readable drift lines; empty = the machine matches the declaration. */
export function drift(declared: boolean, live: Live): string[] {
  const out: string[] = [];
  if (live.persisted !== declared)
    out.push(
      `persisted remoteControlEnabled=${live.persisted}, declared ${declared}`,
    );
  if (live.running !== null && live.running !== declared)
    out.push(
      `running daemon remote control=${live.running}, declared ${declared}`,
    );
  return out;
}
