// Provider-neutral facts supplied to the statusline builder. Host wire formats are parsed and
// translated at their adapter boundary; this module contains no provider field names.
export interface SessionStatus {
  cwd?: string | undefined;
  sessionId?: string | undefined;
  sessionName?: string | undefined;
  model?: { name?: string | undefined; id?: string | undefined } | undefined;
  context?:
    | {
        inputTokens?: number | undefined;
        usedPercent?: number | undefined;
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
