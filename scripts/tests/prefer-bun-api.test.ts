// Keep the plugin proof-of-fire suite in the required scripts/tests verification surface.
import "../../tools/oxlint-plugin-dotfiles/tests/prefer-bun-api.test.ts";
import { expect, test } from "bun:test";
import { addedExemptions } from "../bun-api-allowlist.ts";

test("Bun exemption membership can shrink but cannot swap or grow", () => {
  expect(addedExemptions({ a: "sync" }, { a: "sync", b: "sync" })).toEqual([]);
  expect(
    addedExemptions({ a: "sync", c: "sync" }, { a: "sync", b: "sync" }),
  ).toEqual(["c"]);
});
