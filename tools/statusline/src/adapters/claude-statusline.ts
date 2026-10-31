import { recoverInvalid } from "../bounded.ts";
import { maybe, z } from "../zod.ts";
import type { SessionStatus } from "../session-status.ts";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fromThrowable, jsonOf } from "../zod.ts";

const SettingsSchema = z.object({
  modelSettings: z
    .record(z.string(), z.object({ autoCompactWindow: z.unknown().optional() }))
    .optional(),
});

function compactWindow(modelId: string | undefined): number | undefined {
  if (modelId === undefined) return undefined;
  return fromThrowable(() => {
    const directory =
      process.env["CLAUDE_CONFIG_DIR"] ?? join(homedir(), ".claude");
    // sync-ok: The small local settings file is read once at the synchronous stdin boundary.
    const text = readFileSync(join(directory, "settings.json"), "utf8");
    const settings = jsonOf(SettingsSchema).safeParse(text);
    const models = settings.success ? settings.data.modelSettings : undefined;
    const entry =
      models?.[modelId] ?? models?.[modelId.replace(/\[1m\]$/u, "")];
    const value = z.number().positive().safeParse(entry?.autoCompactWindow);
    return value.success ? value.data : undefined;
  })().unwrapOr(undefined);
}

const RateWindowSchema = recoverInvalid(
  z.object({
    used_percentage: maybe(z.number()),
    resets_at: maybe(z.number()), // Unix epoch seconds
  }),
);

function rateWindow(window: z.output<typeof RateWindowSchema>) {
  return window === undefined
    ? undefined
    : { usedPercent: window.used_percentage, resetsAt: window.resets_at };
}

function contextTokens(window: {
  total_input_tokens?: number | undefined;
  current_usage?:
    | {
        input_tokens?: number | undefined;
        cache_read_input_tokens?: number | undefined;
        cache_creation_input_tokens?: number | undefined;
      }
    | undefined;
}): number | undefined {
  const usage = window.current_usage;
  if (usage?.input_tokens === undefined) return window.total_input_tokens;
  return (
    usage.input_tokens +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0)
  );
}

// Claude Code's stdin contract ends here. The transformed output is the provider-neutral input
// consumed by buildDataframe(); keep the wire keys out of the common statusline model.
export const ClaudeStatuslineInputSchema = z
  .object({
    cwd: maybe(z.string()),
    session_id: maybe(z.string()),
    // This is a change signal for Claude's addressable agent name cache, not necessarily its name.
    session_name: maybe(z.string()),
    workspace: maybe(z.object({ current_dir: maybe(z.string()) })),
    model: maybe(
      z.object({ display_name: maybe(z.string()), id: maybe(z.string()) }),
    ),
    context_window: maybe(
      z.object({
        total_input_tokens: maybe(z.number()),
        current_usage: maybe(
          z.object({
            input_tokens: maybe(z.number()),
            cache_read_input_tokens: maybe(z.number()),
            cache_creation_input_tokens: maybe(z.number()),
          }),
        ),
        used_percentage: maybe(z.number()),
      }),
    ),
    cost: maybe(
      z.object({
        total_lines_added: maybe(z.number()),
        total_lines_removed: maybe(z.number()),
      }),
    ),
    effort: maybe(z.object({ level: maybe(z.string()) })),
    rate_limits: maybe(
      recoverInvalid(
        z.object({
          five_hour: maybe(RateWindowSchema),
          seven_day: maybe(RateWindowSchema),
        }),
      ),
    ),
    worktree: maybe(z.object({ name: maybe(z.string()) })),
  })
  .transform((input): SessionStatus => ({
    cwd:
      input.cwd !== undefined && input.cwd !== ""
        ? input.cwd
        : input.workspace?.current_dir,
    sessionId: input.session_id,
    sessionName: input.session_name,
    model:
      input.model === undefined
        ? undefined
        : { name: input.model.display_name, id: input.model.id },
    context:
      input.context_window === undefined
        ? undefined
        : {
            inputTokens: contextTokens(input.context_window),
            usedPercent: input.context_window.used_percentage,
            compactWindow: compactWindow(input.model?.id),
          },
    effort: input.effort?.level,
    rateLimits:
      input.rate_limits === undefined
        ? undefined
        : {
            fiveHour: rateWindow(input.rate_limits.five_hour),
            sevenDay: rateWindow(input.rate_limits.seven_day),
          },
    changes:
      input.cost === undefined
        ? undefined
        : {
            linesAdded: input.cost.total_lines_added,
            linesRemoved: input.cost.total_lines_removed,
          },
    worktree:
      input.worktree === undefined ? undefined : { name: input.worktree.name },
  }));
