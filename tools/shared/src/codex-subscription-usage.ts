import { open, stat } from "node:fs/promises";
import { jsonOf, z } from "./zod.ts";
import type { SubscriptionUsageWindow } from "./subscription-usage.ts";

const Window = z.object({
  used_percent: z.number(),
  window_minutes: z.literal(10080),
  resets_at: z.number(),
});
const Event = z.object({
  timestamp: z.iso.datetime({ offset: true }),
  type: z.literal("event_msg"),
  payload: z.object({
    type: z.literal("token_count"),
    rate_limits: z.object({
      primary: z.unknown().optional(),
      secondary: z.unknown().optional(),
    }),
  }),
});

function windowFromLine(
  line: string,
  mtimeMs: number,
  nowMs: number,
  maxAgeMs: number,
): SubscriptionUsageWindow | undefined {
  const event = jsonOf(Event).safeParse(line);
  if (!event.success) return undefined;
  const measuredAt = Math.min(
    mtimeMs,
    Temporal.Instant.from(event.data.timestamp).epochMilliseconds,
  );
  if (measuredAt > nowMs || nowMs - measuredAt > maxAgeMs) return undefined;
  const rate = event.data.payload.rate_limits;
  for (const candidate of [rate.primary, rate.secondary]) {
    const window = Window.safeParse(candidate);
    if (!window.success || window.data.resets_at * 1000 <= nowMs) continue;
    return {
      used_percent: window.data.used_percent,
      resets_at: window.data.resets_at,
      window_seconds: 604800,
      measured_at: measuredAt,
    };
  }
  return undefined;
}

async function readTail(path: string, size: number): Promise<string[]> {
  const fd = await open(path, "r").catch(() => null);
  if (fd === null) return [];
  await using handle = fd;
  const length = Math.min(size, 8 * 1024 * 1024);
  const buffer = Buffer.alloc(length);
  const read = await handle
    .read(buffer, 0, length, size - length)
    .catch(() => null);
  if (read === null) return [];
  const lines = buffer.subarray(0, read.bytesRead).toString("utf8").split("\n");
  if (length < size) lines.shift();
  return lines;
}

/** Recover account usage when a statusline publisher had no Codex result.
 * New sessions can have no rate event yet. Inspect recently modified rollouts,
 * choosing by event time rather than letting the newest empty session erase facts.
 * Reads are asynchronous; each tail is bounded to the source reader's 8 MiB cap.
 */
export async function readCodexSubscriptionUsage(
  root: string,
  nowMs: number,
  maxAgeMs: number,
): Promise<{ window?: SubscriptionUsageWindow; reason: string }> {
  let newest: SubscriptionUsageWindow | undefined;
  let files = 0;
  const paths = await Array.fromAsync(
    new Bun.Glob("**/rollout-*.jsonl").scan({
      cwd: root,
      absolute: true,
      onlyFiles: true,
    }),
  ).catch(() => []);
  for (const path of paths) {
    const info = await stat(path).catch(() => null);
    if (info === null || !info.isFile() || nowMs - info.mtimeMs > maxAgeMs)
      continue;
    files++;
    const lines = await readTail(path, info.size);
    const window = lines
      .map((line) => windowFromLine(line, info.mtimeMs, nowMs, maxAgeMs))
      .filter((value) => value !== undefined)
      .toSorted((a, b) => b.measured_at - a.measured_at)[0];
    if (
      window !== undefined &&
      (newest === undefined || window.measured_at > newest.measured_at)
    )
      newest = window;
  }
  if (newest !== undefined)
    return { window: newest, reason: "fresh Codex 7d rollout rate event" };
  return {
    reason:
      files === 0
        ? "no fresh Codex rollout source"
        : "no fresh Codex 7d rate event in bounded rollout tails",
  };
}
