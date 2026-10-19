// Stop / PostToolUse — one session-attributed fleet line, without spawning agx.
// Read agx's owner publication, not the retired statusline presentation cache.
// Fail-open: unavailable state is a diagnostic, never a gate. Stop always emits;
// PostToolUse retains its one-minute cadence. Cadence write failures cannot hide a line.

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { attempt, errorMessage } from "../../hooks/attempt.ts";
import { parseJson, strAt } from "../../hooks/narrow.ts";
import { jsonOf, z } from "../../hooks/zod.ts";
import { hookJson } from "./lib.ts";
import {
  fleetSessionRows,
  readFleetSession,
} from "../../../tools/shared/src/fleet-session.ts";

const MIN_GAP_MS = 60_000;
const nonEmpty = (v: string | undefined): string | undefined =>
  v !== undefined && v !== "" ? v : undefined;
const oneLine = (text: string): string =>
  text.replaceAll(/[\r\n\u2028\u2029]/gu, " ");

// Same owner path as agx-run/store.ts. The statusline reader also consumes this
// publication, but imports npm dependencies; hooks must work before bun install.
const stateDir =
  nonEmpty(process.env.AGX_NEXT_STATE_DIR) ??
  nonEmpty(process.env.AGX_STATE_DIR) ??
  join(process.env.HOME ?? homedir(), ".local/state/agx-next");
const Run = z.looseObject({
  id: z.string().min(1),
  state: z.string(),
  dispatcher_session: z.string().nullable(),
  vendor_session: z.string().nullable().optional(),
  ticket: z.string().optional(),
  row: z.string().optional(),
  judgment: z.unknown().optional(),
});
const Runs = z.array(Run);
const Snapshot = jsonOf(
  z.object({
    output: jsonOf(z.union([Runs, z.object({ runs: Runs })])),
    capturedAt: z.number(),
    exit: z.literal(0),
  }),
);

async function describe(sid: string): Promise<string> {
  const path = join(stateDir, "current-runs.json");
  const read = await attempt(() => readFile(path, "utf8"));
  if (!read.ok) return `n/a (${oneLine(errorMessage(read.error))})`;
  const snapshot = Snapshot.safeParse(read.value);
  if (!snapshot.success) return "n/a (invalid current-runs.json)";
  // Owner publications expire on a newer event, not merely on wall-clock age.
  const [published, records] = await Promise.all([
    stat(path),
    stat(join(stateDir, "records.jsonl")).catch(() => null),
  ]);
  if (records !== null && published.mtimeMs < records.mtimeMs)
    return "n/a (current-runs.json predates records.jsonl)";
  const output = snapshot.data.output;
  const mine = (Array.isArray(output) ? output : output.runs).filter(
    (run) => run.dispatcher_session === sid,
  );
  const running = mine.filter((run) => run.state === "running");
  const ended = mine.filter(
    (run) => run.state === "ended" && (run.judgment ?? null) === null,
  ).length;
  const orphaned = mine.filter((run) => run.state === "orphaned").length;
  const counts = [
    `${running.length} running`,
    ...(ended > 0 ? [`${ended} ended-unjudged`] : []),
    ...(orphaned > 0 ? [`orphaned ${orphaned}`] : []),
  ];
  const entries = running.map((run) => {
    const ticket = basename(run.ticket ?? run.id).replace(/\.md$/u, "");
    const vendor =
      nonEmpty(run.vendor_session ?? undefined) ?? "n/a (not recorded)";
    return `${run.id.slice(0, 8)} ${ticket}${run.row === undefined ? "" : ` ${run.row}`} vendor_session=${vendor}`;
  });
  return oneLine(
    `${counts.join(" · ")}${entries.length === 0 ? "" : ` | ${entries.join(" · ")}`}`,
  );
}

async function main(): Promise<void> {
  const payload = parseJson(await Bun.stdin.text());
  const event = strAt(payload, "hook_event_name");
  if (event !== "Stop" && event !== "PostToolUse") return;
  const sid =
    nonEmpty(strAt(payload, "session_id")) ??
    nonEmpty(strAt(payload, "thread_id")) ??
    nonEmpty(process.env.CLAUDE_CODE_SESSION_ID) ??
    nonEmpty(process.env.CODEX_THREAD_ID) ??
    nonEmpty(process.env.CODEX_SESSION_ID);
  const now = Temporal.Now.instant().epochMilliseconds;
  const key = (sid ?? "unknown").replaceAll(/[^A-Za-z0-9_-]/gu, "_");
  const cadenceDir = join(
    process.env.HOME ?? homedir(),
    ".cache/claude/agx-log",
  );
  const cadence = join(cadenceDir, `${key}.last`);
  if (event === "PostToolUse") {
    const last = await attempt(async () =>
      Number(await readFile(cadence, "utf8")),
    );
    if (last.ok && Number.isFinite(last.value) && now - last.value < MIN_GAP_MS)
      return;
  }
  const result = await attempt(async () =>
    sid === undefined ? "n/a (session id not supplied)" : describe(sid),
  );
  const body = result.ok
    ? result.value
    : `n/a (${oneLine(errorMessage(result.error))})`;
  const session = sid === undefined ? undefined : await readFleetSession(sid);
  const rows = session === undefined ? [] : fleetSessionRows(session);
  process.stdout.write(
    `${hookJson({ systemMessage: [`Agx: session=${oneLine(sid ?? "n/a (not supplied)")}`, ...rows, body].join(" | ") })}\n`,
  );
  await attempt(async () => {
    await mkdir(cadenceDir, { recursive: true });
    await writeFile(cadence, `${now}\n`);
  });
}

await main();
process.exit(0);
