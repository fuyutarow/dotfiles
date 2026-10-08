// Local JSON codecs ported from agents/hooks/zod.ts (now tools/shared/src/zod.ts).
// Use the permitted shared Zod primitive so hooks and the package validate with the same pin.
import { fromThrowable } from "neverthrow";
import { z } from "../../shared/src/zod.ts";

export { z };
// Throw → Result, synchronously (neverthrow's, from the same bundle): for the zero-dep files that
// cannot import neverthrow from node_modules. The async floor is ./attempt.ts.
export { fromThrowable };

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

/**
 * JSON text → a value validated by `schema`, in one zod step:
 * `jsonOf(Schema).safeParse(text)` gives the typed value, or a zod error covering both bad JSON
 * and the wrong shape.
 */
export function jsonOf<S extends z.ZodType>(schema: S) {
  return jsonText.pipe(schema);
}
