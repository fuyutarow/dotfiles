import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditCandidates } from "../../src/targets/audit.ts";

const fixture = () => mkdtempSync(join(tmpdir(), "disk-reclaim-audit-parity-"));
const rowsFor = (home: string, projects = join(home, "Workspace")) =>
  auditCandidates(home, { HOME: home, AUDIT_PROJECTS: projects });

test("audit is read-only and includes cache, graveyard and receipt evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "disk-reclaim-audit-"));
  mkdirSync(join(root, ".cache/item"), { recursive: true });
  mkdirSync(join(root, "grave"));
  mkdirSync(join(root, "state/reclaim"), { recursive: true });
  const receipt = {
    name: "fixture",
    command: [],
    host: "test",
    pid: 1,
    started: "2026-01-01T00:00:00Z",
    ended: "2026-01-01T00:00:00Z",
    exit: 0,
    free_before: 1,
    free_after: 1,
    output: null,
  };
  writeFileSync(
    join(root, "state/reclaim/log.jsonl"),
    `${JSON.stringify(receipt)}\n`,
  );
  const env = {
    HOME: root,
    USER: "x",
    GRAVEYARD: join(root, "grave"),
    XDG_STATE_HOME: join(root, "state"),
  };
  const rows = auditCandidates(root, env);
  expect(rows.map((r) => r.id)).toContain("cache:item");
  expect(rows.some((r) => r.id.startsWith("graveyard:"))).toBe(true);
  expect(rows.some((r) => r.id.startsWith("receipt:"))).toBe(true);
  expect(rows.every((r) => r.verdict === "KEEP")).toBe(true);
});

test("audit reports rust-toolchain pins with their selected channel and size", () => {
  const home = fixture();
  const projects = join(home, "Workspace/project");
  mkdirSync(projects, { recursive: true });
  writeFileSync(
    join(projects, "rust-toolchain.toml"),
    '[toolchain]\nchannel = "nightly-2026-10-01"\n',
  );
  const row = rowsFor(home).find((r) => r.id.includes("rust-pin:"));
  expect(row?.reason).toContain("nightly-2026-10-01");
  expect(row?.bytes).toBeGreaterThan(0);
});

test("audit reports installed rustup toolchains with byte estimates", () => {
  const home = fixture();
  mkdirSync(join(home, ".rustup/toolchains/stable/bin"), { recursive: true });
  writeFileSync(join(home, ".rustup/toolchains/stable/bin/rustc"), "fixture");
  const row = rowsFor(home).find((r) => r.id === "rust-toolchain:stable");
  expect(row?.bytes).toBeGreaterThan(0);
});

test("audit reports Stable VS Code server versions with byte estimates", () => {
  const home = fixture();
  mkdirSync(join(home, ".vscode-server/cli/servers/Stable-abc/server"), {
    recursive: true,
  });
  writeFileSync(
    join(home, ".vscode-server/cli/servers/Stable-abc/server/code"),
    "fixture",
  );
  const row = rowsFor(home).find((r) => r.id === "vscode-server:Stable-abc");
  expect(row?.bytes).toBeGreaterThan(0);
});

test("audit reports self-updating CLI releases with byte estimates", () => {
  const home = fixture();
  mkdirSync(join(home, ".local/share/claude/versions/1.2.3"), {
    recursive: true,
  });
  writeFileSync(
    join(home, ".local/share/claude/versions/1.2.3/cli"),
    "fixture",
  );
  const row = rowsFor(home).find((r) => r.id === "version-store:claude:1.2.3");
  expect(row?.bytes).toBeGreaterThan(0);
});

test("audit preserves the current self-updating CLI release status", () => {
  const home = fixture();
  const versions = join(home, ".local/share/claude/versions");
  mkdirSync(join(versions, "1.2.3"), { recursive: true });
  writeFileSync(join(versions, "1.2.3/cli"), "fixture");
  mkdirSync(join(home, ".local/bin"), { recursive: true });
  symlinkSync(join(versions, "1.2.3/cli"), join(home, ".local/bin/claude"));
  expect(
    rowsFor(home).find((r) => r.id === "version-store:claude:1.2.3")?.reason,
  ).toContain("current");
});

test("audit reports the eight largest build directories with byte estimates", () => {
  const home = fixture();
  const projects = join(home, "projects");
  for (let n = 0; n < 9; n++) {
    const dir = join(projects, `p${n}/target`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "artifact"), "x".repeat((n + 1) * 2048));
  }
  const builds = rowsFor(home, projects).filter((r) =>
    r.id.startsWith("build:"),
  );
  expect(builds).toHaveLength(8);
  expect(builds.every((r) => (r.bytes ?? 0) > 0)).toBe(true);
  expect(builds[0]?.bytes).toBeGreaterThan(builds.at(-1)?.bytes ?? 0);
});

test("audit reports optional rust-docs with byte estimates", () => {
  const home = fixture();
  const docs = join(home, ".rustup/toolchains/stable/share/doc/rust/html");
  mkdirSync(docs, { recursive: true });
  writeFileSync(join(docs, "index.html"), "fixture");
  const row = rowsFor(home).find((r) => r.id === "rust-docs:stable");
  expect(row?.bytes).toBeGreaterThan(0);
});
