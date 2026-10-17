import { expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  leakedBy,
  lintStatic,
  newEntries,
  probeProblems,
  staticFindings,
  SYSTEM_TMP,
} from "../lint-tmp-leaks.ts";

const REPO = resolve(import.meta.dir, "../..");

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "lint-tmp-leaks-"));
}

test("newEntries lists only names absent before", () => {
  expect(newEntries(["a", "b"], ["a", "b", "c", "d"])).toEqual(["c", "d"]);
  expect(newEntries(["a"], [])).toEqual([]);
});

test("staticFindings flags literal temp bases that bypass the per-process TMPDIR", () => {
  // Assembled so this file's own source holds no literal temp-path write.
  const name = "tmp";
  const tmp = `/${name}`;
  const bad = [
    `mkdtempSync("${tmp}/coordinator-repo-")`,
    `mkdtempSync(join("/var${tmp}", "x-"))`,
    "await mkdtemp(`" + tmp + "/${name}-`)",
    `writeFileSync("/dev/${name === "tmp" ? "shm" : ""}/probe", "x")`,
    `mkdirSync('${tmp}/fixture', { recursive: true })`,
  ];
  for (const line of bad)
    expect(staticFindings("t.test.ts", line)).toHaveLength(1);
  expect(staticFindings("t.test.ts", bad.join("\n"))).toHaveLength(bad.length);
});

test("staticFindings leaves tmpdir() bases and /tmp fixture data alone", () => {
  const good = [
    `mkdtempSync(join(tmpdir(), "x-"))`,
    `const socket = "/tmp/elsewhere.sock";`,
    `expect(stderr).toContain("/tmp/claude-<uid>/ and $TMPDIR")`,
    `env: { GRAVEYARD: "/tmp/doctor-must-ignore-this-inherited-value" }`,
  ];
  for (const line of good)
    expect(staticFindings("t.test.ts", line)).toEqual([]);
});

test("staticFindings honors a tmp-ok reason in the comment block directly above", () => {
  // Assembled so this file's own source holds no literal temp-path write.
  const name = "tmp";
  const write = `await mkdtemp("/${name}/so-")`;
  const justified = [
    "// tmp-ok: socket path limit",
    "// second line",
    write,
  ].join("\n");
  expect(staticFindings("t.test.ts", justified)).toEqual([]);
  expect(
    staticFindings("t.test.ts", ["// tmp-ok:", write].join("\n")),
  ).toHaveLength(1);
  expect(
    staticFindings(
      "t.test.ts",
      ["// tmp-ok: far away", "const x = 1;", write].join("\n"),
    ),
  ).toHaveLength(1);
});

test("lintStatic reports file:line for a test under tests/", () => {
  const root = scratch();
  const name = "tmp";
  mkdirSync(join(root, "scripts/tests"), { recursive: true });
  writeFileSync(
    join(root, "scripts/tests/bad.test.ts"),
    `import { mkdtempSync } from "node:fs";\nmkdtempSync("/${name}/bad-");\n`,
  );
  writeFileSync(
    join(root, "scripts/tests/good.test.ts"),
    `mkdtempSync(join(tmpdir(), "good-"));\n`,
  );
  const found = lintStatic(root);
  expect(found).toHaveLength(1);
  expect(found[0]).toContain("scripts/tests/bad.test.ts:2:");
});

test("the repository's own tests pass the static check", () => {
  expect(lintStatic(REPO)).toEqual([]);
});

test("leakedBy names an entry the run leaves and ignores one it removes", () => {
  const root = scratch();
  const leaked = leakedBy(root, () => {
    mkdirSync(join(root, "kept"));
    mkdirSync(join(root, "transient"));
    Bun.spawnSync(["rmdir", join(root, "transient")]);
  });
  expect(leaked).toEqual(["kept"]);
});

test("leakedBy ignores an entry that disappears within the settle window", () => {
  const root = scratch();
  const dir = join(root, "late");
  const leaked = leakedBy(root, () => {
    mkdirSync(dir);
    Bun.spawn(["sh", "-c", `sleep 0.3; rmdir '${dir}'`]);
  });
  expect(leaked).toEqual([]);
});

