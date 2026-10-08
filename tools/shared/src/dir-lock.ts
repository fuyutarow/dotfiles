// A cross-process, cross-session lock that works the same on Linux and macOS (no flock(1) there):
// whoever creates the lock DIRECTORY owns it, and writes who it is inside it. A holder whose pid
// is gone (same host) left a stale lock, which the next caller takes over — a crash never wedges
// it. A busy lock is waited for, not refused. Zero-dep (node: + the committed bundle).

import {
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fromThrowable, jsonOf, z } from "./zod.ts";

const HolderSchema = z.looseObject({
  pid: z.number().int(),
  host: z.string(),
  what: z.string(),
  since: z.string(),
});
export type Holder = z.output<typeof HolderSchema>;

const ownerFile = (lock: string): string => join(lock, "owner.json");

/** The holder recorded in `lock`, or undefined (none, or still being written). */
export function holderOf(lock: string): Holder | undefined {
  const text = fromThrowable(() => readFileSync(ownerFile(lock), "utf8"))();
  if (text.isErr()) return undefined;
  const parsed = jsonOf(HolderSchema).safeParse(text.value);
  return parsed.success ? parsed.data : undefined;
}

/** Is `pid` a live process on this host? Signal 0 probes without signalling; EPERM = alive. */
export function pidAlive(pid: number): boolean {
  const probe = fromThrowable(() => process.kill(pid, 0))();
  if (probe.isOk()) return true;
  const parsed = z.object({ code: z.string() }).safeParse(probe.error);
  return parsed.success && parsed.data.code === "EPERM";
}

/** A lock whose holder is dead (same host), or that has had no holder for `graceMs`. */
export function isStale(lock: string, host: string, graceMs: number): boolean {
  const holder = holderOf(lock);
  if (holder !== undefined)
    return holder.host === host && !pidAlive(holder.pid);
  const stat = fromThrowable(() => statSync(lock))();
  return (
    stat.isOk() &&
    Temporal.Now.instant().epochMilliseconds - stat.value.mtimeMs > graceMs
  );
}

export type Acquired =
  | { readonly ok: true; readonly release: () => void }
  | { readonly ok: false; readonly holder: Holder | undefined };

/** One atomic attempt: take the lock (taking over a stale one), or report who holds it. */
export function tryAcquire(
  lock: string,
  me: Holder,
  graceMs = 10_000,
): Acquired {
  mkdirSync(dirname(lock), { recursive: true });
  if (isStale(lock, me.host, graceMs))
    rmSync(lock, { recursive: true, force: true });
  const made = fromThrowable(() => {
    mkdirSync(lock, { mode: 0o700 });
  })();
  if (made.isErr()) return { ok: false, holder: holderOf(lock) };
  writeFileSync(ownerFile(lock), `${JSON.stringify(me)}\n`, { mode: 0o600 });
  return {
    ok: true,
    release: () => {
      if (holderOf(lock)?.pid === me.pid)
        rmSync(lock, { recursive: true, force: true });
    },
  };
}

export type WaitOptions = {
  waitMs?: number;
  pollMs?: number;
  graceMs?: number;
  onWait?: (holder: Holder | undefined) => void;
};
export type WaitResult = (() => void) | Holder | undefined;

/** Queue behind a live holder, retrying stale takeover until acquired or the wait expires. */
export async function acquire(
  lock: string,
  me: Holder,
  options: WaitOptions = {},
): Promise<WaitResult> {
  const waitMs = options.waitMs ?? 900_000;
  const pollMs = options.pollMs ?? 2_000;
  const deadline = Temporal.Now.instant().epochMilliseconds + waitMs;
  let notified = false;
  for (;;) {
    const result = tryAcquire(lock, me, options.graceMs);
    if (result.ok) return result.release;
    if (Temporal.Now.instant().epochMilliseconds >= deadline)
      return result.holder;
    if (!notified) {
      options.onWait?.(result.holder);
      notified = true;
    }
    await Bun.sleep(pollMs);
  }
}
