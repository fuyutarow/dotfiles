#!/usr/bin/env bun
// Stdin JSON -> the existing statusline bytes; no harness configuration cutover.
import { DIM, ESC, RST } from "./ansi.ts";
import cliPackage from "../package.json" with { type: "json" };
const { version } = cliPackage;
import { realpath } from "node:fs/promises";
import { ok } from "neverthrow";
import { resetRenderBudget } from "./bounded.ts";
import { standardCli } from "../../shared/src/cli.ts";
import { jsonText, z } from "./zod.ts";
import type { SessionStatus } from "./session-status.ts";
import { promptParts } from "./prompt-stamp.ts";
import { coloredHead, render } from "./format.ts";
import { buildDataframe } from "./build-dataframe.ts";
import type { readLiveCodexRate } from "./codex-rate.ts";
const liveRate: typeof readLiveCodexRate = async (path) => {
  if (path === undefined) return ok(undefined);
  const { readLiveCodexRate } = await import("./codex-rate.ts");
  return readLiveCodexRate(path);
};
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
async function renderDiscovered(cwd: string): Promise<string> {
  const ownerSnapshot = readOwnerState();
  const sessions = await readRenderSessions(cwd, ownerSnapshot);
  if (sessions.length === 0) {
    const frame = await buildDataframe(
      { cwd },
      {
        ownerSnapshot,
        sources: { codexRate: () => Promise.resolve(ok(undefined)) },
      },
    );
    return `${render(frame)}\n${DIM}no agent session in ${cwd}${RST}`;
  }
  const blocks: string[] = [];
  for (const discovered of sessions) {
    const data = await statusForSession(discovered);
    const codex = discovered.vendor === "codex";
    const frame = await buildDataframe(data, {
      ownerSnapshot,
      codex,
      sources: {
        codexRate: () =>
          liveRate(
            sessions.find((session) => session.vendor === "codex")
              ?.transcript_path,
          ),
        ...(codex ? { agentName: () => Promise.resolve(ok(undefined)) } : {}),
      },
    });
    blocks.push(render(frame, { codex: discovered.vendor === "codex" }));
  }
  return blocks.join("\n");
}
async function cwdForPid(pid: string): Promise<string | null> {
  const procCwd = await realpath(`/proc/${pid}/cwd`).catch(() => null);
  if (procCwd !== null) return procCwd;
  return null;
}
async function codexSession(cwd?: string, pid?: string, threadId?: string) {
  const { readCodexSessionStatus, readCodexThreadStatus } =
    await import("./adapters/codex-rollout.ts");
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
async function parseArguments(argv: string[]) {
  const { cli: cleyeCli } = await import("cleye");
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
  once: undefined,
  watch: undefined,
  interval: undefined,
  json: undefined,
};
const argv = cliArgv();
const args =
  argv.length === 0
    ? { flags: emptyFlags, _: { command: undefined, session: undefined } }
    : await parseArguments(argv);
const watchSeconds =
  (args.flags.watch ?? false) &&
  args._.command !== undefined &&
  /^\d+(?:\.\d+)?$/u.test(args._.command)
    ? args._.command
    : undefined;
const subcommand = watchSeconds === undefined ? args._.command : undefined;
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
const codexMode = args.flags.codex ?? false;
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
    frame: async () => renderDiscovered(args.flags.cwd ?? process.cwd()),
  });
  process.exit(code);
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
  const raw = process.stdin.isTTY ? "" : await Bun.stdin.text();
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
      const frame = await buildDataframe(current, { codex: true });
      return render(frame, { codex: true });
    },
  });
  process.exit(code);
} else {
  const df = await buildDataframe(session ?? {}, { codex: codexMode });
  process.stdout.write(
    `${render(df, { codex: codexMode })}${codexMode && onceMode ? "\n" : ""}`,
  );
}
