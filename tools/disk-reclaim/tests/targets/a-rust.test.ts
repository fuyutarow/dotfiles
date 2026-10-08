import { describe, expect, test } from "bun:test";
import {
  mkdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tempRoot } from "../fixtures/temp.ts";
import { busyCwds } from "../../src/lib/busy.ts";
import { createRustTarget } from "../../src/targets/rust.ts";

const config = {
  repo_roots: [],
  repos: [],
  scratch_roots: [],
  delete_roots: [],
  regenerable_ignored: [],
  session_grace_hours: 24,
  ignore_unreadable_procs: ["sshd"],
};

describe("rust target", () => {
  test("plans only old Cargo targets, keeps fresh builds and non-project targets", () => {
    const root = tempRoot("reclaim-rust-");
    const oldDays = process.env.RUST_TARGET_DAYS;
    process.env.RUST_TARGET_DAYS = "7";
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      if (oldDays === undefined) delete process.env.RUST_TARGET_DAYS;
      else process.env.RUST_TARGET_DAYS = oldDays;
      rmSync(root, { recursive: true, force: true });
    });
    const old = join(root, "old/target");
    const fresh = join(root, "fresh/target");
    const noManifest = join(root, "no-manifest/target");
    for (const target of [old, fresh, noManifest])
      mkdirSync(target, { recursive: true });
    for (const project of ["old", "fresh"])
      writeFileSync(join(root, project, "Cargo.toml"), "[package]");
    const oldSec = Temporal.Now.instant().epochMilliseconds / 1000 - 10 * 86400;
    const freshSec = Temporal.Now.instant().epochMilliseconds / 1000 - 86400;
    utimesSync(old, oldSec, oldSec);
    utimesSync(fresh, freshSec, freshSec);
    const procDir = join(root, "proc");
    mkdirSync(procDir);
    const planned = createRustTarget(() => root).plan({
      mode: "plan",
      explicit: false,
      config,
      procDir,
      log: () => {},
    });
    expect(planned.map((candidate) => candidate.path)).toEqual([old]);
  });

  test("a recent direct child keeps an otherwise old target", () => {
    const root = tempRoot("reclaim-rust-child-");
    const oldDays = process.env.RUST_TARGET_DAYS;
    process.env.RUST_TARGET_DAYS = "7";
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      if (oldDays === undefined) delete process.env.RUST_TARGET_DAYS;
      else process.env.RUST_TARGET_DAYS = oldDays;
      rmSync(root, { recursive: true, force: true });
    });
    const target = join(root, "project/target");
    mkdirSync(join(target, "debug"), { recursive: true });
    writeFileSync(join(root, "project/Cargo.toml"), "[package]");
    const oldSec = Temporal.Now.instant().epochMilliseconds / 1000 - 10 * 86400;
    const recentSec = Temporal.Now.instant().epochMilliseconds / 1000 - 86400;
    utimesSync(join(target, "debug"), recentSec, recentSec);
    utimesSync(target, oldSec, oldSec);
    expect(
      createRustTarget(() => root).plan({
        mode: "plan",
        explicit: false,
        config,
        log: () => {},
      }),
    ).toEqual([]);
  });

  test("busy cargo/rustc cwd excludes a target and unavailable /proc remains conservative", () => {
    const root = tempRoot("reclaim-rust-busy-");
    const oldDays = process.env.RUST_TARGET_DAYS;
    process.env.RUST_TARGET_DAYS = "7";
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      if (oldDays === undefined) delete process.env.RUST_TARGET_DAYS;
      else process.env.RUST_TARGET_DAYS = oldDays;
      rmSync(root, { recursive: true, force: true });
    });
    const project = join(root, "project");
    const target = join(project, "target");
    mkdirSync(target, { recursive: true });
    writeFileSync(join(project, "Cargo.toml"), "[package]");
    const oldSec = Temporal.Now.instant().epochMilliseconds / 1000 - 10 * 86400;
    utimesSync(target, oldSec, oldSec);
    expect(
      createRustTarget(
        () => root,
        () => [project],
      ).plan({ mode: "plan", explicit: false, config, log: () => {} }),
    ).toEqual([]);
    expect(
      createRustTarget(() => root, unavailableCwds).plan({
        mode: "plan",
        explicit: false,
        config,
        log: () => {},
      }),
    ).toEqual([]);
  });

  test("busy cwd matching uses a path boundary, not a similarly named sibling", () => {
    const root = tempRoot("reclaim-rust-sibling-");
    const oldDays = process.env.RUST_TARGET_DAYS;
    process.env.RUST_TARGET_DAYS = "7";
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      if (oldDays === undefined) delete process.env.RUST_TARGET_DAYS;
      else process.env.RUST_TARGET_DAYS = oldDays;
      rmSync(root, { recursive: true, force: true });
    });
    const project = join(root, "old");
    const target = join(project, "target");
    mkdirSync(target, { recursive: true });
    writeFileSync(join(project, "Cargo.toml"), "[package]");
    const oldSec = Temporal.Now.instant().epochMilliseconds / 1000 - 10 * 86400;
    utimesSync(target, oldSec, oldSec);
    expect(
      createRustTarget(
        () => root,
        () => [join(root, "old-fork")],
      )
        .plan({ mode: "plan", explicit: false, config, log: () => {} })
        .map((candidate) => candidate.path),
    ).toEqual([target]);
  });

  test("shared /proc probe finds cargo/rustc cwd and treats a missing proc tree as unknown", () => {
    const proc = tempRoot("reclaim-rust-proc-");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(proc, { recursive: true, force: true });
    });
    const processes: [string, string, string][] = [
      ["10", "/usr/bin/cargo", "/w/a"],
      ["11", "/opt/rustc", "/w/b"],
      ["12", "/usr/bin/zsh", "/w/c"],
    ];
    for (const [pid, exe, cwd] of processes) {
      mkdirSync(join(proc, pid));
      symlinkSync(exe, join(proc, pid, "exe"));
      symlinkSync(cwd, join(proc, pid, "cwd"));
    }
    expect(busyCwds(proc)?.toSorted()).toEqual(["/w/a", "/w/b"]);
    expect(busyCwds(join(proc, "missing"))).toBeUndefined();
  });
});

function unavailableCwds(): undefined {
  return undefined;
}
