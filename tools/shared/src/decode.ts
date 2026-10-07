// A test's decode (zod first): safeParse, and a value that is not the expected shape fails the
// test right here with zod's reason — through bun:test's own `expect.unreachable`, never a
// throwing `.parse` (oxlint-policy.toml no-throwing-parse). Tests only: it imports bun:test.
import { expect } from "bun:test";
import { jsonOf, z } from "./zod.ts";

/** `value` as `schema`'s output, or the test fails with zod's message. */
export function decoded<S extends z.ZodType>(
  schema: S,
  value: unknown,
): z.output<S> {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  return expect.unreachable(`not the expected shape: ${r.error.message}`);
}

/** JSON text decoded and validated by `schema` in one zod step (`z.json()` for any JSON value). */
export function decodedJson<S extends z.ZodType>(
  schema: S,
  text: string,
): z.output<S> {
  return decoded(jsonOf(schema), text);
}