test("probeProblems names a descendant's leak and removes its private parent", () => {
  const ambientTmp = scratch();
  const leaker = `require("node:fs").mkdirSync(require("node:path").join(require("node:os").tmpdir(), "leaky-fixture"))`;
  const problems = probeProblems(REPO, {
    command: [
      "bun",
      "-e",
      `process.exitCode = Bun.spawnSync([process.execPath, "-e", ${JSON.stringify(leaker)}]).exitCode`,
    ],
    ambientTmp,
  });
  expect(problems).toHaveLength(1);
  expect(problems[0]).toContain("leaky-fixture");
  expect(problems[0]).toContain("new top-level entry left by the probe");
  expect(readdirSync(ambientTmp)).toEqual([]);
});

test("probeProblems fails when the probe exits nonzero", () => {
  const ambientTmp = scratch();
  const problems = probeProblems(REPO, {
    command: ["bun", "-e", "process.exit(7)"],
    ambientTmp,
  });
  expect(problems).toHaveLength(1);
  expect(problems[0]).toContain("exited 7");
  expect(readdirSync(ambientTmp)).toEqual([]);
});

test("probeProblems passes for the real preload probe", () => {
  expect(probeProblems(REPO, { ambientTmp: scratch() })).toEqual([]);
});

test("an unrelated process writing shared /tmp cannot change clean or leaky verdicts", async () => {
  const control = scratch();
  const noise = join(SYSTEM_TMP, `lint-tmp-unrelated-${crypto.randomUUID()}`);
  using cleanup = new DisposableStack();
  for (const leak of [false, true]) {
    const ready = join(control, `ready-${leak}`);
    const noiseEntry = `${noise}-${leak}`;
    cleanup.defer(() => {
      rmSync(noiseEntry, { recursive: true, force: true });
    });
    const bystander = Bun.spawn(
      [
        process.execPath,
        "-e",
        `
      const fs = require("node:fs");
      while (!fs.existsSync(${JSON.stringify(ready)})) await Bun.sleep(10);
      fs.mkdirSync(${JSON.stringify(noiseEntry)});
    `,
      ],
      { timeout: 10_000, stdout: "pipe", stderr: "pipe" },
    );
    const problems = probeProblems(REPO, {
      ambientTmp: control,
      command: [
        process.execPath,
        "-e",
        `
        const fs = require("node:fs");
        fs.writeFileSync(${JSON.stringify(ready)}, "ready");
        while (!fs.existsSync(${JSON.stringify(noiseEntry)})) await Bun.sleep(10);
        if (${leak}) fs.mkdirSync(require("node:path").join(require("node:os").tmpdir(), "real-leak"));
      `,
      ],
    });
    const [exit, stdout, stderr] = await Promise.all([
      bystander.exited,
      new Response(bystander.stdout).text(),
      new Response(bystander.stderr).text(),
    ]);
    expect({ exit, stdout, stderr }).toEqual({
      exit: 0,
      stdout: "",
      stderr: "",
    });
    expect(problems).toHaveLength(leak ? 1 : 0);
    if (leak) expect(problems[0]).toContain("real-leak");
    expect(problems.join("\n")).not.toContain(noiseEntry);
  }
});

test("four concurrent lint:bun invocations all pass", async () => {
  const miseState = scratch();
  const results = await Promise.all(
    Array.from({ length: 4 }, async () => {
      const child = Bun.spawn(["mise", "run", "lint:bun"], {
        cwd: REPO,
        env: {
          ...process.env,
          MISE_STATE_DIR: miseState,
          MISE_TRUSTED_CONFIG_PATHS: REPO,
        },
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
      });
      const [exit, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      return { exit, stdout, stderr };
    }),
  );
  for (const result of results) {
    expect(result.stderr).not.toContain(
      "new top-level entry left by the probe",
    );
    expect(result.exit, result.stdout + result.stderr).toBe(0);
  }
}, 120_000);
