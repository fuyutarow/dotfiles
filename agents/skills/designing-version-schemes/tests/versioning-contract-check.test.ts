import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve(
  import.meta.dir,
  "../scripts/versioning-contract-check.ts",
);
const validFixture = resolve(import.meta.dir, "fixtures/valid-contract.md");
const temporaryDirectories: string[] = [];

async function runScript(
  fixture: string,
): Promise<Readonly<{ exitCode: number; stdout: string }>> {
  const child = Bun.spawn({
    cmd: ["bun", script, fixture],
    stderr: "pipe",
    stdout: "pipe",
    timeout: 10_000,
  });
  const [stdout, , exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, stdout };
}

async function run(
  content: string,
): Promise<Readonly<{ exitCode: number; stdout: string }>> {
  const directory = await mkdtemp(join(tmpdir(), "versioning-contract-"));
  temporaryDirectories.push(directory);
  const fixture = join(directory, "VERSIONING-CONTRACT.md");
  await writeFile(fixture, content);
  return runScript(fixture);
}

async function clearTemporaryDirectories(): Promise<void> {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
}

afterEach(async () => clearTemporaryDirectories());

async function validContract(): Promise<string> {
  return readFile(validFixture, "utf8");
}

describe("versioning-contract-check", () => {
  test("accepts a complete custom calendar contract", async () => {
    const result = await runScript(validFixture);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("V3  PASS");
    expect(result.stdout).toContain("versioning contract: FAIL=0");
  });

  test("rejects an undecided SemVer claim", async () => {
    const result = await run(
      (await validContract()).replace("syntax-only:", "undecided:"),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("SemVer claim must begin");
  });

  test("rejects an unnamed comparator", async () => {
    const result = await run(
      (await validContract()).replace(
        "Comparator: target SemVer parser and deployment tag sorter",
        "Comparator: none",
      ),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("a named comparator is required");
  });

  test("rejects missing transition fields", async () => {
    const result = await run(
      (await validContract()).replace(
        "- Same-period second release: increment REVISION even when the release contains a feature\n",
        "",
      ),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "required field: Same-period second release",
    );
  });
});
