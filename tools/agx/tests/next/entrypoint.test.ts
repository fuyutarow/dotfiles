import { expect, test } from "bun:test";
import packageJson from "../../package.json" with { type: "json" };

test("agx run resolves to the five-command next CLI", () => {
  expect(packageJson.bin.agx).toBe("src/next/cli.ts");
});

test("agx --version prints the package version", () => {
  const result = Bun.spawnSync(
    [process.execPath, "tools/agx/src/next/cli.ts", "--version"],
    {
      cwd: process.cwd(),
    },
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe(`${packageJson.version}\n`);
});

test("agx run --help explains continuation amendments", () => {
  const result = Bun.spawnSync(
    [process.execPath, "tools/agx/src/next/cli.ts", "run", "--help"],
    { cwd: process.cwd() },
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toContain(
    "To amend a continuation, edit the ticket file, then `agx run TICKET --continue RUN`.",
  );
});
