import { expect, test } from "bun:test";
import { validateSlug } from "../src/slug.ts";

test.each(["arena-g3", "a", "0", "123-abc"])("accepts %s unchanged", (slug) => {
  expect(validateSlug(slug, "agx ticket new")).toEqual({
    ok: true,
    value: slug,
  });
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
  const result = validateSlug(slug, "agx ticket new");
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toContain(`agx ticket new ${suggestion}`);
  expect(validateSlug(suggestion, "agx ticket new").ok).toBe(true);
});
