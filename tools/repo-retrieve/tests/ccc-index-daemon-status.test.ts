import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDaemonStatus } from "../src/ccc-daemon-status.ts";
import { projectDaemonState } from "../src/ccc-index.ts";

const project = "/tmp/a project";

test("daemon parsing and project classification preserve unknown states", () => {
  expect(parseDaemonStatus("No projects loaded.\n").kind).toBe("empty");
  expect(parseDaemonStatus("Projects:\n").kind).toBe("empty");
  expect(
    projectDaemonState(`Projects:\n  ${project} [idle]\n`, 0, project),
  ).toBe("idle");
  expect(
    projectDaemonState(`Projects:\n  ${project} [indexing]\n`, 0, project),
  ).toBe("indexing");
  for (const [text, code] of [
    ["unexpected output", 0],
    [`Projects:\n  ${project} [paused]\n`, 0],
    ["Projects:\n  /other [idle]\n", 0],
    [`Projects:\n  ${project} [idle]\n`, 1],
    ["No projects loaded.", 0],
  ] as const)
    expect(projectDaemonState(text, code, project)).toBe("unknown");
});

test("unknown daemon status is reported during indexing and index status", () => {
  const root = mkdtempSync(join(tmpdir(), "rr-daemon-status-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  mkdirSync(join(root, ".cocoindex_code"));
  writeFileSync(join(root, ".cocoindex_code", "settings.yml"), "");
  const ccc = join(bin, "ccc");
  writeFileSync(
    ccc,
    '#!/bin/sh\nif [ "$1" = daemon ]; then printf \'%s\\n\' "$FAKE_STATUS"; exit "${FAKE_EXIT:-0}"; fi\nprintf \'Chunks: 1\\n\'\n',
  );
  chmodSync(ccc, 0o755);
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env["PATH"] ?? ""}`,
    HOME: root,
    COCOINDEX_CODE_DB_PATH_MAPPING: "",
  };
  const modulePath = join(import.meta.dir, "../src/ccc-index.ts");
  const router = join(import.meta.dir, "../src/repo-retrieve.ts");
  for (const [fakeStatus, fakeExit] of [
    ["reformatted status", "0"],
    [`Projects:\n  ${root} [paused]`, "0"],
    ["", "1"],
  ]) {
    const childEnv = { ...env, FAKE_STATUS: fakeStatus, FAKE_EXIT: fakeExit };
    const wait = Bun.spawnSync(
      [
        process.execPath,
        "-e",
        `import { waitForProjectIdle } from ${JSON.stringify(modulePath)}; process.exit(await waitForProjectIdle(${JSON.stringify(root)}, 1));`,
      ],
      { cwd: root, env: childEnv, stdout: "pipe", stderr: "pipe" },
    );
    expect(wait.exitCode).toBe(2);
    expect(wait.stderr.toString()).toContain("daemon status is unknown");
    const status = Bun.spawnSync(
      [process.execPath, router, "index", "--status"],
      { cwd: root, env: childEnv, stdout: "pipe", stderr: "pipe" },
    );
    expect(status.exitCode).toBe(0);
    expect(status.stdout.toString()).toContain("state=unknown daemon=unknown");
    expect(status.stdout.toString()).toContain("reindex=unknown");
  }
});
