import { expect, test } from "bun:test";
import rootPackage from "../../../package.json" with { type: "json" };
import packageJson from "../package.json" with { type: "json" };
import { COMMANDS } from "../src/next/cli.ts";

test("the run package exposes only the agx-worker bin", () => {
  expect(rootPackage.bin.agx).toBe("tools/agx/src/agx.ts");
  expect(rootPackage.bin["agx-worker"]).toBe(
    "tools/agx-worker/src/next/cli.ts",
  );
  expect(Object.keys(rootPackage.bin)).not.toContain("agx-run");
  expect(packageJson.name).toBe("@dotfiles/agx-worker");
  expect(packageJson.version).toMatch(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u,
  );
  expect(packageJson.bin).toEqual({
    "agx-worker": "src/next/cli.ts",
  });
});

test("the CLI exposes the run, doctor, and process interface commands", () => {
  expect(COMMANDS.map((entry) => entry.name)).toEqual([
    "dispatch",
    "run",
    "check",
    "ls",
    "judge",
    "stats",
    "doctor",
    "roster",
  ]);
});
