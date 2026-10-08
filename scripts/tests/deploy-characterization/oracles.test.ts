import { describe, expect, test } from "bun:test";
import { buildPlan } from "../../box-init.ts";
import { pushAuth, type AuthPushDependencies } from "../../auth-push.ts";
import { changedPaths } from "./scope.ts";

describe("deploy characterization seams", () => {
  test("box-init plan preserves the ordered no-repo actions", () => {
    expect(
      buildPlan({ alias: "fixture-host", repos: [] }).map((step) => step.name),
    ).toEqual([
      "reach",
      "auth:push",
      "codex host",
      "index dotfiles",
      "doctor:remote",
    ]);
  });

  test("auth transfer runner observes probe, stdin transfer, then status", async () => {
    const calls: { argv: readonly string[]; stdin?: string }[] = [];
    const dependencies: AuthPushDependencies = {
      home: "/fixture/home",
      platform: "linux",
      user: "fixture",
      readFile: () => Promise.resolve("credential-bytes"),
      run: (argv, stdin) => {
        calls.push({ argv, ...(stdin === undefined ? {} : { stdin }) });
        return Promise.resolve({
          code: 0,
          out: calls.length === 1 ? "MISSING" : "",
          err: "",
        });
      },
    };

    expect(await pushAuth("fixture-host", ["codex"], false, dependencies)).toBe(
      0,
    );
    expect(calls).toHaveLength(3);
    expect(calls[0]?.argv.at(-1)).toContain("sha256sum");
    expect(calls[1]?.argv.at(-1)).toContain("cat >");
    expect(calls[2]?.argv.at(-1)).toBe("codex login status");
    expect(calls[1]?.stdin).toBe("credential-bytes");
  });
});

describe("scope oracle", () => {
  test("collects changed paths from unified jj diff headers", () => {
    expect(
      changedPaths(
        [
          "diff --git a/old.ts b/new.ts",
          "--- a/old.ts",
          "+++ b/new.ts",
          "diff --git a/remove.ts b/remove.ts",
          "--- a/remove.ts",
          "+++ /dev/null",
        ].join("\n"),
      ),
    ).toEqual(["new.ts", "remove.ts"]);
  });
});
