import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { jsonOf, maybe, z } from "../zod.ts";
import type { SessionStatus } from "../session-status.ts";
import { claudeTranscriptWindow } from "./claude-transcript-window.ts";

const RateWindowSchema = z.object({
  used_percentage: maybe(z.number()),
  resets_at: maybe(z.number()), // Unix epoch seconds
});
const RateLimitsSchema = z.object({
  five_hour: z.unknown().optional(),
  seven_day: z.unknown().optional(),
});

type RateWindowRead = {
  window: { usedPercent: number; resetsAt: number | undefined } | undefined;
  unreadable: boolean;
};
// Claude Code documents each window as independently absent: a missing key is a legitimate
// absence, while a sent value that cannot be read is a failure. Keep the two apart here.
function readRateWindow(raw: unknown): RateWindowRead {
  if (raw === undefined || raw === null)
    return { window: undefined, unreadable: false };
  const parsed = RateWindowSchema.safeParse(raw);
  if (!parsed.success || parsed.data.used_percentage === undefined)
    return { window: undefined, unreadable: true };
  return {
    window: {
      usedPercent: parsed.data.used_percentage,
      resetsAt: parsed.data.resets_at,
    },
    unreadable: false,
  };
}

function readRateLimits(raw: unknown): SessionStatus["rateLimits"] {
  if (raw === undefined || raw === null) return undefined;
  const parsed = RateLimitsSchema.safeParse(raw);
  if (!parsed.success)
    return {
      fiveHour: undefined,
      sevenDay: undefined,
      unreadable: ["fiveHour", "sevenDay"],
    };
  const five = readRateWindow(parsed.data.five_hour);
  const seven = readRateWindow(parsed.data.seven_day);
  return {
    fiveHour: five.window,
    sevenDay: seven.window,
    unreadable: [
      ...(five.unreadable ? (["fiveHour"] as const) : []),
      ...(seven.unreadable ? (["sevenDay"] as const) : []),
    ],
  };
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

function modelWindow(value: number | undefined): number | undefined {
  return value !== undefined && value > 0 ? value : undefined;
}

async function configuredWindow(
  model: string | undefined,
): Promise<number | undefined> {
  if (model === undefined) return undefined;
  const key = model.replace(/\[1m\]$/iu, "");
  const schema = z.object({
    modelSettings: z
      .record(
        z.string(),
        z.object({ autoCompactWindow: z.number().positive().optional() }),
      )
      .optional(),
  });
  return Promise.try(async () => {
    const root = process.env["CLAUDE_CONFIG_DIR"] ?? join(homedir(), ".claude");
    const parsed = jsonOf(schema).safeParse(
      await readFile(join(root, "settings.json"), "utf8"),
    );
    return parsed.success
      ? parsed.data.modelSettings?.[key]?.autoCompactWindow
      : undefined;
  }).catch(() => void 0);
}

// Claude Code's stdin contract ends here. The transformed output is the provider-neutral input
// consumed by buildDataframe(); keep the wire keys out of the common statusline model.
export const ClaudeStatuslineInputSchema = z
  .object({
    cwd: maybe(z.string()),
    session_id: maybe(z.string()),
    transcript_path: maybe(z.string()),
    // This is a change signal for Claude's addressable agent name cache, not necessarily its name.
    session_name: maybe(z.string()),
    workspace: maybe(
      z.object({
        current_dir: maybe(z.string()),
        // The project root Claude Code names its per-session task directory after.
        project_dir: maybe(z.string()),
      }),
    ),
    model: maybe(
      z.object({ display_name: maybe(z.string()), id: maybe(z.string()) }),
    ),
    context_window: maybe(
      z.object({
        total_input_tokens: maybe(z.number()),
        context_window_size: maybe(z.number()),
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
    // Read by readRateLimits(): absent and unreadable must stay distinguishable.
    rate_limits: z.unknown().optional(),
    worktree: maybe(z.object({ name: maybe(z.string()) })),
  })
  .transform(async (input): Promise<SessionStatus> => ({
    cwd:
      input.cwd !== undefined && input.cwd !== ""
        ? input.cwd
        : input.workspace?.current_dir,
    projectDir:
      input.workspace?.project_dir !== undefined &&
      input.workspace.project_dir !== ""
        ? input.workspace.project_dir
        : undefined,
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
            compactWindow:
              (await configuredWindow(input.model?.id)) ??
              (await claudeTranscriptWindow(
                input.transcript_path,
                input.session_id,
              )),
            modelWindow: modelWindow(input.context_window.context_window_size),
          },
    effort: input.effort?.level,
    rateLimits: readRateLimits(input.rate_limits),
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
