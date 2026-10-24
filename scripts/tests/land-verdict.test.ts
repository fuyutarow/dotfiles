import { expect, test } from "bun:test";
import {
  foreignWip,
  landExit,
  landLiveness,
  landSummary,
} from "../land-verdict.ts";

test("land verdict covers only its commit and push", () => {
  const report = { commit: "ok", push: "ok" } satisfies Parameters<
    typeof landExit
  >[0];
  expect(landExit(report)).toBe(0);
  expect(landSummary(report, "abc")).toContain("landed and pushed");
  expect(landExit({ commit: "failed", push: "pending" })).toBe(1);
  expect(landExit({ commit: "ok", push: "failed" })).toBe(1);
});

test("land liveness follows checkout links and package bin map changes", () => {
  expect(landLiveness(["tools/repo-retrieve/src/repo-retrieve.ts"])).toEqual({
    live: true,
    deployPaths: [],
  });
  expect(landLiveness(["tools/repo-retrieve/package.json"])).toEqual({
    live: true,
    deployPaths: [],
  });
  expect(
    landLiveness(
      ["tools/repo-retrieve/package.json"],
      ["tools/repo-retrieve/package.json"],
    ),
  ).toEqual({
    live: false,
    deployPaths: ["tools/repo-retrieve/package.json"],
  });
  expect(landLiveness(["agents/hooks/attempt.ts"])).toEqual({
    live: true,
    deployPaths: [],
  });
  expect(landLiveness(["agents/hooks/hooks.toml"])).toEqual({
    live: false,
    deployPaths: ["agents/hooks/hooks.toml"],
  });
  expect(landLiveness(["scripts/config-registry.ts"])).toEqual({
    live: false,
    deployPaths: ["scripts/config-registry.ts"],
  });
  expect(
    landLiveness(
      ["zsh/environment.d/20-new.conf"],
      [],
      ["zsh/environment.d/20-new.conf"],
    ),
  ).toEqual({
    live: false,
    deployPaths: ["zsh/environment.d/20-new.conf"],
  });
  expect(landLiveness(["docs/notes.md"], [])).toEqual({
    live: true,
    deployPaths: [],
  });
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
