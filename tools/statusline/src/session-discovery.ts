import * as fs from "node:fs/promises";
import { basename, join } from "node:path";
import { readJsonlTail } from "../../shared/src/jsonl.ts";
import { jsonText, z } from "./zod.ts";
import type { SessionStatus } from "./session-status.ts";

export interface AgentSession {
  vendor: "claude" | "codex";
  pid: number;
  cwd: string;
  session_id: string;
  transcript_path: string;
  started_at: string;
}
export const AgentSessionSchema = z.object({
  vendor: z.enum(["claude", "codex"]),
  pid: z.number(),
  cwd: z.string(),
  session_id: z.string(),
  transcript_path: z.string(),
  started_at: z.string(),
});

const home = () => process.env.HOME ?? "";
const procRoot = () => process.env.STATUSLINE_PROC_ROOT ?? "/proc";
type DiscoveryFs = Pick<
  typeof fs,
  "open" | "readdir" | "readFile" | "readlink" | "realpath" | "stat"
>;
const resolved = async (path: string, io: DiscoveryFs) =>
  io.realpath(path).catch(() => null);
const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined;
const text = (value: unknown) =>
  typeof value === "string" ? value : undefined;
const timestamp = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value))
    return Temporal.Instant.fromEpochMilliseconds(Math.trunc(value)).toString();
  return null;
};
const projectSlug = (cwd: string) => cwd.replaceAll("/", "-");
const TRANSCRIPT_TAIL_BYTES = 512 * 1024;

async function processRows(io: DiscoveryFs) {
  const names = await io.readdir(procRoot()).catch(() => []);
  return Promise.all(
    names
      .filter((name) => /^[1-9]\d*$/u.test(name))
      .map(async (name) => {
        const pid = Number(name);
        const argv = await io
          .readFile(join(procRoot(), name, "cmdline"))
          .catch(() => null);
        if (argv === null) return null;
        const args = argv.toString("utf8").split("\0").filter(Boolean);
        const first = args[0] ?? "";
        const command = first.split("/").at(-1) ?? "";
        // Only executable arguments identify an agent; prompt text and shell commands do not.
        const executable = /^(?:node|bun)(?:\.exe)?$/u.test(command)
          ? basename(args[1] ?? "")
          : command;
        let vendor: "claude" | "codex" | undefined;
        if (
          /^(claude|claude-code)(?:\.js)?$/u.test(executable) ||
          (/^(node|bun)$/u.test(command) &&
            /(?:^|\/)claude-code\/cli\.js$/u.test(args[1] ?? ""))
        )
          vendor = "claude";
        else if (/^(codex|codex-cli)(?:\.js)?$/u.test(executable))
          vendor = "codex";
        if (vendor === undefined) return null;
        const cwd = await resolved(join(procRoot(), name, "cwd"), io);
        return cwd === null
          ? null
          : { pid, cwd, vendor, server: args.includes("app-server") };
      }),
  );
}

async function claudeSession(
  pid: number,
  cwd: string,
  io: DiscoveryFs,
): Promise<AgentSession | null> {
  const sessionFile = join(home(), ".claude", "sessions", `${pid}.json`);
  const raw = await io.readFile(sessionFile, "utf8").catch(() => null);
  if (raw === null) return null;
  const parsed = jsonText.safeParse(raw);
  const record = parsed.success ? asRecord(parsed.data) : undefined;
  const sessionId = text(record?.sessionId);
  const recordCwd = text(record?.cwd);
  const socket = text(record?.messagingSocketPath);
  const startedAt = timestamp(record?.startedAt);
  if (
    sessionId === undefined ||
    recordCwd === undefined ||
    socket === undefined ||
    startedAt === null
  )
    return null;
  const [resolvedCwd, resolvedRecordCwd, socketInfo] = await Promise.all([
    resolved(cwd, io),
    resolved(recordCwd, io),
    io.stat(socket).catch(() => null),
  ]);
  if (
    resolvedCwd === null ||
    resolvedRecordCwd !== resolvedCwd ||
    socketInfo === null
  )
    return null;
  const transcript = join(
    home(),
    ".claude",
    "projects",
    projectSlug(recordCwd),
    `${sessionId}.jsonl`,
  );
  const transcriptInfo = await io.stat(transcript).catch(() => null);
  if (transcriptInfo?.isFile() !== true) return null;
  return {
    vendor: "claude",
    pid,
    cwd,
    session_id: sessionId,
    transcript_path: transcript,
    started_at: startedAt,
  };
}

