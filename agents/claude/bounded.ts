// Bounded subprocess calls and atomic cache files, shared by the statusline and host-load.ts.
// Split out of statusline-command.ts (2026-10-06); the render budget below starts when this module
// is first loaded, which is process start for both consumers — the same moment as before.
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { err, fromThrowable, type Result } from "neverthrow";
import { jsonOf, z } from "../hooks/zod.ts";

export const recoverInvalid = <T extends z.ZodType>(schema: T) =>
  schema.optional().catch(undefined);
export const defaultOnInvalid = <T extends z.ZodType>(
  schema: T,
  fallback: z.output<T>,
) => schema.catch(fallback);
// Read a JSON file and validate it. undefined = no usable file (missing, not JSON, or the wrong
// shape) — the caller treats that as "expired" or reports its own n/a; it is never an assertion.
export function readJson<S extends z.ZodType>(
  path: string,
  schema: S,
): z.output<S> | undefined {
  const text = fromThrowable(() => readFileSync(path, "utf8"))();
  if (text.isErr()) return undefined;
  const checked = jsonOf(schema).safeParse(text.value);
  return checked.success ? checked.data : undefined;
}
// Tiger-Style bound (see the header note above): the timeout shared by every "nice-to-have
// enrichment" subprocess call in buildDataframe() that is not already governed by its own
// specific number (agentName's 3000ms for `claude agents --json`, herdrSend's 200ms socket timer).
export const ENRICHMENT_TIMEOUT_MS = 2000;
// What execFileSync's thrown error carries, parsed rather than probed with `in`/`typeof`. Each
// field is read on its own (.catch): an error object that lacks or mangles one still yields the
// others, and the all-missing case falls through to the generic "<tool> failed" below.
export const ExecErrorSchema = z.object({
  code: recoverInvalid(z.string()),
  status: recoverInvalid(z.number().nullish()),
  signal: recoverInvalid(z.string().nullish()),
  stderr: recoverInvalid(z.string()),
});
export function execError(e: unknown): z.output<typeof ExecErrorSchema> {
  const parsed = ExecErrorSchema.safeParse(e);
  return parsed.success ? parsed.data : {};
}
// Why a bounded subprocess call failed, in the few words that tell a human what to fix: the tool
// is not installed, it hit its bound, it ran and exited non-zero, or a signal killed it.
export function failWhy(
  e: unknown,
  tool: string,
  timeoutMs: number = ENRICHMENT_TIMEOUT_MS,
): string {
  const x = execError(e);
  if (x.code === "ENOENT") return `no ${tool}`;
  if (x.code === "ETIMEDOUT") return `${tool} timeout ${timeoutMs}ms`;
  if (typeof x.status === "number") return `${tool} exit ${x.status}`;
  // Killed by a signal (an OOM kill under load has status null): name it.
  if (x.signal !== undefined && x.signal !== "")
    return `${tool} killed by ${x.signal}`;
  if (x.code !== undefined && x.code !== "") return `${tool} ${x.code}`;
  return `${tool} failed`;
}

// RENDER BUDGET (Tiger: bound the whole, not only each part). Every child below has its own
// bound (2 s, claude agents 3 s), but they run one after another: ps + git + nvidia-smi +
// claude agents hanging together is 9 s, longer than the 5 s statusLine.refreshInterval, so
// renders overlap and the bar itself piles load onto the host whose load made the children
// hang. All children share ONE deadline: each gets min(its own bound, what is left), and once
// nothing is left a child is not started — its segment prints n/a with that reason. Chosen as
// 4 s so the slowest possible render (budget + the 200 ms herdr push) ends inside one interval.
// performance.now(): monotonic, immune to a clock step, and defined on a bun without Temporal
// (the floor check at the bottom must still get to print its message).
export const RENDER_BUDGET_MS = 4000;
export const RENDER_T0 = performance.now();
export interface ExecFailure {
  why: string; // the n/a reason, from failWhy
  stderr: string; // trimmed; "" when the child printed none or never started
  ran: boolean; // false: never started (budget spent) — says nothing about the tool, so never cache it
}
// Run one child inside the render budget. stderr is captured (not discarded) so a caller can
// tell git's "not a git repository" from its other fatal errors.
export function execBounded(
  tool: string,
  file: string,
  args: string[],
  ownBoundMs: number,
  env?: NodeJS.ProcessEnv,
): Result<string, ExecFailure> {
  const left = RENDER_BUDGET_MS - (performance.now() - RENDER_T0);
  if (left <= 0) {
    return err({
      why: `${tool} not run, render budget ${RENDER_BUDGET_MS}ms spent`,
      stderr: "",
      ran: false,
    });
  }
  return execWithin(
    tool,
    file,
    args,
    Math.min(ownBoundMs, Math.ceil(left)),
    env,
  );
}
// One child under ONE bound, with no render budget in the way: the render path goes through
// execBounded above; the background GPU sampler (not a render) calls this directly.
export function execWithin(
  tool: string,
  file: string,
  args: string[],
  boundMs: number,
  env?: NodeJS.ProcessEnv,
): Result<string, ExecFailure> {
  return fromThrowable(
    () =>
      execFileSync(file, args, {
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf8",
        timeout: boundMs,
        ...(env !== undefined ? { env } : {}),
      }),
    (e): ExecFailure => ({
      why: failWhy(e, tool, boundMs),
      stderr: (execError(e).stderr ?? "").trim(),
      ran: true,
    }),
  )();
}
// Write a cache file so no reader ever sees half of it: the whole file goes to a private temp
// name and is renamed into place (atomic on one filesystem). A plain writeFileSync truncates
// first, and these files are read by every other session on the host every 5 s — a reader landing
// in the gap got invalid JSON, which reads as "no cache" (a false n/a, or an nvidia-smi spawn
// nobody needed). Best-effort like every cache write: a failure leaves the old file and no temp.
export function writeCache(path: string, value: unknown): void {
  const tmp = `${path}.${process.pid}.tmp`;
  fromThrowable(() => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(tmp, JSON.stringify(value));
    renameSync(tmp, path);
  })().mapErr(() => {
    fromThrowable(() => {
      unlinkSync(tmp);
    })();
  });
}
// A timestamp is "within" a window only if it is not in the future: a clock stepped backwards
// (WSL2 time sync after sleep) must not keep an old entry fresh for hours or print a negative age.
export function within(at: number, now: number, windowMs: number): boolean {
  return now - at >= 0 && now - at < windowMs;
}
