// The repo's one way into Result: import from here, never from "better-result" or "neverthrow".
// Hooks included — they run before `bun install` and fail closed, so better-result comes from the
// generated bundle (scripts/vendor-deps.ts), exactly like zod in ./zod.ts. The types are the
// pinned package's own (agents/hooks/vendor/deps.d.ts), so nothing here is asserted by hand.
//
// Re-export a further better-result name (TaggedError, Panic, matchError, ...) here when the first
// importer needs it; knip rejects re-exports nothing uses.
//
// A callback passed to map/andThen/match/tap that throws is a defect: better-result rethrows it as
// a Panic. Code that can throw goes through Result.try / Result.tryPromise, with `catch` mapping
// the thrown value to the error the caller expects.
export { Result } from "@dotfiles/hooks/vendor/deps.js";
export { Err, Ok } from "@dotfiles/hooks/vendor/deps.js";
export { matchError, TaggedError } from "@dotfiles/hooks/vendor/deps.js";

/** Message text of a caught value, for diagnostics. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
