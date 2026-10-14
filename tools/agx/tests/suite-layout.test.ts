import { expect, test } from "bun:test";
import rootPackage from "../../../package.json" with { type: "json" };
import packageJson from "../package.json" with { type: "json" };
import { COMMANDS } from "../src/next/cli.ts";

test("the package exposes the five-command CLI as agx and keeps its alias", () => {
  expect(rootPackage.bin.agx).toBe("tools/agx/src/next/cli.ts");
  expect(rootPackage.bin["agx-next"]).toBe("tools/agx/src/next/cli.ts");
  expect(packageJson.version).toBe("4.0.0");
  expect(packageJson.bin).toEqual({
    agx: "src/next/cli.ts",
    "agx-next": "src/next/cli.ts",
  });
});

test("the CLI exposes exactly the five contract commands", () => {
  expect(COMMANDS.map((entry) => entry.name)).toEqual([
    "run",
    "check",
    "ls",
    "judge",
    "stats",
  ]);
});
