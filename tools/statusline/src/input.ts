import { z } from "./zod.ts";
import { recoverInvalid } from "./bounded.ts";

// ZOD FIRST (writing-typescript, owner call 2026-10-03): every value that enters this file from
// outside — the stdin payload, the cache files under ~/.cache/claude, ~/.claude.json, the storage
// TOML, a failed child process's error object — is parsed with a schema here, and the parsed
// OUTPUT is what the rest of the file uses. A type annotation on JSON.parse() or an `as` cast
// proves nothing, and a hand-written `x is T` guard drifts from the type it guards. The types
// below are z.infer of these schemas, so the schema is the one place a shape is written.
// A file that fails its schema is "no usable file" (a cache is re-sampled) or an explicit n/a
// (~/.claude.json, the TOML, the payload) — never half-trusted.
// A value the source may send as null, or omit, is `undefined` after parsing: one absent state.
export const maybe = <T extends z.ZodType>(schema: T) =>
  schema.nullish().transform((v) => v ?? undefined);

const RateWindowSchema = recoverInvalid(
  z.object({
    used_percentage: maybe(z.number()),
    resets_at: maybe(z.number()), // Unix epoch seconds
  }),
);
export const StatusInputSchema = z.object({
  cwd: maybe(z.string()),
  session_id: maybe(z.string()),
  // NOT the displayed name: it can hold an AI-generated title instead of the real
  // cross-session-addressable name (caught live 2026-08-28 — one session showed its title here
  // while `claude agents --json` still had "firedancer-1d"). Read only as a CHANGE SIGNAL: it is
  // the custom title (or AI title) and moves the instant /rename runs, so a new value bypasses
  // the name cache's TTL (see agentName()).
  session_name: maybe(z.string()),
  workspace: maybe(z.object({ current_dir: maybe(z.string()) })),
  model: maybe(
    z.object({ display_name: maybe(z.string()), id: maybe(z.string()) }),
  ),
  context_window: maybe(
    z.object({
      total_input_tokens: maybe(z.number()),
      current_usage: maybe(z.object({ input_tokens: maybe(z.number()) })),
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
});
export type StatusInput = z.output<typeof StatusInputSchema>;
