// The repo's one way into zod for JSON text — a copy of dotfiles' agents/hooks/zod.ts for a repo
// that imports zod normally (dotfiles vendors it only because its hooks run before `bun install`).
// The house lint policy bans JSON.parse outside a zod codec; this file is that codec, so every other
// file decodes JSON with `jsonOf(Schema).safeParse(text)`: the typed value, or a zod error covering
// both bad JSON (code invalid_format) and the wrong shape — no throw, no `unknown` round trip.
// Copied from writing-typescript/assets/consumer-repo/zod.ts; its test there keeps it in step.
import { fromThrowable } from "neverthrow";
import { z } from "zod";

export { z };

/**
 * JSON text as zod input: a JSON syntax error becomes a zod issue (code `invalid_format`, format
 * `json`), never a throw — zod does not catch an exception thrown inside a codec or transform.
 */
export const jsonText = z.codec(z.string(), z.unknown(), {
  decode: (text, ctx) => {
    const parsed = fromThrowable(
      (): unknown => JSON.parse(text),
      (e) => (e instanceof Error ? e.message : String(e)),
    )();
    if (parsed.isOk()) return parsed.value;
    ctx.issues.push({
      code: "invalid_format",
      format: "json",
      input: text,
      message: `not valid JSON: ${parsed.error}`,
    });
    return z.NEVER;
  },
  encode: (value) => JSON.stringify(value),
});

/** JSON text → a value validated by `schema`, in one zod step. */
export function jsonOf<S extends z.ZodType>(schema: S) {
  return jsonText.pipe(schema);
}
