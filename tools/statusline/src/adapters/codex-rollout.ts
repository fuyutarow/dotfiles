import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { SessionStatus } from "../session-status.ts";
import { jsonText, maybe, z } from "../zod.ts";

const SESSION_META = z.object({
  type: z.literal("session_meta"),
  payload: z.object({
    id: maybe(z.string()),
    session_id: maybe(z.string()),
    cwd: maybe(z.string()),
    model: maybe(z.string()),
  }),
});
const TOKEN_COUNT = z.object({
  type: z.literal("event_msg"),
  timestamp: maybe(z.string()),
  payload: z.object({
    type: z.literal("token_count"),
    info: z.object({
      last_token_usage: maybe(z.object({ input_tokens: maybe(z.number()) })),
      model_context_window: maybe(z.number()),
    }),
  }),
});
const TURN_CONTEXT = z.object({
  type: z.literal("turn_context"),
  payload: z.object({ model: maybe(z.string()), effort: maybe(z.string()) }),
});

const MAX_META_BYTES = 4 * 1024 * 1024;
const TAIL_BYTES = 512 * 1024;

async function firstLine(path: string): Promise<string | null> {
  await using file = await open(path, "r");
  const chunks: Buffer[] = [];
  let offset = 0;
  while (offset < MAX_META_BYTES) {
    const chunk = Buffer.alloc(64 * 1024);
    const result = await file.read(chunk, 0, chunk.length, offset);
    if (result.bytesRead === 0) return null;
    const part = chunk.subarray(0, result.bytesRead);
    const newline = part.indexOf(10);
    if (newline >= 0) {
      chunks.push(part.subarray(0, newline));
      return Buffer.concat(chunks).toString("utf8");
    }
    chunks.push(part);
    offset += result.bytesRead;
  }
  return null;
}

async function metadata(path: string) {
  const line = await firstLine(path).catch(() => null);
  if (line === null) return null;
  const json = jsonText.safeParse(line);
  if (!json.success) return null;
  const parsed = SESSION_META.safeParse(json.data);
  return parsed.success ? parsed.data : null;
}

async function rolloutsInDay(dir: string) {
  const names = await readdir(dir).catch(() => []);
  const files = await Promise.all(
    names
      .filter((name) => name.startsWith("rollout-") && name.endsWith(".jsonl"))
      .map(async (name) => {
        const path = join(dir, name);
        const info = await stat(path).catch(() => null);
        return info?.isFile() === true ? { path, mtimeMs: info.mtimeMs } : null;
      }),
  );
  return files
    .filter((file) => file !== null)
    .toSorted((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, 100);
}

async function matchingRolloutOnDay(dir: string, cwd: string) {
  const candidates = await rolloutsInDay(dir);
  for (const candidate of candidates) {
    const meta = await metadata(candidate.path);
    if (meta?.payload.cwd === cwd) return { path: candidate.path, meta };
  }
  return null;
}

async function matchingRollout(root: string, cwd: string) {
  const today = Temporal.Now.plainDateISO();
  for (let offset = 0; offset <= 366; offset++) {
    const day = today.subtract({ days: offset });
    const dir = join(
      root,
      String(day.year),
      String(day.month).padStart(2, "0"),
      String(day.day).padStart(2, "0"),
    );
    const match = await matchingRolloutOnDay(dir, cwd);
    if (match !== null) return match;
  }
  return null;
}

async function readTail(path: string): Promise<string> {
  await using file = await open(path, "r");
  const info = await file.stat();
  const length = Math.min(info.size, TAIL_BYTES);
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await file.read(buffer, 0, length, info.size - length);
  const text = buffer.subarray(0, bytesRead).toString("utf8");
  return length < info.size ? text.slice(text.indexOf("\n") + 1) : text;
}

/** Select the newest rollout for the pane cwd and normalize its current turn/context facts. */
export async function readCodexSessionStatus(
  cwd: string,
  root = join(process.env.HOME ?? "", ".codex", "sessions"),
): Promise<SessionStatus | undefined> {
  const selected = await matchingRollout(root, cwd);
  if (selected === null) return undefined;
  const tail = await readTail(selected.path).catch(() => "");
  let model = selected.meta.payload.model;
  let effort: string | undefined;
  let context: SessionStatus["context"];
  for (const line of tail.split("\n")) {
    const json = jsonText.safeParse(line);
    if (!json.success) continue;
    const turn = TURN_CONTEXT.safeParse(json.data);
    if (turn.success) {
      model = turn.data.payload.model ?? model;
      effort = turn.data.payload.effort ?? effort;
      continue;
    }
    const usage = TOKEN_COUNT.safeParse(json.data);
    if (!usage.success) continue;
    const window = usage.data.payload.info.model_context_window;
    const inputTokens = usage.data.payload.info.last_token_usage?.input_tokens;
    context = {
      inputTokens,
      usedPercent:
        window !== undefined && window > 0 && inputTokens !== undefined
          ? Math.min(100, (inputTokens / window) * 100)
          : undefined,
    };
  }
  return {
    cwd,
    sessionId: selected.meta.payload.session_id ?? selected.meta.payload.id,
    model: model === undefined ? undefined : { name: model },
    effort,
    context,
  };
}
