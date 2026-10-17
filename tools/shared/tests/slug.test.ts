import { expect, test } from "bun:test";
import { validateSlug } from "../src/slug.ts";

test.each(["arena-g3", "a", "0", "123-abc"])("accepts %s unchanged", (slug) => {
  expect(validateSlug(slug, "tkt new")).toEqual({ ok: true, value: slug });
});

test.each([
  ["arena_g3", "arena-g3"],
  ["Arena-G3", "arena-g3"],
  ["-arena--g3-", "arena-g3"],
  ["arena.g3", "arena-g3"],
  ["arena/g3", "arena-g3"],
  ["arena\ng3", "arena-g3"],
  ["é", "x"],
  ["", "x"],
])("refuses %j and suggests %s", (slug, suggestion) => {
  const result = validateSlug(slug, "tkt new");
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toContain(`tkt new ${suggestion}`);
  expect(validateSlug(suggestion, "tkt new").ok).toBe(true);
});
