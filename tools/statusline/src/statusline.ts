#!/usr/bin/env bun
// Stdin JSON -> the existing statusline bytes; no harness configuration cutover.
import { DIM, ESC, RST } from "./ansi.ts";
import { realpath } from "node:fs/promises";
import {
  execAsyncBounded,
  resetRenderBudget,
  writeCacheAsync,
} from "./bounded.ts";
import { cli } from "cleye";
import { jsonText, z } from "./zod.ts";
import { ClaudeStatuslineInputSchema } from "./adapters/claude-statusline.ts";
import {
  readCodexSessionStatus,
  readCodexPinnedSessionStatus,
  readCodexThreadStatus,
} from "./adapters/codex-rollout.ts";
import type { SessionStatus } from "./session-status.ts";
import { promptParts } from "./prompt-stamp.ts";
import { coloredHead, render } from "./format.ts";
import { buildDataframe } from "./build-dataframe.ts";
import { readCodexRate } from "./codex-rate.ts";
import { sysSegment } from "./host-load.ts";
import { ctxSegment } from "./model-context.ts";
import { rateRow } from "./rate-limits.ts";
import { runLive, type LiveFrame } from "./live.ts";
import type { Dataframe } from "./dataframe.ts";
import { withSessionRender } from "./render-cache.ts";

