import { z } from "./zod.ts";

export const SessionStatusSchema = z.object({
  cwd: z.string().optional(),
  sessionId: z.string().optional(),
  vendor: z.enum(["claude", "codex"]).optional(),
  transcriptPath: z.string().optional(),
  sessionName: z.string().optional(),
  model: z
    .object({ name: z.string().optional(), id: z.string().optional() })
    .optional(),
  effort: z.string().optional(),
  context: z
    .object({
      inputTokens: z.number().optional(),
      usedPercent: z.number().optional(),
      compactWindow: z.number().optional(),
    })
    .optional(),
});
// Provider-neutral facts supplied to the statusline builder. Host wire formats are parsed and
// translated at their adapter boundary; this module contains no provider field names.
export interface SessionStatus {
  cwd?: string | undefined;
  sessionId?: string | undefined;
  vendor?: "claude" | "codex" | undefined;
  transcriptPath?: string | undefined;
  sessionName?: string | undefined;
  model?: { name?: string | undefined; id?: string | undefined } | undefined;
  context?:
    | {
        inputTokens?: number | undefined;
        usedPercent?: number | undefined;
        compactWindow?: number | undefined;
      }
    | undefined;
  effort?: string | undefined;
  rateLimits?:
    | {
        fiveHour?:
          | {
              usedPercent?: number | undefined;
              resetsAt?: number | undefined;
            }
          | undefined;
        sevenDay?:
          | {
              usedPercent?: number | undefined;
              resetsAt?: number | undefined;
            }
          | undefined;
      }
    | undefined;
  changes?:
    | {
        linesAdded?: number | undefined;
        linesRemoved?: number | undefined;
      }
    | undefined;
  worktree?: { name?: string | undefined } | undefined;
}
