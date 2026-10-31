import { describe, expect, test } from "bun:test";
import assert from "node:assert/strict";
import { createSystemTarget } from "../../src/targets/system.ts";
import type { Context } from "../../src/targets/index.ts";

const systemContext = {
  mode: "plan",
  explicit: false,
  config: {
    repo_roots: [],
    repos: [],
    scratch_roots: [],
    delete_roots: [],
    regenerable_ignored: [],
    session_grace_hours: 24,
    ignore_unreadable_procs: ["sshd"],
  },
  log: () => {},
} satisfies Context;

describe("system target", () => {
  test("never invokes sudo in planning; runner is injected for actions", async () => {
    const calls: string[][] = [];
    const target = createSystemTarget({
      wsl: true,
      sudo: true,
      fstrimUnitInstalled: false,
      rootUnitSudo: false,
      run: (argv) => {
        calls.push(argv);
        return { code: 0, out: "", err: "" };
      },
    });
    const ctx = {
      mode: "plan" as const,
      explicit: false,
      config: {
        repo_roots: [],
        repos: [],
        scratch_roots: [],
        delete_roots: [],
        regenerable_ignored: [],
        session_grace_hours: 24,
        ignore_unreadable_procs: ["sshd"],
      },
      log: () => {},
    };
    const plan = await target.plan(ctx);
    expect(plan.map((c) => c.action.argv[0])).toEqual(["sudo", "sudo", "sudo"]);
    expect(calls).toEqual([]);
    const candidate = plan[0];
    assert.ok(candidate !== undefined);
    expect(await target.act(candidate, ctx)).toMatchObject({ ok: true });
    expect(calls).toHaveLength(1);
  });
  test("blind unmet preconditions skip; explicitly named unmet target exits 4", async () => {
    expect(
      await createSystemTarget({
        wsl: false,
        sudo: false,
        rootUnitSudo: false,
        fstrimUnitInstalled: false,
      }).available(),
    ).toMatchObject({ available: false });
  });

  test("uses the installed fstrim unit without requiring broad passwordless sudo", async () => {
    const calls: string[][] = [];
    const target = createSystemTarget({
      wsl: true,
      sudo: false,
      rootUnitSudo: true,
      fstrimUnitInstalled: true,
      run: (argv) => {
        calls.push(argv);
        return { code: 0, out: "", err: "" };
      },
    });
    expect(await target.available()).toMatchObject({ available: true });
    const candidate = (await target.plan(systemContext))[0];
    expect(candidate).toBeDefined();
    if (candidate === undefined) return;
    expect(candidate.action.argv).toEqual([
      "sudo",
      "-n",
      "/usr/bin/systemctl",
      "start",
      "dotfiles-fstrim.service",
    ]);
    expect(candidate.reason).toContain("installed dotfiles fstrim unit");
    expect(await target.act(candidate, systemContext)).toMatchObject({
      ok: true,
    });
    expect(calls).toEqual([candidate.action.argv]);
  });

  test("reports the legacy direct fstrim fallback if the unit is absent", async () => {
    const target = createSystemTarget({
      wsl: true,
      sudo: true,
      fstrimUnitInstalled: false,
      rootUnitSudo: false,
      run: () => ({ code: 0, out: "", err: "" }),
    });
    const candidate = (await target.plan(systemContext))[2];
    expect(candidate).toBeDefined();
    if (candidate === undefined) return;
    expect(candidate.action.argv).toEqual(["sudo", "-n", "fstrim", "-v", "/"]);
    expect(candidate.reason).toContain("fallback");
  });
});
