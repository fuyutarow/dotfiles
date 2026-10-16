import { expect, test } from "bun:test";
import rootPackage from "../../../package.json" with { type: "json" };
import packageJson from "../package.json" with { type: "json" };
import { COMMANDS } from "../src/next/cli.ts";

test("the run package exposes agx-run and keeps the agx-next alias", () => {
  expect(rootPackage.bin.agx).toBe("tools/agx/src/agx.ts");
  expect(rootPackage.bin["agx-run"]).toBe("tools/agx-run/src/next/cli.ts");
  expect(rootPackage.bin["agx-next"]).toBe("tools/agx-run/src/next/cli.ts");
  expect(packageJson.name).toBe("@dotfiles/agx-run");
  expect(packageJson.version).toMatch(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u,
  );
  expect(packageJson.bin).toEqual({
    "agx-run": "src/next/cli.ts",
    "agx-next": "src/next/cli.ts",
  });
});

test("the CLI exposes the run and doctor contract commands", () => {
  expect(COMMANDS.map((entry) => entry.name)).toEqual([
    "run",
    "check",
    "ls",
    "judge",
    "stats",
    "doctor",
  ]);
});
