// Bounded subprocess calls and atomic cache files, shared by the statusline and host-load.ts.
// Split out of the former Claude statusline (2026-10-06); the render budget below starts when this module
// is first loaded, which is process start for both consumers — the same moment as before.
import { mkdir, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { err, fromThrowable, ok, type Result } from "neverthrow";
import { jsonOf, z } from "./zod.ts";

export const recoverInvalid = <T extends z.ZodType>(schema: T) =>
  schema.optional().catch(undefined);
// A sampler probe may redirect its own state without touching deployed host caches.
function cachePath(path: string): string {
  const root = process.env["STATUSLINE_CACHE_ROOT"];
  const prefix = `${process.env["HOME"] ?? ""}/.cache/claude/`;
  return root !== undefined && path.startsWith(prefix)
    ? join(root, path.slice(prefix.length))
    : path;
}
/** Async counterpart for the render path; unreadable or invalid files remain unknown. */
export async function readJsonAsync<S extends z.ZodType>(
  path: string,
  schema: S,
  resolveCache = true,
): Promise<z.output<S> | undefined> {
  if (resolveCache) path = cachePath(path);
  const text = await Bun.file(path)
    .text()
    .catch(() => null);
  if (text === null) return undefined;
  const checked = jsonOf(schema).safeParse(text);
  return checked.success ? checked.data : undefined;
}
// Tiger-Style bound (see the header note above): the timeout shared by every "nice-to-have
// enrichment" subprocess call in buildDataframe() that is not already governed by its own
// specific number (agentName's 3000ms for `claude agents --json`, herdrSend's 200ms socket timer).
export const ENRICHMENT_TIMEOUT_MS = 2000;
// What execFile's error carries, parsed rather than probed with `in`/`typeof`. Each
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
export let RENDER_T0 = performance.now();
export function resetRenderBudget(): void {
  RENDER_T0 = performance.now();
}
export interface ExecFailure {
  why: string; // the n/a reason, from failWhy
  stderr: string; // trimmed; "" when the child printed none or never started
  ran: boolean; // false: never started (budget spent) — says nothing about the tool, so never cache it
  stdout?: string;
}
/** Run a child without blocking the event loop, killing it when its signal deadline expires. */
export async function execAsyncWithin(
  tool: string,
  file: string,
  args: string[],
  boundMs: number,
  env?: NodeJS.ProcessEnv,
): Promise<Result<string, ExecFailure>> {
  const timeout = AbortSignal.timeout(boundMs);
  const started = fromThrowable(() =>
    Bun.spawn({
      cmd: [file, ...args],
      ...(env !== undefined ? { env } : {}),
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      signal: timeout,
    }),
  )();
  if (started.isErr())
    return err({
      why: failWhy(started.error, tool, boundMs),
      stderr: "",
      ran: true,
    });
  const child = started.value;
  const completed = Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]).then(([stdout, stderr, status]) => ({
    kind: "complete" as const,
    stdout,
    stderr,
    status,
  }));
  let onAbort: (() => void) | undefined;
  const deadline = new Promise<{ kind: "timeout" }>((resolve) => {
    onAbort = () => {
      resolve({ kind: "timeout" });
    };
    timeout.addEventListener("abort", onAbort, { once: true });
  });
  const outcome = await Promise.race([completed, deadline]);
  if (onAbort !== undefined) timeout.removeEventListener("abort", onAbort);
  if (outcome.kind === "timeout") {
    child.kill("SIGKILL");
    return err({ why: `${tool} timeout ${boundMs}ms`, stderr: "", ran: true });
  }
  const { stdout, stderr, status } = outcome;
  const trimmed = stderr.trim();
  if (timeout.aborted)
    return err({
      why: `${tool} timeout ${boundMs}ms`,
      stderr: trimmed,
      ran: true,
    });
  if (status !== 0)
    return err({
      why: `${tool} exit ${status}`,
      stderr: trimmed,
      ran: true,
      stdout,
    });
  return ok(stdout);
}
/** Apply a child bound and the remaining whole-render budget. */
export function execAsyncRenderBounded(
  tool: string,
  file: string,
  args: string[],
  ownBoundMs: number,
  env?: NodeJS.ProcessEnv,
): Promise<Result<string, ExecFailure>> {
  const left = RENDER_BUDGET_MS - (performance.now() - RENDER_T0);
  if (left <= 0)
    return Promise.resolve(
      err({
        why: `${tool} not run, render budget ${RENDER_BUDGET_MS}ms spent`,
        stderr: "",
        ran: false,
      }),
    );
  return execAsyncWithin(
    tool,
    file,
    args,
    Math.min(ownBoundMs, Math.ceil(left)),
    env,
  );
}
/** Apply the standard enrichment cap as well as the whole-render budget. */
export function execAsyncBounded(
  tool: string,
  file: string,
  args: string[],
  ownBoundMs: number,
  env?: NodeJS.ProcessEnv,
): Promise<Result<string, ExecFailure>> {
  return execAsyncRenderBounded(
    tool,
    file,
    args,
    Math.min(ownBoundMs, ENRICHMENT_TIMEOUT_MS),
    env,
  );
}
/** Atomic best-effort cache write for async render sources. */
export async function writeCacheAsync(
  path: string,
  value: unknown,
  resolveCache = true,
): Promise<void> {
  if (resolveCache) path = cachePath(path);
  const tmp = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await mkdir(dirname(path), { recursive: true })
    .then(() => Bun.write(tmp, JSON.stringify(value)))
    .then(() => rename(tmp, path))
    .catch(async () => {
      await unlink(tmp).catch(() => null);
    });
}
// A timestamp is "within" a window only if it is not in the future: a clock stepped backwards
// (WSL2 time sync after sleep) must not keep an old entry fresh for hours or print a negative age.
export function within(at: number, now: number, windowMs: number): boolean {
  return now - at >= 0 && now - at < windowMs;
}
