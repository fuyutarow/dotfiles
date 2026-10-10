import { expect, test } from "bun:test";
import { foreignWip, landExit, landSummary } from "../land-verdict.ts";

test("landed and pushed stays explicit for healthy, blocked and failed hosts", () => {
  for (const [state, exit] of [
    ["ok", 0],
    ["blocked: foreign WIP (agents/hooks/storage-headroom.toml)", 0],
    ["FAIL remote command exited 7", 1],
  ] satisfies [string, number][]) {
    const report = {
      commit: "ok",
      push: "ok",
      hosts: { host: state },
    } satisfies Parameters<typeof landExit>[0];
    expect(landExit(report)).toBe(exit);
    expect(landSummary(report, "abc")).toContain("landed and pushed");
    expect(landSummary(report, "abc")).toContain(state);
  }
  expect(landExit({ commit: "failed", push: "pending", hosts: {} })).toBe(1);
  expect(landExit({ commit: "ok", push: "failed", hosts: {} })).toBe(1);
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
