// bun test characterizing CURRENT behavior of lint-floor.ts (small-trio family:
// skill-check.ts / mise-contract.ts / lint-floor.ts). This file pins the exact
// refusal text, exit codes, and passthrough semantics as the bracket for the
// upcoming refactor.
import { describe, expect, test } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "../../../hooks/zod.ts";
import { decodedJson } from "../../../hooks/tests/decode.ts";

const RelayedSchema = z.array(z.string());
const FLOOR = new URL("../scripts/lint-floor.ts", import.meta.url).pathname;
const DEFAULT_CONFIG = new URL("../assets/textlintrc.json", import.meta.url)
  .pathname;
const REFUSAL =
  "REFUSED: --fix is banned on the prose floor (detect-only; prh replacements are guidance, not text).\n" +
  "See references/machine-floor.md — the anti-auto-substitution rule.\n";

async function run(
  args: string[],
  env?: Record<string, string>,
  cwd?: string,
): Promise<{ out: string; err: string; code: number }> {
  // bounded: one-shot invocation of a tiny fixture, no watch mode
  const proc = Bun.spawn(["bun", FLOOR, ...args], {
    ...(env === undefined ? {} : { env: { ...process.env, ...env } }),
    ...(cwd === undefined ? {} : { cwd }),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return {
    out,
    err,
    code,
  };
}

async function fakeBunx() {
  const dir = await mkdtemp(join(tmpdir(), "lint-floor-bunx-"));
  const binary = join(dir, "bunx");
  await writeFile(
    binary,
    "#!/usr/bin/env bun\n" +
      "process.stdout.write(JSON.stringify(Bun.argv.slice(2)));\n" +
      "process.exit(Number(process.env.FAKE_BUNX_EXIT ?? 0));\n",
  );
  await chmod(binary, 0o755);
  return {
    dir,
    env: { PATH: `${dir}:${process.env["PATH"] ?? ""}` },
    [Symbol.asyncDispose]: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

describe("lint-floor --fix refusal", () => {
  test("--fix is refused: exact stderr text, empty stdout, exit 2", async () => {
    const { out, err, code } = await run(["--fix"]);
    expect(out).toBe("");
    expect(err).toBe(REFUSAL);
    expect(code).toBe(2);
  });

  test("--fix-dry-run is refused identically to --fix", async () => {
    const { out, err, code } = await run(["--fix-dry-run"]);
    expect(out).toBe("");
    expect(err).toBe(REFUSAL);
    expect(code).toBe(2);
  });

  test("the ban fires wherever --fix appears in argv, not only as argv[0]", async () => {
    const { out, err, code } = await run([
      "some-file.md",
      "--fix",
      "--rule",
      "foo",
    ]);
    expect(out).toBe("");
    expect(err).toBe(REFUSAL);
    expect(code).toBe(2);
  });

  test("refusal short-circuits before textlint spawns: fires even with a bogus config path", async () => {
    const { err, code } = await run(["--fix"], {
      LINT_PROSE_CONFIG: "/nonexistent/path/textlintrc.json",
    });
    expect(err).toBe(REFUSAL);
    expect(code).toBe(2);
  });
});

describe("lint-floor passthrough (no --fix)", () => {
  test("fixture disposal waits for filesystem cleanup", async () => {
    const binary = await (async () => {
      await using fixture = await fakeBunx();
      const path = join(fixture.dir, "bunx");
      expect(await Bun.file(path).exists()).toBe(true);
      return path;
    })();
    expect(await Bun.file(binary).exists()).toBe(false);
  });

  test("magic-looking unknown flags are forwarded byte-for-byte, not lost in unknownFlags", async () => {
    await using fixture = await fakeBunx();
    const { out, err, code } = await run(
      ["--__proto__", "target.md"],
      fixture.env,
    );
    const relayed = decodedJson(RelayedSchema, out);
    expect(relayed.slice(-2)).toEqual(["--__proto__", "target.md"]);
    expect(err).toBe("");
    expect(code).toBe(0);
  });

  test("preserves a downstream -- separator and token order", async () => {
    await using fixture = await fakeBunx();
    const { out, err, code } = await run(
      ["--version", "--", "--downstream-only", "target.md"],
      fixture.env,
    );
    const relayed = decodedJson(RelayedSchema, out);
    expect(relayed.slice(-4)).toEqual([
      "--version",
      "--",
      "--downstream-only",
      "target.md",
    ]);
    expect(err).toBe("");
    expect(code).toBe(0);
  });

  test("exit code passes through cleanly: --version", async () => {
    await using fixture = await fakeBunx();
    const { out, err, code } = await run(["--version"], fixture.env);
    expect(decodedJson(RelayedSchema, out).slice(-1)).toEqual(["--version"]);
    expect(err).toBe("");
    expect(code).toBe(0);
  });

  test("nonzero exit code passes through unchanged", async () => {
    await using fixture = await fakeBunx();
    const { code } = await run(["--version"], {
      ...fixture.env,
      FAKE_BUNX_EXIT: "7",
    });
    expect(code).toBe(7);
  });

  test("LINT_PROSE_CONFIG env override is honored by the spawned textlint", async () => {
    // Inspect the child argv directly; global textlint/rule installs are not
    // prerequisites for verifying this wrapper's config selection.
    await using fixture = await fakeBunx();
    const target = join(fixture.dir, "probe.md");
    await writeFile(
      target,
      "This is a test sentence for lint floor probing.\n",
    );
    const { out, err, code } = await run([target], {
      ...fixture.env,
      LINT_PROSE_CONFIG: "/nonexistent/path/textlintrc.json",
    });
    expect(decodedJson(RelayedSchema, out)).toEqual([
      "textlint",
      "--config",
      "/nonexistent/path/textlintrc.json",
      target,
    ]);
    expect(err).toBe("");
    expect(code).toBe(0);
  });

  test("default config resolves relative to the script, not the caller's cwd", async () => {
    await using fixture = await fakeBunx();
    const target = join(fixture.dir, "probe.md");
    await writeFile(
      target,
      "This is a test sentence for lint floor probing.\n",
    );
    const { out, err, code } = await run([target], fixture.env, fixture.dir);
    expect(decodedJson(RelayedSchema, out)).toEqual([
      "textlint",
      "--config",
      DEFAULT_CONFIG,
      target,
    ]);
    expect(err).toBe("");
    expect(code).toBe(0);
  });
});
