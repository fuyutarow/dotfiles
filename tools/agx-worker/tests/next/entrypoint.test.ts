import { expect, test } from "bun:test";
import packageJson from "../../package.json" with { type: "json" };

test("agx-worker resolves to the five-command CLI", () => {
  expect(packageJson.bin["agx-worker"]).toBe("src/next/cli.ts");
});

test("agx-worker --version prints the package version", () => {
  const result = Bun.spawnSync(
    [process.execPath, "tools/agx-worker/src/next/cli.ts", "--version"],
    {
      cwd: process.cwd(),
    },
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe(`agx-worker ${packageJson.version}\n`);
});

test("agx-worker run --help explains continuation amendments", () => {
  const result = Bun.spawnSync(
    [process.execPath, "tools/agx-worker/src/next/cli.ts", "run", "--help"],
    { cwd: process.cwd() },
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toContain(
    "To amend a continuation, edit the ticket file, then `agx worker run TICKET --continue RUN`.",
  );
});
