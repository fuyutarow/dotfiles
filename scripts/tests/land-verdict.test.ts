import { expect, test } from "bun:test";
import { foreignWip, landExit, landSummary } from "../land-verdict.ts";

test("land verdict covers only its commit and push", () => {
  const report = { commit: "ok", push: "ok" } satisfies Parameters<
    typeof landExit
  >[0];
  expect(landExit(report)).toBe(0);
  expect(landSummary(report, "abc")).toContain("landed and pushed");
  expect(landExit({ commit: "failed", push: "pending" })).toBe(1);
  expect(landExit({ commit: "ok", push: "failed" })).toBe(1);
});

test("only a valid machine refusal classifies foreign WIP", () => {
  expect(
    foreignWip('FATAL: uncommitted render inputs: ["file"]'),
  ).toBeUndefined();
  expect(
    foreignWip(
      'DOTFILES_RENDER_REFUSAL_V1={"reason":"foreign-wip","paths":["a","b"]}',
    ),
  ).toEqual(["a", "b"]);
  expect(
    foreignWip(
      'DOTFILES_RENDER_REFUSAL_V1={"reason":"foreign-wip","paths":[]}',
    ),
  ).toBeUndefined();
});
