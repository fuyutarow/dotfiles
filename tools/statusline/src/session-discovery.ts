import { open, readdir, readFile, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { readJsonlTail } from "../../shared/src/jsonl.ts";
import { jsonText, z } from "./zod.ts";

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
const resolved = async (path: string) => realpath(path).catch(() => null);
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

async function processRows() {
  const names = await readdir(procRoot()).catch(() => []);
  return Promise.all(
    names
      .filter((name) => /^[1-9]\d*$/u.test(name))
      .map(async (name) => {
        const pid = Number(name);
        const [argv, cwd] = await Promise.all([
          readFile(join(procRoot(), name, "cmdline")).catch(() => null),
          resolved(join(procRoot(), name, "cwd")),
        ]);
        if (argv === null || cwd === null) return null;
        const args = argv.toString("utf8").split("\0").filter(Boolean);
        const first = args[0] ?? "";
        const command = first.split("/").at(-1) ?? "";
        const joined = args.join(" ");
        let vendor: "claude" | "codex" | undefined;
        if (
          /^(claude|claude-code)$/u.test(command) ||
          joined.includes("claude-code")
        )
          vendor = "claude";
        else if (
          /^(codex|codex-cli)$/u.test(command) ||
          /(?:^|\/)codex(?:\s|$)/u.test(joined)
        )
          vendor = "codex";
        return vendor === undefined ? null : { pid, cwd, vendor };
      }),
  );
}

async function claudeSession(
  pid: number,
  cwd: string,
): Promise<AgentSession | null> {
  const sessionFile = join(home(), ".claude", "sessions", `${pid}.json`);
  const raw = await readFile(sessionFile, "utf8").catch(() => null);
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
    resolved(cwd),
    resolved(recordCwd),
    stat(socket).catch(() => null),
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
  const transcriptInfo = await stat(transcript).catch(() => null);
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

async function codexRollout(cwd: string) {
  const root = join(home(), ".codex", "sessions");
  const matches: {
    path: string;
    sessionId: string;
    startedAt: string;
    mtime: number;
  }[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 3) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    await Promise.all(
      entries.map(async (entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return walk(path, depth + 1);
        if (
          !entry.isFile() ||
          !entry.name.startsWith("rollout-") ||
          !entry.name.endsWith(".jsonl")
        )
          return;
        const first = await readFirstLine(path);
        const parsed = jsonText.safeParse(first);
        const row = parsed.success ? asRecord(parsed.data) : undefined;
        const payload = asRecord(row?.payload);
        const sessionId = text(payload?.session_id) ?? text(payload?.id);
        const sessionCwd = text(payload?.cwd);
        if (
          row?.type !== "session_meta" ||
          payload?.originator !== "codex-tui" ||
          sessionCwd === undefined ||
          sessionId === undefined
        )
          return;
        if ((await resolved(sessionCwd)) !== cwd) return;
        const info = await stat(path).catch(() => null);
        if (info?.isFile() !== true) return;
        matches.push({
          path,
          sessionId,
          startedAt: Temporal.Instant.fromEpochMilliseconds(
            Math.trunc(info.birthtimeMs),
          ).toString(),
          mtime: info.mtimeMs,
        });
      }),
    );
  };
  await walk(root, 0);
  return matches.toSorted((a, b) => b.mtime - a.mtime)[0];
}

async function readFirstLine(path: string) {
  const file = await open(path, "r").catch(() => null);
  if (file === null) return "";
  await using handle = file;
  const buffer = Buffer.alloc(64 * 1024);
  const result = await handle
    .read(buffer, 0, buffer.length, 0)
    .catch(() => ({ bytesRead: 0, buffer }));
  const newline = buffer.indexOf(10, 0);
  return buffer
    .subarray(0, newline < 0 ? result.bytesRead : newline)
    .toString("utf8");
}

export async function discoverSessions(
  cwdInput = process.cwd(),
  allCwds = false,
): Promise<AgentSession[]> {
  const cwd = (await resolved(cwdInput)) ?? cwdInput;
  const processes = (await processRows()).filter(
    (row) => row !== null && (allCwds || row.cwd === cwd),
  );
  const rows = await Promise.all(
    processes.map(async (proc) => {
      if (proc === null) return null;
      if (proc.vendor === "claude") return claudeSession(proc.pid, proc.cwd);
      const rollout = await codexRollout(proc.cwd);
      return rollout === undefined
        ? null
        : {
            vendor: "codex" as const,
            pid: proc.pid,
            cwd: proc.cwd,
            session_id: rollout.sessionId,
            transcript_path: rollout.path,
            started_at: rollout.startedAt,
          };
    }),
  );
  return rows
    .filter((row) => row !== null)
    .toSorted((a, b) => Temporal.Instant.compare(b.started_at, a.started_at));
}

function codexPayload(raw: string, session: AgentSession) {
  let model: string | undefined;
  let inputTokens: number | undefined;
  let contextWindow: number | undefined;
  for (const line of raw.split("\n")) {
    const parsed = jsonText.safeParse(line);
    const row = parsed.success ? asRecord(parsed.data) : undefined;
    const payload = asRecord(row?.payload);
    if (row?.type === "turn_context") model = text(payload?.model) ?? model;
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
    model: model === undefined ? undefined : { display_name: model },
    context_window: context,
  };
}

export async function payloadForSession(session: AgentSession) {
  const raw =
    (
      await readJsonlTail(session.transcript_path, TRANSCRIPT_TAIL_BYTES).catch(
        () => null,
      )
    )?.text ?? "";
  if (session.vendor === "codex") return codexPayload(raw, session);
  let modelName: string | undefined;
  let inputTokens: number | undefined;
  for (const line of raw.split("\n")) {
    const parsed = jsonText.safeParse(line);
    const row = parsed.success ? asRecord(parsed.data) : undefined;
    const message = asRecord(row?.message);
    const usage = asRecord(message?.usage);
    if (typeof message?.model === "string") modelName = message.model;
    if (typeof usage?.input_tokens === "number")
      inputTokens = usage.input_tokens;
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

export async function sessionFromId(
  sessionId: string,
): Promise<AgentSession | undefined> {
  const sessions = await discoverSessions(process.cwd(), true);
  return sessions.find((session) => session.session_id === sessionId);
}
