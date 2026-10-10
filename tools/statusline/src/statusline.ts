#!/usr/bin/env bun
// Stdin JSON -> the existing statusline bytes; no harness configuration cutover.
import { DIM, ESC, RST } from "./ansi.ts";
import { writeCacheAsync } from "./bounded.ts";
import { jsonText } from "./zod.ts";
import { ClaudeStatuslineInputSchema } from "./adapters/claude-statusline.ts";
import { promptParts } from "./prompt-stamp.ts";
import { coloredHead, render } from "./format.ts";
import { buildDataframe } from "./build-dataframe.ts";
import { sysSegment } from "./host-load.ts";
import { ctxSegment } from "./model-context.ts";
import { rateRow } from "./rate-limits.ts";

const HOME = process.env.HOME ?? "";
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
const raw = await Bun.stdin.text();
// unknown -> ClaudeStatuslineInput at the trust boundary: parsed and normalized by its adapter. A
// payload that is not JSON, or has a field of the wrong type, renders line 1 plus the first
// reason — the whole bar saying "the input is wrong" beats a bar built from half-trusted values.
const json = jsonText.safeParse(raw);
if (!json.success) {
  process.stdout.write(`${coloredHead(promptParts(process.env.PWD ?? ""))}\n`);
  process.stdout.write(`${DIM}Model: ? | invalid statusline JSON${RST}`);
  process.exit(0);
}
const payload = ClaudeStatuslineInputSchema.safeParse(json.data);
if (!payload.success) {
  const issue = payload.error.issues[0];
  const path = (issue?.path ?? []).map(String).join(".");
  const where = path !== "" ? path : "(root)";
  process.stdout.write(`${coloredHead(promptParts(process.env.PWD ?? ""))}\n`);
  process.stdout.write(
    `${DIM}Model: ? | invalid statusline payload: ${where}: ${issue?.message ?? "?"}${RST}`,
  );
  process.exit(0);
}

const df = await buildDataframe(payload.data);
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
const sid = (payload.data.sessionId ?? "").replaceAll(/[^A-Za-z0-9_-]/gu, "_");
if (sid !== "") {
  const rows = [ctxSegment(df), rateRow(df)]; // neither is ever empty: a value or an explicit n/a
  await writeCacheAsync(
    `${HOME}/.cache/claude/statusline-session/${sid}.json`,
    {
      at: Temporal.Now.instant().epochMilliseconds,
      rows: rows.map((ansi) => ({ line: ansi.replaceAll(ANSI, ""), ansi })),
    },
  );
}
