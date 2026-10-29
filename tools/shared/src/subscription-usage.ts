import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fromThrowable, jsonOf, z } from "./zod.ts";

const UsageWindowSchema = z.object({
  used_percent: z.number().nullable(),
  // Epoch seconds, matching both statusline readers.
  resets_at: z.number().nullable(),
  window_seconds: z.number().positive(),
  // Epoch milliseconds; Codex uses the source file's mtime, Claude the input receipt time.
  measured_at: z.number(),
});
const ClaudeWindowsSchema = z.object({
  "5h": UsageWindowSchema.optional(),
  "7d": UsageWindowSchema.optional(),
});
const CodexWindowsSchema = z.object({ "7d": UsageWindowSchema.optional() });

export const SubscriptionUsageSnapshotSchema = z.object({
  version: z.literal(1),
  routes: z.object({
    claude: ClaudeWindowsSchema,
    codex: CodexWindowsSchema,
  }),
});
export type SubscriptionUsageSnapshot = z.output<
  typeof SubscriptionUsageSnapshotSchema
>;
export type SubscriptionUsageWindow = z.output<typeof UsageWindowSchema>;

export function subscriptionUsagePath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const home =
    env["HOME"] !== undefined && env["HOME"] !== "" ? env["HOME"] : homedir();
  return join(
    home,
    ".cache",
    "claude",
    "statusline",
    "subscription-usage.json",
  );
}

/** Read the single statusline-owned snapshot. Invalid or missing data stays unknown. */
export function readSubscriptionUsageSnapshot(
  env: NodeJS.ProcessEnv = process.env,
): SubscriptionUsageSnapshot | undefined {
  const text = fromThrowable(() =>
    readFileSync(subscriptionUsagePath(env), "utf8"),
  )().unwrapOr(undefined);
  if (text === undefined) return undefined;
  const parsed = jsonOf(SubscriptionUsageSnapshotSchema).safeParse(text);
  return parsed.success ? parsed.data : undefined;
}
