#!/usr/bin/env bun
// Stdin JSON -> the existing statusline bytes; no harness configuration cutover.
import { DIM, ESC, RST } from "./ansi.ts";
import { realpath } from "node:fs/promises";
import { execAsyncBounded, writeCacheAsync } from "./bounded.ts";
import { cli } from "cleye";
import { jsonText } from "./zod.ts";
import { ClaudeStatuslineInputSchema } from "./adapters/claude-statusline.ts";
import { readCodexSessionStatus } from "./adapters/codex-rollout.ts";
import type { SessionStatus } from "./session-status.ts";
import { promptParts } from "./prompt-stamp.ts";
import { coloredHead, render } from "./format.ts";
import { buildDataframe } from "./build-dataframe.ts";
import { readCodexRate } from "./codex-rate.ts";
import { sysSegment } from "./host-load.ts";
import { ctxSegment } from "./model-context.ts";
import { rateRow } from "./rate-limits.ts";

const HOME = process.env.HOME ?? "";
async function cwdForPid(pid: string): Promise<string | null> {
  const procCwd = await realpath(`/proc/${pid}/cwd`).catch(() => null);
  if (procCwd !== null) return procCwd;
  const lsof = Bun.which("lsof");
  if (lsof === null) return null;
  const info = await execAsyncBounded(
    "lsof",
    lsof,
    ["-a", "-p", pid, "-d", "cwd", "-Fn"],
    500,
  );
  return info.isOk()
    ? (info.value
        .split("\n")
        .find((line) => line.startsWith("n"))
        ?.slice(1) ?? null)
    : null;
}
async function codexSession(cwd?: string, pid?: string) {
  if (pid !== undefined && cwd !== undefined)
    return { session: null, error: "use only one of --pid or --cwd" };
  if (pid !== undefined && !/^[1-9]\d*$/u.test(pid))
    return { session: null, error: "--pid must be a positive process ID" };
  const selectedCwd = cwd ?? (pid === undefined ? null : await cwdForPid(pid));
  if (selectedCwd === null || selectedCwd === "")
    return { session: null, error: "--codex requires --pid or --cwd" };
  return {
    session: (await readCodexSessionStatus(selectedCwd)) ?? {
      cwd: selectedCwd,
    },
    error: null,
  };
}
function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`Error: unknown option '--${flag}'\n`);
    process.exit(2);
  }
}
const args = cli(
  {
    name: "statusline",
    parameters: [],
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    flags: {
      codex: {
        type: Boolean,
        description: "Read the newest Codex rollout for a pane",
      },
      pid: {
        type: String,
        description: "Codex process ID (used to read its cwd)",
      },
      cwd: { type: String, description: "Pane working directory" },
    },
  },
  undefined,
  Bun.argv.slice(2),
);
// --- entry: read stdin JSON, build the dataframe, render, write. Graceful: an invalid/missing
// JSON payload still renders line 1 (from $PWD, no dataframe needed) plus a hint. ---
// Runtime floor, checked before anything touches Temporal. Which bun runs this is NOT this
// repo's choice — Claude Code inherits the PATH of the directory it was launched from, and mise
// auto_install can re-create an old install there (see mise.toml / doctor's bun-floor). Without
// this line a sub-1.4 bun throws a ReferenceError and the bar goes silently blank; with it the
// bar names the cause.
if (typeof Temporal === "undefined") {
  process.stdout.write(
    `${ESC}[38;5;167mstatusline: bun ${Bun.version} has no Temporal (needs >= 1.4)${RST} ` +
      `${DIM}— which bun: ${Bun.which("bun") ?? "?"} · mise run doctor${RST}`,
  );
  process.exit(0);
}
let session: SessionStatus | undefined;
if (args.flags.codex === true) {
  const selected = await codexSession(args.flags.cwd, args.flags.pid);
  if (selected.error !== null) {
    process.stderr.write(`FATAL: ${selected.error}\n`);
    process.exit(2);
  }
  session = selected.session;
} else if (args.flags.pid !== undefined || args.flags.cwd !== undefined) {
  process.stderr.write("FATAL: --pid and --cwd require --codex\n");
  process.exit(2);
}
if (args.flags.codex !== true) {
  const raw = await Bun.stdin.text();
  // unknown -> ClaudeStatuslineInput at the trust boundary: parsed and normalized by its adapter.
  const json = jsonText.safeParse(raw);
  if (!json.success) {
    process.stdout.write(
      `${coloredHead(promptParts(process.env.PWD ?? ""))}\n`,
    );
    process.stdout.write(`${DIM}Model: ? | invalid statusline JSON${RST}`);
    process.exit(0);
  }
  const payload = ClaudeStatuslineInputSchema.safeParse(json.data);
  if (!payload.success) {
    const issue = payload.error.issues[0];
    const path = (issue?.path ?? []).map(String).join(".");
    const where = path !== "" ? path : "(root)";
    process.stdout.write(
      `${coloredHead(promptParts(process.env.PWD ?? ""))}\n`,
    );
    process.stdout.write(
      `${DIM}Model: ? | invalid statusline payload: ${where}: ${issue?.message ?? "?"}${RST}`,
    );
    process.exit(0);
  }
  session = payload.data;
}
const selectedSession = session;
const df =
  args.flags.codex === true && selectedSession?.sessionId !== undefined
    ? await buildDataframe(selectedSession, {
        sources: {
          codexRate: () => readCodexRate(undefined, selectedSession.sessionId),
        },
      })
    : await buildDataframe(session ?? {});
process.stdout.write(render(df));

// Hand the plain Sys row to hooks/log-sys-snapshot.ts, which attaches it to the transcript.
// Host load shares GPU history with agx-usehooks; the snapshot hook just reads the latest
// rendered line, so transcript logging never pays for a sample. Host-wide values serve
// every session. Best-effort: a failed write only means the next hook firing finds it stale.
const SYS_CACHE = `${HOME}/.cache/claude/statusline-sys.json`;
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, "gu");
const sysColored = sysSegment(df.cpuPct, df.ram, df.vram, df.disks);
const sysPlain = sysColored.replaceAll(ANSI, "");
// Never empty: every Sys reading is a value or an explicit n/a (see the EXPLICIT-ABSENCE law).
await writeCacheAsync(SYS_CACHE, {
  at: Temporal.Now.instant().epochMilliseconds,
  line: `Sys: ${sysPlain}`,
  // Same colors as the bar's Sys row (pctFmt thresholds), for a renderer that keeps ANSI.
  ansi: `${ESC}[38;5;74mSys:${RST} ${sysColored}`,
});

// This session's rows for the snapshot, in display order: Ctx, then Rate. Neither is host-wide —
// each session's payload carries its own context and the rate_limits it last received, so one
// shared file let an idle session's older Rate overwrite a fresh one (observed 2026-10-01: 7d 60%
// then 51% with the same reset). One file per session; the hook reads its own and inserts the
// rows as given.
const sid = (session?.sessionId ?? "").replaceAll(/[^A-Za-z0-9_-]/gu, "_");
if (args.flags.codex !== true && sid !== "") {
  const rows = [ctxSegment(df), rateRow(df)]; // neither is ever empty: a value or an explicit n/a
  await writeCacheAsync(
    `${HOME}/.cache/claude/statusline-session/${sid}.json`,
    {
      at: Temporal.Now.instant().epochMilliseconds,
      rows: rows.map((ansi) => ({ line: ansi.replaceAll(ANSI, ""), ansi })),
    },
  );
}
