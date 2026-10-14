import { expect, test } from "bun:test";
import packageJson from "../../package.json" with { type: "json" };

test("agx run resolves to the five-command next CLI", () => {
  expect(packageJson.bin.agx).toBe("src/next/cli.ts");
});
