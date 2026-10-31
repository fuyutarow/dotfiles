import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { jsonOf, z } from "./zod.ts";
import { execAsyncBounded } from "./bounded.ts";
import { DIM, RST } from "./ansi.ts";
import { pad2 } from "./prompt-stamp.ts";

// --- Out-of-harness work: work running OUTSIDE the harness, the window Claude Code itself
// cannot draw. A child started with setsid/nohup is reparented to PID 1, so the background-task
// tracker never sees it: no TUI row, no TaskOutput, no exit notification, and it outlives the
// session (even the project) that spawned it. ONE `ps` pass answers both halves below. ---
export interface Admitted {
  name: string;
  secs: number;
}
// argv[0] itself, or argv[1] under a runtime/wrapper — never a match buried deeper in the
// line. Without that position rule, any shell, pgrep or awk whose COMMAND STRING merely
// mentions agent-resource-run would report itself as a running job.
const RUNTIME = new Set(["bun", "node", "deno", "taskset", "systemd-run"]);
// -> the manifest's job name, or undefined when this line is not an admission.
function admittedManifest(tok: string[]): string | undefined {
  const i = tok.findIndex(
    (t) => t === "agent-resource-run" || t.endsWith("/agent-resource-run"),
  );
  if (i < 0 || i > 1) return undefined;
  if (i === 1) {
    const first = tok[0];
    // i === 1 means tok has at least 2 elements, so tok[0] is always defined here;
    // the check is only for noUncheckedIndexedAccess, not a reachable runtime case.
    if (first === undefined || !RUNTIME.has(first.split("/").pop() ?? ""))
      return undefined;
  }
  if (tok[i + 1] !== "--manifest") return undefined;
  const path = tok[i + 2];
  return path === "" ? undefined : path;
}
// Keep the scan responsive even for a slow filesystem; never read more than 64 KiB.
const MANIFEST_LIMIT = 64 * 1024;
const MANIFEST_TIMEOUT_MS = 100;
const ManifestLabel = jsonOf(
  z.object({ job_id: z.string().trim().min(1).max(80) }),
);
async function manifestLabel(path: string): Promise<string> {
  const fallback = basename(dirname(path));
  const read = async (): Promise<string> => {
    await using file = await open(
      path,
      constants.O_RDONLY | constants.O_NONBLOCK,
    );
    const buffer = Buffer.alloc(MANIFEST_LIMIT + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MANIFEST_LIMIT) return fallback;
    const parsed = ManifestLabel.safeParse(
      buffer.subarray(0, bytesRead).toString("utf8"),
    );
    return parsed.success ? parsed.data.job_id : fallback;
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    read().catch(() => fallback),
    new Promise<string>((resolve) => {
      timer = setTimeout(() => {
        resolve(fallback);
      }, MANIFEST_TIMEOUT_MS);
    }),
  ]).finally(() => {
    clearTimeout(timer);
  });
}
function cachedLabel(
  path: string,
  labels: Map<string, Promise<string>>,
): Promise<string> {
  const existing = labels.get(path);
  if (existing !== undefined) return existing;
  const label = manifestLabel(path);
  labels.set(path, label);
  return label;
}
// ps's `etime`, "[[dd-]hh:]mm:ss" on both procps and BSD ps, in seconds. A bare number is taken as
// seconds (etimes' shape), so a recorded etimes line still reads. undefined: not that shape.
function etimeSecs(etime: string): number | undefined {
  const m = etime.match(/^(?:(?:(\d+)-)?(\d+):)?(?:(\d+):)?(\d+)$/u);
  if (m === null) return undefined;
  const [, dd, a, b, last] = m;
  if (b === undefined && a === undefined) return Number(last); // "ss" alone: plain seconds
  // "mm:ss" matches a=mm (b unset); "hh:mm:ss" matches a=hh, b=mm.
  const [hh, mm] = b === undefined ? [0, Number(a)] : [Number(a), Number(b)];
  return Number(dd ?? 0) * 86_400 + hh * 3_600 + mm * 60 + Number(last);
}
/** Render-path variant: the process-table scan is asynchronous and time bounded. */
export async function scanOutOfHarnessAsync(): Promise<{
  jobs: Admitted[];
  orphans: number;
  failed?: string;
}> {
  const rawResult = await execAsyncBounded(
    "ps",
    "ps",
    ["-eo", "ppid=,etime=,args="],
    2000,
  );
  if (rawResult.isErr())
    return { jobs: [], orphans: 0, failed: rawResult.error.why };
  const jobs: Admitted[] = [];
  let orphans = 0;
  const labels = new Map<string, Promise<string>>();
  const pending: Promise<void>[] = [];
  for (const line of rawResult.value.split("\n")) {
    const m = line.match(/^\s*(\d+)\s+([\d:-]+)\s+(\S.*)$/u);
    if (m === null) continue;
    const [, ppid, etime, args] = m;
    if (ppid === undefined || etime === undefined || args === undefined)
      continue;
    const path = admittedManifest(args.split(/\s+/u));
    const secs = etimeSecs(etime);
    if (path !== undefined && secs !== undefined) {
      const label = cachedLabel(path, labels);
      pending.push(
        label.then((name) => {
          jobs.push({ name, secs });
        }),
      );
    } else if (ppid === "1" && args.includes("/scratchpad/")) orphans++;
  }
  await Promise.all(pending);
  return { jobs, orphans };
}
// elapsed: <h>h<mm>m past an hour, else <m>m<ss>s — same shape as the rate-limit countdowns.
export const dur = (s: number) =>
  s >= 3600
    ? `${Math.floor(s / 3600)}h${pad2(Math.floor((s % 3600) / 60))}m`
    : `${Math.floor(s / 60)}m${pad2(s % 60)}s`;
// to keep its nesting under max-depth. `orphan` spelled out (it was `det×N`, which named nothing
// a reader could look up): a process reparented to init that still points at a Claude scratchpad.
// VRAM used to ride this segment (only while a job was admitted); it now lives unconditionally
// on the Sys row instead, so it is not repeated here.
export const JOBS_SHOWN = 3;
/** The one Job entry format, for every session and every source: `<name> <elapsed>`. */
export const jobEntry = (job: Admitted): string =>
  `${job.name} ${dur(job.secs)}`;
export function admittedJobSegment(jobs: Admitted[], orphans: number): string {
  // The same host shows the same line in every session: oldest job first, ties by name, so
  // scan order never decides which job a session names.
  const ordered = jobs.toSorted((a, b) =>
    a.secs === b.secs ? a.name.localeCompare(b.name) : b.secs - a.secs,
  );
  const shown = ordered.slice(0, JOBS_SHOWN).map((job) => jobEntry(job));
  const hidden = ordered.length - shown.length;
  let seg = shown.length > 0 ? ` ${shown.join(" ")}` : "";
  if (hidden > 0) seg += ` ${DIM}+${hidden}${RST}`;
  if (orphans > 0) seg += ` ${DIM}orphan×${orphans}${RST}`;
  return seg;
}
