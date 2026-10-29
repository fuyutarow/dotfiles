// Stdin JSON -> the existing statusline bytes; no harness configuration cutover.
import { DIM, ESC, RST } from "./ansi.ts";
import { readInput } from "./stdin.ts";
import { presentation } from "./presentation.ts";
import { readCoreRuns } from "./core-runs.ts";
import cliPackage from "../package.json" with { type: "json" };
const { version } = cliPackage;
import { realpath } from "node:fs/promises";
import { ok } from "neverthrow";
import { resetRenderBudget } from "./bounded.ts";
import { standardCli } from "@dotfiles/shared/src/cli.ts";
import { cli as cleyeCli } from "cleye";
import { jsonText, z } from "./zod.ts";
import { SessionStatusSchema, type SessionStatus } from "./session-status.ts";
import { promptParts } from "./prompt-stamp.ts";
import { coloredHead, render } from "./format.ts";
import { statuslineColumns, wrapThroughSys } from "./wrap.ts";
import { buildDataframe } from "./build-dataframe.ts";
import { writeStatuslineFleetSession } from "./fleet-session.ts";
import { runLive, type LiveFrame } from "./live.ts";
import { readRenderSessions, readOwnerState } from "./owner-state.ts";
import {
  AgentSessionSchema,
  discoverSessions,
  payloadForSession,
  statusForSession,
  sessionFromId,
} from "./session-discovery.ts";

const cliArgv = () => process.argv.slice(2);

