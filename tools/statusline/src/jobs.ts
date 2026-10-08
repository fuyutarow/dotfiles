import { ENRICHMENT_TIMEOUT_MS, execBounded } from "./bounded.ts";
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
function admittedName(tok: string[]): string | undefined {
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
  const name = (tok[i + 2] ?? "")
    .split("/")
    .pop()
    ?.replace(/\.resource\.json$/u, "");
  return name === "" ? undefined : name;
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
// Reparented to init AND still pointing at a Claude scratchpad: a driver (or a leaked helper)
// that outlived its session. Counted, never judged — deciding which orphan is "real work" is
// exactly the guess this segment exists to stop us making.
export function scanOutOfHarness(): {
  jobs: Admitted[];
  orphans: number;
  failed?: string; // set when `ps` itself failed: jobs/orphans are then unknown, not zero
} {
  // Tiger-Style bound (see the top-of-file note): a `ps` snapshot of the WHOLE process table
  // has no reason to be instant on a heavily loaded host, and this call used to have no
  // timeout at all.
  // `etime`, not `etimes`: etimes (plain seconds) is a procps extension that macOS's BSD ps
  // rejects ("etimes: keyword not found", exit 1), while etime exists in both — one call for
  // both OSes, parsed by etimeSecs().
  const rawResult = execBounded(
    "ps",
    "ps",
    ["-eo", "ppid=,etime=,args="],
    ENRICHMENT_TIMEOUT_MS,
  );
  // no ps / timed out: say so. This used to return an empty scan, which rendered as "no jobs".
  if (rawResult.isErr())
    return { jobs: [], orphans: 0, failed: rawResult.error.why };
  const raw = rawResult.value;
  const jobs: Admitted[] = [];
  let orphans = 0;
  for (const line of raw.split("\n")) {
    // .match(), not RegExp.prototype.exec(): this file imports node:child_process, and the
    // writing-bun-scripts floor (F4) fails any such file that also carries the token `exec(`.
    const m = line.match(/^\s*(\d+)\s+([\d:-]+)\s+(\S.*)$/u);
    if (m === null) continue;
    const [, ppid, etime, args] = m;
    // All three are non-optional capture groups, so a successful match always has them;
    // this guard exists only for noUncheckedIndexedAccess, never actually taken.
    if (ppid === undefined || etime === undefined || args === undefined)
      continue;
    const name = admittedName(args.split(/\s+/u));
    const secs = etimeSecs(etime);
    if (name !== null && name !== undefined && secs !== undefined)
      jobs.push({ name, secs });
    else if (ppid === "1" && args.includes("/scratchpad/")) orphans++;
  }
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
export function admittedJobSegment(jobs: Admitted[], orphans: number): string {
  const first = jobs[0];
  const more = jobs.length > 1 ? `${DIM}+${jobs.length - 1}${RST}` : "";
  // Guaranteed by the length check above; only noUncheckedIndexedAccess can't see that.
  let seg =
    first !== undefined ? ` ${first.name}${more} ${dur(first.secs)}` : "";
  if (orphans > 0) seg += ` ${DIM}orphan×${orphans}${RST}`;
  return seg;
}