const HOME = process.env.HOME ?? "";
const SYS_CACHE = `${HOME}/.cache/claude/statusline-sys.json`;
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, "gu");
async function writeSysSnapshot(df: Dataframe): Promise<void> {
  const sysColored = sysSegment(df.cpuPct, df.ram, df.vram, df.disks);
  const sysPlain = sysColored.replaceAll(ANSI, "");
  await writeCacheAsync(SYS_CACHE, {
    at: Temporal.Now.instant().epochMilliseconds,
    line: `Sys: ${sysPlain}`,
    ansi: `${ESC}[38;5;74mSys:${RST} ${sysColored}`,
  });
}
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
async function codexSession(cwd?: string, pid?: string, threadId?: string) {
  if (pid !== undefined && cwd !== undefined)
    return { session: null, error: "use only one of --pid or --cwd" };
  if (threadId !== undefined && (pid !== undefined || cwd !== undefined))
    return {
      session: null,
      error: "use only one of --thread, --pid or --cwd",
    };
  if (pid !== undefined && !/^[1-9]\d*$/u.test(pid))
    return { session: null, error: "--pid must be a positive process ID" };
  if (threadId !== undefined) {
    const session = await readCodexThreadStatus(threadId);
    return session === undefined
      ? {
          session: null,
          error: `no interactive Codex session found for thread ${threadId}`,
        }
      : { session, cwd: session.cwd, error: null };
  }
  const envPwd = process.env.PWD;
  const currentCwd =
    envPwd === undefined || envPwd === "" ? process.cwd() : envPwd;
  const selectedCwd =
    cwd ?? (pid === undefined ? currentCwd : await cwdForPid(pid));
  if (selectedCwd === null || selectedCwd === "")
    return { session: null, error: "--codex requires --pid or --cwd" };
  return {
    session: await readCodexSessionStatus(selectedCwd),
    cwd: selectedCwd,
    error: null,
  };
}
const CodexSelectorFlagsSchema = z.object({
  cwd: z.string().optional(),
  pid: z.string().optional(),
  thread: z.string().optional(),
});
async function codexSessionFromFlags(
  flags: unknown,
  keepWatchingWhenAbsent = false,
): Promise<SessionStatus | undefined> {
  const parsedFlags = CodexSelectorFlagsSchema.safeParse(flags);
  if (!parsedFlags.success) {
    const field = parsedFlags.error.issues[0]?.path.map(String).join(".");
    process.stderr.write(
      `FATAL: invalid Codex selector${field === undefined ? "" : ` ${field}`}\n`,
    );
    process.exit(2);
  }
  const selected = await codexSession(
    parsedFlags.data.cwd,
    parsedFlags.data.pid,
    parsedFlags.data.thread,
  );
  if (selected.error !== null) {
    process.stderr.write(`FATAL: ${selected.error}\n`);
    process.exit(2);
  }
  if (selected.session === undefined) {
    if (keepWatchingWhenAbsent) return undefined;
    process.stdout.write(
      `${DIM}Codex: no interactive session for ${selected.cwd}${RST}${args.flags.once === true ? "\n" : ""}`,
    );
    process.exit(0);
  }
  return selected.session;
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
        description:
          "Read the owner's interactive Codex session (defaults to the current directory)",
      },
      pid: {
        type: String,
        description: "Codex process ID (used to read its cwd)",
      },
      cwd: {
        type: String,
        description:
          "Working directory to match (defaults to the current directory)",
      },
      thread: {
        type: String,
        description: "Interactive Codex thread ID shown in the TUI footer",
      },
      once: { type: Boolean, description: "Render one snapshot and exit" },
      watch: { type: Boolean, description: "Explicitly refresh in a terminal" },
      interval: {
        type: String,
        description: "Live refresh interval in seconds (1–3600)",
      },
    },
  },
  undefined,
  Bun.argv.slice(2),
);
const codexMode = args.flags.codex ?? false;
const onceMode = args.flags.once ?? false;
const watchMode = args.flags.watch ?? false;
const intervalText = args.flags.interval;
const intervalSeconds = intervalText === undefined ? 5 : Number(intervalText);
const stdoutTty = process.stdout.isTTY ?? false;
const liveMode = codexMode && (watchMode || (!onceMode && stdoutTty));
if (watchMode && onceMode) {
  process.stderr.write("FATAL: --watch cannot be combined with --once\n");
  process.exit(2);
}
if (!codexMode && (onceMode || watchMode || intervalText !== undefined)) {
  process.stderr.write(
    "FATAL: --once, --watch and --interval require --codex\n",
  );
  process.exit(2);
}
if (
  intervalText !== undefined &&
  (!Number.isFinite(intervalSeconds) ||
    intervalSeconds < 1 ||
    intervalSeconds > 3600)
) {
  process.stderr.write(
    "FATAL: --interval must be a finite number from 1 to 3600 seconds\n",
  );
  process.exit(2);
}
if (watchMode && !stdoutTty) {
  process.stderr.write("FATAL: --watch requires a TTY on stdout\n");
  process.exit(2);
}
if (intervalText !== undefined && !liveMode) {
  process.stderr.write("FATAL: --interval requires live mode\n");
  process.exit(2);
}
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
if (codexMode) {
  session = await codexSessionFromFlags(args.flags, liveMode);
} else if (
  args.flags.pid !== undefined ||
  args.flags.cwd !== undefined ||
  args.flags.thread !== undefined
) {
  process.stderr.write("FATAL: --pid, --cwd and --thread require --codex\n");
  process.exit(2);
}
if (!codexMode) {
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
if (liveMode) {
  let firstFrame = true;
  let pinnedSession = selectedSession;
  const code = await runLive({
    intervalSeconds,
    frame: async (): Promise<LiveFrame> => {
      resetRenderBudget();
      let current: SessionStatus | undefined;
      if (firstFrame) {
        current = pinnedSession;
      } else if (pinnedSession === undefined) {
        current = await codexSessionFromFlags(args.flags, true);
      } else {
        const pinnedId = pinnedSession.sessionId;
        if (pinnedId === undefined || pinnedId === "") {
          process.stderr.write(
            "FATAL: live Codex status requires a session with a stable session ID\n",
          );
          return 2;
        }
        current = await readCodexPinnedSessionStatus(pinnedId);
      }
      firstFrame = false;
      if (current === undefined)
        return `${DIM}Codex: no interactive session for ${args.flags.cwd ?? process.env.PWD ?? process.cwd()}${RST}`;
      if (current.sessionId === undefined || current.sessionId === "") {
        process.stderr.write(
          "FATAL: live Codex status requires a session with a stable session ID\n",
        );
        return 2;
      }
      pinnedSession ??= current;
      return withSessionRender(
        `codex:${current.sessionId}`,
        async () => {
          const frame = await buildDataframe(current, {
            codex: true,
            sources: {
              codexRate: () => readCodexRate(undefined, current.sessionId),
            },
          });
          await writeSysSnapshot(frame);
          return render(frame, { codex: true });
        },
        { input: current },
      );
    },
  });
  process.exit(code);
} else {
  let df: Dataframe | undefined;
  const makeOutput = async (): Promise<string> => {
    df =
      codexMode && selectedSession?.sessionId !== undefined
        ? await buildDataframe(selectedSession, {
            codex: true,
            sources: {
              codexRate: () =>
                readCodexRate(undefined, selectedSession.sessionId),
            },
          })
        : await buildDataframe(session ?? {});
    return render(df, { codex: codexMode });
  };
  const provider = codexMode ? "codex" : "claude";
  const output =
    session?.sessionId === undefined || session.sessionId === ""
      ? await makeOutput()
      : await withSessionRender(
          `${provider}:${session.sessionId}`,
          makeOutput,
          {
            input: session,
          },
        );
  process.stdout.write(`${output}${codexMode && onceMode ? "\n" : ""}`);
  // The active renderer owns snapshots; a contender reused output without source reads.
  if (df === undefined) process.exit(0);

  // Hand the plain Sys row to hooks/log-sys-snapshot.ts, which attaches it to the transcript.
  // Host load shares GPU history with agx-usehooks; the snapshot hook just reads the latest
  // rendered line, so transcript logging never pays for a sample. Host-wide values serve
  // every session. Best-effort: a failed write only means the next hook firing finds it stale.
  // Never empty: every Sys reading is a value or an explicit n/a (see the EXPLICIT-ABSENCE law).
  await writeSysSnapshot(df);

  // This session's rows for the snapshot, in display order: Ctx, then Rate. Neither is host-wide —
  // each session's payload carries its own context and the rate_limits it last received, so one
  // shared file let an idle session's older Rate overwrite a fresh one (observed 2026-10-01: 7d 60%
  // then 51% with the same reset). One file per session; the hook reads its own and inserts the
  // rows as given.
  const sid = (session?.sessionId ?? "").replaceAll(/[^A-Za-z0-9_-]/gu, "_");
  if (!codexMode && sid !== "") {
    const rows = [ctxSegment(df), rateRow(df)]; // neither is ever empty: a value or an explicit n/a
    await writeCacheAsync(
      `${HOME}/.cache/claude/statusline-session/${sid}.json`,
      {
        at: Temporal.Now.instant().epochMilliseconds,
        rows: rows.map((ansi) => ({ line: ansi.replaceAll(ANSI, ""), ansi })),
      },
    );
  }
}
