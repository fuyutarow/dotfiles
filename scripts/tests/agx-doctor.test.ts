import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { jsonOf, z } from "../../tools/shared/src/zod.ts";

const ENTRY = join(import.meta.dir, "../agx-doctor.ts");
const scratch = mkdtempSync(join(tmpdir(), "agx-doctor-test-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function run(args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const child = Bun.spawn(args, {
    cwd,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10_000,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

test("composed doctor rejects the retired environment variable with one diagnostic", async () => {
  const result = await run([process.execPath, ENTRY], scratch, {
    ...process.env,
    AGX_DOCTOR_QUIET: "1",
  });
  expect(result.exitCode).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr.trim().split("\n")).toHaveLength(1);
  expect(result.stderr).toContain("--quiet");
});

test.each(["pass", "findings", "failure", "invalid", "missing"])(
  "mise routing: %s preserves aggregation and the snapshot without suite bins on PATH",
  async (mode) => {
    const root = join(scratch, `mise-${mode}`);
    const bin = join(root, "bin");
    const state = join(root, "state");
    const calls = join(root, "calls");
    await fs.mkdir(bin, { recursive: true });
    const finding = JSON.stringify({
      tool: "agx-ws",
      object: "/fixture/workspace",
      finding: "stale",
      remedy: "agx ws refresh stale",
    });
    if (mode !== "missing") {
      const mise = join(bin, "mise");
      await fs.writeFile(
        mise,
        `#!${process.execPath}
import { appendFile } from "node:fs/promises";
const args = process.argv.slice(2);
await appendFile(${JSON.stringify(calls)}, JSON.stringify(args) + "\\n");
if (args[4] === "agx-ws") {
  if (${JSON.stringify(mode)} === "findings") {
    process.stdout.write(${JSON.stringify(finding + "\n")});
    process.exit(1);
  }
  if (${JSON.stringify(mode)} === "invalid") {
    process.stdout.write("invalid doctor output\\n");
    process.exit(1);
  }
  if (${JSON.stringify(mode)} === "failure") {
    process.stderr.write("fixture doctor failed\\n");
    process.exit(2);
  }
}
`,
      );
      await fs.chmod(mise, 0o755);
    }
    const result = await run([process.execPath, ENTRY, "--json"], root, {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith("AGX_")),
      ),
      PATH: bin,
      AGX_STATE_DIR: state,
    });
    const expectedExit = {
      pass: 0,
      findings: 1,
      failure: 2,
      invalid: 2,
      missing: 2,
    };
    expect(result.exitCode, result.stderr).toBe(expectedExit[mode]);
    const decoded = jsonOf(
      z.object({
        complete: z.boolean(),
        total: z.number(),
        findings: z.array(z.string()),
        kinds: z.record(z.string(), z.number()),
      }),
    ).safeParse(result.stdout);
    expect(decoded.success).toBe(true);
    if (!decoded.success) return;
    const snapshot = decoded.data;
    expect(snapshot.complete).toBe(mode === "pass" || mode === "findings");
    expect(snapshot.total).toBe(
      mode === "findings" || mode === "invalid" ? 1 : 0,
    );
    const expectedFindings = {
      pass: [],
      findings: [finding],
      failure: [],
      invalid: ["invalid doctor output"],
      missing: [],
    };
    const expectedKinds = {
      pass: {},
      findings: { stale: 1 },
      failure: {},
      invalid: { invalid: 1 },
      missing: {},
    };
    expect(snapshot.findings).toEqual(expectedFindings[mode]);
    expect(snapshot.kinds).toEqual(expectedKinds[mode]);
    expect(await Bun.file(join(state, "doctor.json")).text()).toBe(
      result.stdout.trim(),
    );
    if (mode === "missing") {
      expect(result.stderr).toContain("mise");
      expect(result.stderr).toContain("incomplete doctor output");
    } else {
      const actual = (await Bun.file(calls).text())
        .trim()
        .split("\n")
        .toSorted();
      expect(actual).toEqual(
        ["agx-worker", "agx-ws", "agx-ticket"]
          .map((target) =>
            JSON.stringify([
              "-C",
              join(import.meta.dir, "../.."),
              "exec",
              "--",
              target,
              "doctor",
              "--quiet",
            ]),
          )
          .toSorted(),
      );
      if (mode === "failure")
        expect(result.stderr).toContain("fixture doctor failed");
    }
  },
);

test.each(["-V", "--version"])(
  "composed doctor owns its version via %s",
  async (flag) => {
    const result = await run([process.execPath, ENTRY, flag], scratch, {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith("AGX_")),
      ),
      PATH: scratch,
    });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toBe("agx-doctor 1.0.0\n");
  },
);
