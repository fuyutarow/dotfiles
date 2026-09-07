import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decisionOf, runHook } from "./helpers.ts";

const HOOK = "assign-command.ts";
const payload = (prompt: string, cwd = "/home/fuyu/Workspace/myproj") => ({
  prompt,
  cwd,
});

describe("assign-command: pass-through for ordinary prompts", () => {
  test("a normal prompt -> exit 0, no output", () => {
    const r = runHook(HOOK, payload("explain this bug to me"));
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("/assign mentioned mid-sentence (not at the start) -> exit 0, no output", () => {
    const r = runHook(HOOK, payload("do you support /assign as a feature?"));
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("malformed stdin JSON -> fails open, exit 0, no output", () => {
    const r = runHook(HOOK, "not json");
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });
});

describe("assign-command: usage errors block without a model turn", () => {
  test("/assign with no role -> block, usage reason", () => {
    const r = runHook(HOOK, payload("/assign"));
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.decision).toBe("block");
    expect(out.reason).toMatch(/usage/i);
  });

  test("/assign with a malformed role -> block, shape reason", () => {
    const r = runHook(HOOK, payload("/assign BAD_ROLE"));
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.decision).toBe("block");
    expect(out.reason).toContain("BAD_ROLE");
  });
});

describe("assign-command: valid role renames the session", () => {
  test("an unconfigured role gets a name and no additionalContext", () => {
    const r = runHook(HOOK, payload("/assign gpu"));
    expect(r.code).toBe(0);
    const out = decisionOf(r.stdout);
    expect(out.hookEventName).toBe("UserPromptSubmit");
    expect(out.sessionTitle).toMatch(/^myproj-gpu_[0-9a-hj-km-np-tv-z]{4}$/);
    expect(out.additionalContext).toBeUndefined();
  });

  test("a configured role (obs) gets a name AND additionalContext", () => {
    const r = runHook(HOOK, payload("/assign obs"));
    expect(r.code).toBe(0);
    const out = decisionOf(r.stdout);
    expect(out.sessionTitle).toMatch(/^myproj-obs_[0-9a-hj-km-np-tv-z]{4}$/);
    expect(typeof out.additionalContext).toBe("string");
    expect(out.additionalContext.length).toBeGreaterThan(0);
  });

  test("lowercases the project from cwd's basename", () => {
    const r = runHook(
      HOOK,
      payload("/assign pi", "/home/fuyu/Workspace/DotFiles"),
    );
    const out = decisionOf(r.stdout);
    expect(out.sessionTitle).toMatch(/^dotfiles-pi_/);
  });

  test("snake_cases a hyphenated project (only one hyphen in the final name)", () => {
    const r = runHook(
      HOOK,
      payload("/assign gpu", "/home/fuyu/Workspace/agentic-RnD"),
    );
    const out = decisionOf(r.stdout);
    expect(out.sessionTitle).toMatch(
      /^agentic_rnd-gpu_[0-9a-hj-km-np-tv-z]{4}$/,
    );
  });

  test("extra trailing text after the role is ignored, not an error", () => {
    const r = runHook(HOOK, payload("/assign gpu please hurry"));
    expect(r.code).toBe(0);
    const out = decisionOf(r.stdout);
    expect(out.sessionTitle).toMatch(/^myproj-gpu_/);
  });
});

describe("assign-command: fleet_policy.toml resolution (2026-09-07 migration)", () => {
  // Every existing role above (dtr/pi/obs, and the unconfigured gpu) already exercises the
  // SKILL-SHIPPED FALLBACK: their payload cwd ("/home/fuyu/Workspace/myproj") defines no
  // project-level fleet_policy.toml, so loadFleetPolicy() falls through to
  // agents/skills/commanding-research-fleets/fleet_policy.toml. This block exercises the
  // OTHER branch — a project root that defines its own file — so both paths in the
  // resolution order are actually run, not just asserted about.
  test("a project-root fleet_policy.toml overrides the skill-shipped default", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "assign-cmd-project-"));
    writeFileSync(
      join(projectDir, "fleet_policy.toml"),
      '[dtr]\nprompt = "PROJECT-LOCAL CHARTER"\n',
    );
    const r = runHook(HOOK, payload("/assign dtr", projectDir));
    expect(r.code).toBe(0);
    const out = decisionOf(r.stdout);
    expect(out.additionalContext).toBe("PROJECT-LOCAL CHARTER");
  });

  test("a role absent from the project's own fleet_policy.toml gets no context, even though the skill default configures it", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "assign-cmd-project2-"));
    writeFileSync(
      join(projectDir, "fleet_policy.toml"),
      '[dtr]\nprompt = "PROJECT-LOCAL CHARTER"\n',
    );
    // obs is configured in the skill-shipped default but not in this project's own file —
    // the project file, once present, is the sole source; there is no per-role merge.
    const r = runHook(HOOK, payload("/assign obs", projectDir));
    expect(r.code).toBe(0);
    const out = decisionOf(r.stdout);
    expect(out.additionalContext).toBeUndefined();
  });
});