async function codexSessions(
  pid: number,
  cwd: string,
  allCwds: boolean,
  io: DiscoveryFs,
): Promise<AgentSession[]> {
  const fdRoot = join(procRoot(), String(pid), "fd");
  const names = await io.readdir(fdRoot).catch(() => []);
  const targets = await Promise.all(
    names.map((name) => io.readlink(join(fdRoot, name)).catch(() => null)),
  );
  // A Desktop app-server can own several sessions, independently of its own cwd.
  // Open descriptors are the liveness evidence; never enumerate the session store.
  const paths = [
    ...new Set(
      targets
        .filter((path) => path !== null)
        .filter(
          (path) =>
            basename(path).startsWith("rollout-") && path.endsWith(".jsonl"),
        ),
    ),
  ];
  const rows = await Promise.all(
    paths.map(async (path): Promise<AgentSession | null> => {
      const first = await readFirstLine(path, io);
      const parsed = jsonText.safeParse(first);
      const row = parsed.success ? asRecord(parsed.data) : undefined;
      const payload = asRecord(row?.payload);
      const sessionId = text(payload?.session_id) ?? text(payload?.id);
      const sessionCwd = text(payload?.cwd);
      if (
        row?.type !== "session_meta" ||
        sessionId === undefined ||
        sessionCwd === undefined
      )
        return null;
      const canonicalCwd = await resolved(sessionCwd, io);
      if (canonicalCwd === null || (!allCwds && canonicalCwd !== cwd))
        return null;
      const info = await io.stat(path).catch(() => null);
      if (info?.isFile() !== true) return null;
      const started = z.iso
        .datetime({ offset: true })
        .safeParse(payload?.timestamp);
      return {
        vendor: "codex",
        pid,
        cwd: canonicalCwd,
        session_id: sessionId,
        transcript_path: path,
        started_at: started.success
          ? started.data
          : Temporal.Instant.fromEpochMilliseconds(
              Math.trunc(info.birthtimeMs),
            ).toString(),
      };
    }),
  );
  return rows.filter((row) => row !== null);
}

async function readFirstLine(path: string, io: DiscoveryFs) {
  const file = await io.open(path, "r").catch(() => null);
  if (file === null) return "";
  await using handle = file;
  // session_meta includes instructions; allow large headers without reading the rollout body.
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < 2 * 1024 * 1024; offset += 64 * 1024) {
    const buffer = Buffer.alloc(64 * 1024);
    const result = await handle
      .read(buffer, 0, buffer.length, offset)
      .catch(() => null);
    if (result === null) return "";
    const bytes = buffer.subarray(0, result.bytesRead);
    const newline = bytes.indexOf(10);
    chunks.push(newline < 0 ? bytes : bytes.subarray(0, newline));
    if (newline >= 0 || result.bytesRead < buffer.length)
      return Buffer.concat(chunks).toString("utf8");
  }
  return "";
}

export async function discoverSessions(
  cwdInput = process.cwd(),
  allCwds = false,
  io: DiscoveryFs = fs,
): Promise<AgentSession[]> {
  const cwd = (await resolved(cwdInput, io)) ?? cwdInput;
  const processes = (await processRows(io)).filter(
    (row) =>
      row !== null &&
      (allCwds || row.cwd === cwd || (row.vendor === "codex" && row.server)),
  );
  const rows = await Promise.all(
    processes.map(async (proc) => {
      if (proc === null) return [];
      if (proc.vendor === "claude") {
        const session = await claudeSession(proc.pid, proc.cwd, io);
        return session === null ? [] : [session];
      }
      return codexSessions(proc.pid, cwd, allCwds, io);
    }),
  );
  return rows
    .flat()
    .toSorted((a, b) => {
      const primaryA = a.transcript_path.endsWith(`-${a.session_id}.jsonl`);
      const primaryB = b.transcript_path.endsWith(`-${b.session_id}.jsonl`);
      if (primaryA !== primaryB) return primaryA ? -1 : 1;
      return Temporal.Instant.compare(b.started_at, a.started_at);
    })
    .filter(
      (session, index, sessions) =>
        sessions.findIndex(
          (candidate) =>
            candidate.vendor === session.vendor &&
            candidate.session_id === session.session_id,
        ) === index,
    )
    .toSorted((a, b) => Temporal.Instant.compare(b.started_at, a.started_at));
}

function codexPayload(raw: string, session: AgentSession) {
  let model: string | undefined;
  let effort: string | undefined;
  let inputTokens: number | undefined;
  let contextWindow: number | undefined;
  for (const line of raw.split("\n")) {
    const parsed = jsonText.safeParse(line);
    const row = parsed.success ? asRecord(parsed.data) : undefined;
    const payload = asRecord(row?.payload);
    if (row?.type === "turn_context") {
      model = text(payload?.model) ?? model;
      effort =
        text(payload?.effort) ?? text(payload?.reasoning_effort) ?? effort;
    }
    if (
      row?.type === "event_msg" &&
      payload?.type === "thread_settings_applied"
    ) {
      const settings = asRecord(payload.thread_settings);
      model = text(settings?.model) ?? model;
      effort = text(settings?.reasoning_effort) ?? effort;
    }
    if (row?.type !== "event_msg" || payload?.type !== "token_count") continue;
    const info = asRecord(payload.info);
    const usage = asRecord(info?.last_token_usage);
    inputTokens =
      typeof usage?.input_tokens === "number"
        ? usage.input_tokens
        : inputTokens;
    contextWindow =
      typeof info?.model_context_window === "number"
        ? info.model_context_window
        : contextWindow;
  }
  let context:
    | { total_input_tokens: number; used_percentage?: number }
    | undefined;
  if (inputTokens !== undefined && contextWindow !== undefined) {
    context = { total_input_tokens: inputTokens };
    if (contextWindow > 0)
      context.used_percentage = Math.min(
        100,
        (inputTokens / contextWindow) * 100,
      );
  }
  return {
    cwd: session.cwd,
    session_id: session.session_id,
    transcript_path: session.transcript_path,
    model: model === undefined ? undefined : { display_name: model, id: model },
    effort: effort === undefined ? undefined : { level: effort },
    context_window: context,
  };
}