async function listSessions(cwd: string): Promise<void> {
  for (const session of await discoverSessions(cwd))
    process.stdout.write(`${JSON.stringify(session)}\n`);
}
async function emitPayloads(): Promise<void> {
  const input = await Bun.stdin.text();
  for (const line of input.split("\n")) {
    const parsed = jsonText.safeParse(line);
    if (!parsed.success) continue;
    const session = AgentSessionSchema.safeParse(parsed.data);
    if (!session.success) continue;
    process.stdout.write(
      `${JSON.stringify(await payloadForSession(session.data))}\n`,
    );
  }
}
async function emitPayloadById(sessionId: string): Promise<void> {
  const session = await sessionFromId(sessionId);
  if (session === undefined) {
    process.stderr.write(
      `FATAL: no live agent session found for ${sessionId}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify(await payloadForSession(session))}\n`);
}
async function renderDiscovered(
  cwd: string,
  sessionId?: string,
): Promise<string> {
  const prepared = await presentation(cwd, sessionId);
  if (prepared !== undefined) return prepared;
  const ownerSnapshot = readOwnerState();
  const sessions = (await readRenderSessions(cwd, ownerSnapshot)).filter(
    (session) => sessionId === undefined || session.session_id === sessionId,
  );
  if (sessions.length === 0) {
    const frame = await buildDataframe(
      { cwd },
      {
        ownerSnapshot,
        sources: { codexRate: () => Promise.resolve(ok(undefined)) },
      },
    );
    frame.routes = ok(await readCoreRuns(process.env, null, cwd, []));
    const output = `${render(frame, { layout: "location" })}\n${DIM}no agent session in ${cwd}${RST}\n${render(frame, { layout: "shared" })}`;
    const columns = statuslineColumns();
    return columns === undefined ? output : wrapThroughSys(output, columns);
  }
  const blocks: string[] = [];
  let sharedFrame;
  for (const discovered of sessions) {
    const saved = (await ownerSnapshot)?.fields[
      `session:${discovered.session_id}`
    ];
    const parsed = SessionStatusSchema.safeParse(saved?.value);
    const data =
      parsed.success &&
      parsed.data.sessionId === discovered.session_id &&
      parsed.data.cwd === discovered.cwd &&
      parsed.data.vendor === discovered.vendor &&
      parsed.data.transcriptPath === discovered.transcript_path
        ? parsed.data
        : await statusForSession(discovered, true);
    const codex = discovered.vendor === "codex";
    const frame = await buildDataframe(data, {
      ownerSnapshot,
      codex,
      sources: codex ? { agentName: () => Promise.resolve(ok(undefined)) } : {},
    });
    if (sharedFrame === undefined)
      blocks.push(render(frame, { layout: "location" }));
    // Prefer the Claude frame for the shared rate row (it includes all providers).
    if (sharedFrame === undefined || !codex) sharedFrame = frame;
    blocks.push(
      render(frame, { codex, layout: "session", source: "transcript" }),
    );
  }
  if (sharedFrame !== undefined && sessionId === undefined)
    sharedFrame.routes = ok(
      await readCoreRuns(
        process.env,
        null,
        cwd,
        sessions.map((session) => session.session_id),
      ),
    );
  if (sharedFrame !== undefined)
    blocks.push(
      render(sharedFrame, {
        codex: sessionId !== undefined && sessions[0]?.vendor === "codex",
        layout: "shared",
      }),
    );
  const output = blocks.join("\n");
  const columns = statuslineColumns();
  return columns === undefined ? output : wrapThroughSys(output, columns);
}
async function renderSelected(sessionId: string): Promise<void> {
  const ownerSnapshot = readOwnerState();
  const sessions = await readRenderSessions(process.cwd(), ownerSnapshot);
  const selected = sessions.find(
    (candidate) => candidate.session_id === sessionId,
  );
  if (selected === undefined) {
    process.stderr.write(
      `FATAL: no live agent session found for ${sessionId}\n`,
    );
    process.exit(1);
  }
  const saved = SessionStatusSchema.safeParse(
    (await ownerSnapshot)?.fields[`session:${selected.session_id}`]?.value,
  );
  const frame = await buildDataframe(
    saved.success &&
      saved.data.sessionId === selected.session_id &&
      saved.data.cwd === selected.cwd &&
      saved.data.vendor === selected.vendor &&
      saved.data.transcriptPath === selected.transcript_path
      ? saved.data
      : await statusForSession(selected, true),
    {
      ownerSnapshot,
      codex: selected.vendor === "codex",
    },
  );
  process.stdout.write(
    render(frame, {
      codex: selected.vendor === "codex",
      layout: "block",
      source: "transcript",
    }),
  );
}
async function cwdForPid(pid: string): Promise<string | null> {
  const procCwd = await realpath(`/proc/${pid}/cwd`).catch(() => null);
  if (procCwd !== null) return procCwd;
  return null;
}
async function codexSession(cwd?: string, pid?: string, threadId?: string) {
  const { readCodexThreadStatus } = await import("./adapters/codex-rollout.ts");
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
  const runtimeId = process.env.CODEX_SESSION_ID?.trim();
  if (runtimeId === undefined || runtimeId === "")
    return {
      session: null,
      error:
        "missing Codex runtime identity; supply --thread ID or CODEX_SESSION_ID (cwd/PID alone cannot select a session)",
    };
  const session = await readCodexThreadStatus(runtimeId);
  if (session === undefined || session.cwd !== selectedCwd)
    return {
      session: null,
      error: `no Codex session ${runtimeId} for ${selectedCwd}`,
    };
  return { session, cwd: selectedCwd, error: null };
}
const CodexSelectorFlagsSchema = z.object({
  cwd: z.string().optional(),
  pid: z.string().optional(),
  thread: z.string().optional(),
});
async function codexSessionFromFlags(flags: unknown): Promise<SessionStatus> {
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
  return selected.session;
}
function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`Error: unknown option '--${flag}'\n`);
    process.exit(2);
  }
}
function parseArguments(argv: string[]) {
  const cli = standardCli(cleyeCli, cliPackage, cliArgv);
  return cli(
    {
      name: "statusline",
      parameters: ["[command]", "[session]"],
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      flags: {
        codex: {
          type: Boolean,
          description:
            "Read an exact Codex thread (--thread or CODEX_SESSION_ID)",
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
        session: {
          type: String,
          description: "Render one discovered session and shared host facts",
        },
        once: { type: Boolean, description: "Render one snapshot and exit" },
        watch: {
          type: Boolean,
          description: "Explicitly refresh in a terminal",
        },
        interval: {
          type: String,
          description: "Live refresh interval in seconds (1–3600)",
        },
        json: {
          type: Boolean,
          description: "Emit newline-delimited JSON records",
        },
      },
    },
    undefined,
    argv,
  );
}
// Empty stdin invocations have no arguments to parse. Keep the CLI library off that hot path;
// every supplied argument, including --help, still goes through the strict Cleye contract.
const emptyFlags: Awaited<ReturnType<typeof parseArguments>>["flags"] = {
  help: undefined,
  codex: undefined,
  pid: undefined,
  cwd: undefined,
  thread: undefined,
  session: undefined,
  once: undefined,
  watch: undefined,
  interval: undefined,
  json: undefined,
};
const argv = cliArgv();
const args =
  argv.length === 0
    ? {
        flags: emptyFlags,
        _: { command: undefined, session: undefined, length: 0 },
      }
    : parseArguments(argv);
if (args._.length > 2) {
  process.stderr.write(
    "FATAL: statusline accepts at most a command and session ID\n",
  );
  process.exit(2);
}
const watchSeconds =
  (args.flags.watch ?? false) &&
  args._.command !== undefined &&
  /^\d+(?:\.\d+)?$/u.test(args._.command)
    ? args._.command
    : undefined;
const subcommand = watchSeconds === undefined ? args._.command : undefined;
// A thread identifies Codex even without --codex. Validate selectors before dispatch:
// generic watch and machine subcommands must never silently ignore a supplied thread.
const threadMode = args.flags.thread !== undefined;
if (
  threadMode &&
  (args.flags.thread?.trim() === "" ||
    args.flags.pid !== undefined ||
    args.flags.cwd !== undefined ||
    args.flags.session !== undefined ||
    args.flags.json === true ||
    subcommand !== undefined)
) {
  process.stderr.write(
    "FATAL: --thread requires a non-empty ID and cannot be combined with --pid, --cwd, --session, --json or a command\n",
  );
  process.exit(2);
}
if (subcommand === "sessions") {
  await listSessions(args.flags.cwd ?? process.cwd());
  process.exit(0);
}
if (subcommand === "payload") {
  const sessionId = args._.session;
  if (sessionId !== undefined) {
    await emitPayloadById(sessionId);
    process.exit(0);
  }
  await emitPayloads();
  process.exit(0);
}
if (subcommand !== undefined) {
  process.stderr.write(`FATAL: unknown statusline command ${subcommand}\n`);
  process.exit(2);
}
const codexMode = args.flags.codex === true || threadMode;
if (codexMode && args.flags.session !== undefined) {
  process.stderr.write(
    "FATAL: --codex cannot be combined with --session; use --thread ID\n",
  );
  process.exit(2);
}
const onceMode = args.flags.once ?? false;
const watchMode = args.flags.watch ?? false;
const intervalText = args.flags.interval ?? watchSeconds;
const intervalSeconds = intervalText === undefined ? 5 : Number(intervalText);
const stdoutTty = process.stdout.isTTY ?? false;
const liveMode = codexMode && (watchMode || (!onceMode && stdoutTty));
if (watchMode && onceMode) {
  process.stderr.write("FATAL: --watch cannot be combined with --once\n");
  process.exit(2);
}
if (!codexMode && (onceMode || (intervalText !== undefined && !watchMode))) {
  process.stderr.write(
    "FATAL: --once requires --codex; --interval requires --watch or --codex\n",
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
if (intervalText !== undefined && !liveMode && !watchMode) {
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
if (!codexMode && watchMode) {
  const code = await runLive({
    intervalSeconds,
    frame: async () =>
      renderDiscovered(args.flags.cwd ?? process.cwd(), args.flags.session),
  });
  process.exit(code);
}
let session: SessionStatus | undefined;
if (codexMode) {
  session = await codexSessionFromFlags(args.flags);
} else if (
  args.flags.pid !== undefined ||
  args.flags.cwd !== undefined ||
  args.flags.thread !== undefined
) {
  process.stderr.write("FATAL: --pid, --cwd and --thread require --codex\n");
  process.exit(2);
}
if (!codexMode) {
  const raw = await readInput();
  if (args.flags.session !== undefined && raw === "") {
    await renderSelected(args.flags.session);
    process.exit(0);
  }
  if (raw === "") {
    const cwd = args.flags.cwd ?? process.cwd();
    process.stdout.write(await renderDiscovered(cwd));
    process.exit(0);
  }
  // unknown -> ClaudeStatuslineInput at the trust boundary: parsed and normalized by its adapter.
  const json = jsonText.safeParse(raw);
  if (!json.success) {
    process.stdout.write(
      `${coloredHead(promptParts(process.env.PWD ?? ""))} ${DIM}v${version}${RST}\n`,
    );
    process.stdout.write(`${DIM}Model: ? | invalid statusline JSON${RST}`);
    process.exit(0);
  }
  const { ClaudeStatuslineInputSchema } =
    await import("./adapters/claude-statusline.ts");
  const payload = ClaudeStatuslineInputSchema.safeParse(json.data);
  if (!payload.success) {
    const issue = payload.error.issues[0];
    const path = (issue?.path ?? []).map(String).join(".");
    const where = path !== "" ? path : "(root)";
    process.stdout.write(
      `${coloredHead(promptParts(process.env.PWD ?? ""))} ${DIM}v${version}${RST}\n`,
    );
    process.stdout.write(
      `${DIM}Model: ? | invalid statusline payload: ${where}: ${issue?.message ?? "?"}${RST}`,
    );
    process.exit(0);
  }
  session = payload.data;
  if (
    args.flags.session !== undefined &&
    args.flags.session !== "stdin" &&
    session.sessionId !== args.flags.session
  ) {
    process.stderr.write(
      `FATAL: stdin session does not match --session ${args.flags.session}\n`,
    );
    process.exit(2);
  }
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
        current = await codexSessionFromFlags(args.flags);
      } else {
        const pinnedId = pinnedSession.sessionId;
        if (pinnedId === undefined || pinnedId === "") {
          process.stderr.write(
            "FATAL: live Codex status requires a session with a stable session ID\n",
          );
          return 2;
        }
        const { readCodexPinnedSessionStatus } =
          await import("./adapters/codex-rollout.ts");
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
      await writeStatuslineFleetSession(current, "codex");
      const frame = await buildDataframe(current, { codex: true });
      return render(frame, { codex: true, layout: "block" });
    },
  });
  process.exit(code);
} else {
  const current = session ?? {};
  const df = await buildDataframe(current, { codex: codexMode });
  if (session !== undefined)
    await writeStatuslineFleetSession(
      session,
      codexMode ? "codex" : "claude",
      codexMode ? undefined : df.sessionName,
    );
  process.stdout.write(
    `${render(df, { codex: codexMode, layout: "block" })}${codexMode && onceMode ? "\n" : ""}`,
  );
}
