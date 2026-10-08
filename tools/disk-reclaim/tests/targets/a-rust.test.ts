import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempRoot } from "../fixtures/temp.ts";
import { createRustTarget } from "../../src/targets/rust.ts";

const config = {
  repo_roots: [],
  repos: [],
  scratch_roots: [],
  delete_roots: [],
  regenerable_ignored: [],
  session_grace_hours: 24,
  ignore_unreadable_procs: [],
};

const context = (procDir: string) => ({
  mode: "plan" as const,
  explicit: false,
  config,
  procDir,
  log: () => {},
});

function processFixture(
  procDir: string,
  pid: string,
  name: string,
  cwd: string,
  options: { fd?: string; env?: string } = {},
): void {
  const base = join(procDir, pid);
  mkdirSync(join(base, "fd"), { recursive: true });
  writeFileSync(join(base, "comm"), `${name}\n`);
  writeFileSync(
    join(base, "stat"),
    `${pid} (${name}) S ${Array.from({ length: 18 }, () => "0").join(" ")} 123\n`,
  );
  writeFileSync(join(base, "environ"), options.env ?? "");
  symlinkSync(`/usr/bin/${name}`, join(base, "exe"));
  symlinkSync(cwd, join(base, "cwd"));
  if (options.fd !== undefined) symlinkSync(options.fd, join(base, "fd/3"));
}

function plan(root: string, procDir: string) {
  return createRustTarget(() => root).plan(context(procDir));
}

describe("rust target", () => {
  test("a recent but idle target has a RECLAIM row", () => {
    const root = tempRoot("reclaim-rust-recent-");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(root, { recursive: true, force: true });
    });
    const target = join(root, "project/target");
    mkdirSync(target, { recursive: true });
    writeFileSync(join(root, "project/Cargo.toml"), "[package]");
    const procDir = join(root, "proc");
    mkdirSync(procDir);
    const rows = plan(root, procDir);
    expect(rows.map(({ path, verdict }) => [path, verdict])).toEqual([
      [target, "RECLAIM"],
    ]);
  });

  test("live cargo cwd inside the project keeps that target", () => {
    const root = tempRoot("reclaim-rust-cargo-");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(root, { recursive: true, force: true });
    });
    const project = join(root, "project");
    const target = join(project, "target");
    const procDir = join(root, "proc");
    mkdirSync(target, { recursive: true });
    mkdirSync(procDir);
    writeFileSync(join(project, "Cargo.toml"), "[package]");
    processFixture(procDir, "10", "cargo", project);
    expect(plan(root, procDir)[0]).toMatchObject({
      path: target,
      verdict: "KEEP",
      reason: "live Rust build process uses this target",
    });
  });

  test("an open fd under the target keeps it even when cwd is elsewhere", () => {
    const root = tempRoot("reclaim-rust-fd-");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(root, { recursive: true, force: true });
    });
    const project = join(root, "project");
    const target = join(project, "target");
    const procDir = join(root, "proc");
    mkdirSync(target, { recursive: true });
    mkdirSync(procDir);
    writeFileSync(join(project, "Cargo.toml"), "[package]");
    processFixture(procDir, "11", "rustc", "/elsewhere", {
      fd: join(target, "artifact"),
    });
    expect(plan(root, procDir)[0]?.verdict).toBe("KEEP");
  });

  test("CARGO_TARGET_DIR pointing at the target keeps it", () => {
    const root = tempRoot("reclaim-rust-cargo-dir-");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(root, { recursive: true, force: true });
    });
    const project = join(root, "project");
    const target = join(project, "target");
    const procDir = join(root, "proc");
    mkdirSync(target, { recursive: true });
    mkdirSync(procDir);
    writeFileSync(join(project, "Cargo.toml"), "[package]");
    processFixture(procDir, "14", "sccache", "/elsewhere", {
      env: `CARGO_TARGET_DIR=${target}\0`,
    });
    expect(plan(root, procDir)[0]?.verdict).toBe("KEEP");
  });

  test("unreadable process facts with no confirmed use produce ASK", () => {
    const root = tempRoot("reclaim-rust-unknown-");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(root, { recursive: true, force: true });
    });
    const project = join(root, "project");
    const target = join(project, "target");
    const procDir = join(root, "missing-proc");
    mkdirSync(target, { recursive: true });
    writeFileSync(join(project, "Cargo.toml"), "[package]");
    const rows = plan(root, procDir);
    expect(rows[0]).toMatchObject({ path: target, verdict: "ASK" });
  });

  test("a live repo process without a build process makes the target ASK", () => {
    const root = tempRoot("reclaim-rust-session-");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(root, { recursive: true, force: true });
    });
    const project = join(root, "project");
    const target = join(project, "target");
    const procDir = join(root, "proc");
    mkdirSync(join(target, "incremental"), { recursive: true });
    mkdirSync(procDir);
    writeFileSync(join(project, "Cargo.toml"), "[package]");
    processFixture(procDir, "13", "claude", project);
    expect(plan(root, procDir)).toMatchObject([
      {
        path: target,
        verdict: "ASK",
        reason:
          "live process cwd is inside the repository; no Rust build process uses this target",
      },
      {
        path: join(target, "incremental"),
        verdict: "ASK",
      },
    ]);
    expect(plan(root, procDir)[0]).toMatchObject({
      path: target,
      verdict: "ASK",
      reason:
        "live process cwd is inside the repository; no Rust build process uses this target",
    });
  });

  test("every discovered target gets a row, including a non-Cargo target", () => {
    const root = tempRoot("reclaim-rust-all-");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(root, { recursive: true, force: true });
    });
    const target = join(root, "not-rust/target");
    mkdirSync(target, { recursive: true });
    const procDir = join(root, "proc");
    mkdirSync(procDir);
    expect(plan(root, procDir)).toMatchObject([
      {
        path: target,
        verdict: "ASK",
        reason:
          "Cargo.toml is missing or unreadable; target ownership is unknown",
      },
    ]);
  });
});