interface DiscoveredPayload {
  cwd: string;
  session_id: string;
  transcript_path: string;
  model?: { display_name: string; id?: string } | undefined;
  effort?: { level: string } | undefined;
  context_window?:
    | { total_input_tokens: number; used_percentage?: number }
    | undefined;
}
export async function payloadForSession(
  session: AgentSession,
): Promise<DiscoveredPayload> {
  if (session.vendor === "codex") {
    const data = await statusForSession(session);
    let context_window: DiscoveredPayload["context_window"];
    if (data.context?.inputTokens !== undefined)
      context_window = {
        total_input_tokens: data.context.inputTokens,
        ...(data.context.usedPercent === undefined
          ? {}
          : { used_percentage: data.context.usedPercent }),
      };
    return {
      cwd: session.cwd,
      session_id: session.session_id,
      transcript_path: session.transcript_path,
      model:
        data.model?.name === undefined
          ? undefined
          : { display_name: data.model.name },
      effort: data.effort === undefined ? undefined : { level: data.effort },
      context_window,
    };
  }
  const raw =
    (
      await readJsonlTail(session.transcript_path, TRANSCRIPT_TAIL_BYTES).catch(
        () => null,
      )
    )?.text ?? "";
  let modelName: string | undefined;
  let inputTokens: number | undefined;
  for (const line of raw.split("\n").toReversed()) {
    if (!line.includes('"usage"') && !line.includes('"model"')) continue;
    const parsed = jsonText.safeParse(line);
    const row = parsed.success ? asRecord(parsed.data) : undefined;
    const message = asRecord(row?.message);
    const usage = asRecord(message?.usage);
    if (modelName === undefined && typeof message?.model === "string")
      modelName = message.model;
    if (inputTokens === undefined && typeof usage?.input_tokens === "number")
      inputTokens =
        usage.input_tokens +
        (typeof usage.cache_read_input_tokens === "number"
          ? usage.cache_read_input_tokens
          : 0) +
        (typeof usage.cache_creation_input_tokens === "number"
          ? usage.cache_creation_input_tokens
          : 0);
    if (modelName !== undefined && inputTokens !== undefined) break;
  }
  return {
    cwd: session.cwd,
    session_id: session.session_id,
    transcript_path: session.transcript_path,
    model:
      modelName === undefined
        ? undefined
        : { display_name: modelName, id: modelName },
    context_window:
      inputTokens === undefined
        ? undefined
        : { total_input_tokens: inputTokens },
  };
}

/** Transcript values have already crossed the discovery decoder; no wire round-trip. */
export async function statusForSession(
  session: AgentSession,
  sampledRender = false,
): Promise<SessionStatus> {
  if (session.vendor === "codex" && !sampledRender) {
    const { readCodexTranscriptStatus } =
      await import("./adapters/codex-rollout.ts");
    return (
      (await readCodexTranscriptStatus(
        session.transcript_path,
        session.cwd,
      )) ?? {
        cwd: session.cwd,
        sessionId: session.session_id,
      }
    );
  }
  const payload =
    session.vendor === "codex"
      ? codexPayload(
          (
            await readJsonlTail(
              session.transcript_path,
              TRANSCRIPT_TAIL_BYTES,
            ).catch(() => null)
          )?.text ?? "",
          session,
        )
      : await payloadForSession(session);
  return {
    cwd: payload.cwd,
    sessionId: payload.session_id,
    effort: payload.effort?.level,
    model:
      payload.model === undefined
        ? undefined
        : { name: payload.model.display_name, id: payload.model.id },
    context:
      payload.context_window === undefined
        ? undefined
        : {
            inputTokens: payload.context_window.total_input_tokens,
            usedPercent: payload.context_window.used_percentage,
          },
  };
}

export async function sessionFromId(
  sessionId: string,
): Promise<AgentSession | undefined> {
  const sessions = await discoverSessions(process.cwd(), true);
  return sessions.find((session) => session.session_id === sessionId);
}
