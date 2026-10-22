// Stop / PostToolUse — one session-attributed fleet line via bounded agx status --json.
// agx owns state discovery and freshness; this hook consumes only its public CLI.
// Fail-open: unavailable state is a diagnostic, never a gate. Stop always emits;
// PostToolUse retains its one-minute cadence. Cadence write failures cannot hide a line.

import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { attempt, errorMessage } from "../../hooks/attempt.ts";
import { parseJson, strAt } from "../../hooks/narrow.ts";
import { jsonOf, z } from "../../hooks/zod.ts";
import { hookJson } from "./lib.ts";
import {
  FleetSessionSchema,
  FleetSessionUnavailableSchema,
  readFleetSession,
  type FleetSession,
} from "../../../tools/shared/src/fleet-session.ts";

const MIN_GAP_MS = 60_000;
// Leave room for CLI startup, but cap a hung status command's impact on the session.
const STATUS_TIMEOUT_MS = 500;
const nonEmpty = (v: string | undefined): string | undefined =>
  v !== undefined && v !== "" ? v : undefined;
const oneLine = (text: string): string =>
  text.replaceAll(/[\r\n\u2028\u2029]/gu, " ");

const unavailable = (value: unknown) =>
  `n/a (${FleetSessionUnavailableSchema.safeParse(value).data?.why ?? "not recorded"})`;

function sessionRows(session: FleetSession): string[] {
  const ctx = FleetSessionSchema.shape.ctx.options[0].safeParse(session.ctx);
  let context = `Ctx: ${unavailable(session.ctx)}`;
  if (ctx.success) {
    const { tokens, pct } = ctx.data;
    const shown =
      tokens < 1000 ? `${tokens}` : `${Math.round(tokens / 100) / 10}k`;
    context = `Ctx: ${shown} ${pct}%`;
  }
  const rate = FleetSessionSchema.shape.rate.options[0].safeParse(session.rate);
  const usage = rate.success
    ? `Rate: 5h ${rate.data.five_h_pct}% · 7d ${rate.data.seven_d_pct}%`
    : `Rate: ${unavailable(session.rate)}`;
  return [context, usage].map((row) => oneLine(row));
}

const Run = z.looseObject({
  id: z.string().min(1),
  state: z.string(),
  dispatcher_session: z.string().nullable(),
  vendor_session: z.string().nullable().optional(),
  ticket: z.string().optional(),
  row: z.string().optional(),
  judgment: z.unknown().optional(),
});
const Status = jsonOf(
  z.object({
    schema: z.literal(1),
    runs: z.object({
      source: z.enum(["current", "stale", "unknown"]),
      reason: z.string().nullable(),
      rows: z.array(Run).nullable(),
    }),
  }),
);

function describe(sid: string, cwd: string): string {
  const agx = Bun.which("agx");
  if (agx === null) return "n/a (agx not found on PATH)";
  // sync-ok: one bounded CLI read in a short-lived hook; no npm dependencies.
  const result = spawnSync(agx, ["status", "--json", "--cwd", cwd], {
    encoding: "utf8",
    timeout: STATUS_TIMEOUT_MS,
    killSignal: "SIGKILL",
    maxBuffer: 1024 * 1024,
  });
  if (result.error !== undefined) {
    if (
      z.object({ code: z.literal("ETIMEDOUT") }).safeParse(result.error).success
    )
      return `n/a (agx status timed out after ${STATUS_TIMEOUT_MS} ms)`;
    return `n/a (${oneLine(errorMessage(result.error))})`;
  }
  if (result.status !== 0)
    return oneLine(
      `n/a (agx status exited ${result.status ?? result.signal}: ${result.stderr.slice(0, 1024).trim()})`,
    );
  const status = Status.safeParse(result.stdout);
  if (!status.success) return "n/a (invalid agx status JSON)";
  const { source, reason, rows } = status.data.runs;
  if (source !== "current" || rows === null)
    return oneLine(`n/a (${reason ?? `agx status runs ${source}`})`);
  const mine = rows.filter((run) => run.dispatcher_session === sid);
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
  const result = await attempt(() =>
    Promise.resolve(
      sid === undefined
        ? "n/a (session id not supplied)"
        : describe(sid, nonEmpty(strAt(payload, "cwd")) ?? process.cwd()),
    ),
  );
  const body = result.ok
    ? result.value
    : `n/a (${oneLine(errorMessage(result.error))})`;
  const session = FleetSessionSchema.safeParse(
    sid === undefined ? undefined : await readFleetSession(sid),
  );
  const rows = session.success ? sessionRows(session.data) : [];
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
