import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { createSparseWorkspace } from "../src/prepare-workspace.ts";
import { planWorkspace } from "../src/workspaces.ts";
import {
  workspaceCommand,
  workspacePolicy,
  isHeavyWorkspacePath,
  sparseWorkspaceBytes,
} from "../../shared/src/workspace-policy.ts";
import { fullCheckoutReason } from "../../../agents/hooks/enforce-storage-headroom.ts";
import { attempt } from "../../shared/src/attempt.ts";

async function fixture(run: (root: string) => Promise<void>) {
  const parent = await mkdtemp(join(tmpdir(), "agx-sparse-"));
  const root = join(parent, "firedancer");
  await mkdir(root);
  const result = await attempt(async () => {
    await workspaceCommand(["jj", "git", "init", "--colocate"], root);
    await Bun.write(join(root, "README.md"), "small\n");
    await mkdir(join(root, "research_record"));
    await Bun.write(
      join(root, "research_record", "blob"),
      Buffer.alloc(1024 * 1024, 1),
    );
    await run(root);
  });
  await rm(parent, { recursive: true, force: true });
  expect(result.ok, result.ok ? undefined : String(result.error)).toBe(true);
}

test("declared heavy directory is never checked out, no undeclared setup, repo prefix and size receipt", async () => {
  await fixture(async (root) => {
    await Bun.write(
      join(root, ".agx.toml"),
      'workspace_exclude = ["research_record"]\n',
    );
    await workspaceCommand(["jj", "commit", "-m", "fixture"], root);
    const plan = await planWorkspace(root, "sparse");
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.name).toBe("firedancer-arm-sparse");
    expect(basename(plan.path)).toBe(plan.name);
    const automatic = await planWorkspace(
      root,
      undefined,
      "2026-10-11T01:02:03Z",
    );
    expect(automatic.ok).toBe(true);
    if (automatic.ok)
      expect(automatic.name).toMatch(/^firedancer-arm-agx-20261011010203-/u);
    const calls: string[][] = [];
    const created = await createSparseWorkspace(
      root,
      plan.name,
      plan.path,
      async (args, cwd) => {
        calls.push(args);
        return workspaceCommand(args, cwd);
      },
    );
    expect(created.ok, created.ok ? undefined : String(created.error)).toBe(
      true,
    );
    if (!created.ok) return;
    const receipt = created.value;
    expect(calls.some((args) => args[0] === "bun" || args[0] === "mise")).toBe(
      false,
    );
    expect(calls[0]).toContain("--sparse-patterns");
    expect(calls[0]).toContain("empty");
    expect(receipt.excluded).toEqual(["research_record"]);
    expect(receipt.sparse_set).toEqual([".agx.toml", "README.md"]);
    expect(receipt.measured[0]?.bytes).toBeGreaterThanOrEqual(1024 * 1024);
    expect(receipt.checkout_bytes).toBeLessThan(1024 * 1024);
    expect(
      await Bun.file(join(plan.path, "research_record", "blob")).exists(),
    ).toBe(false);
    expect(await Bun.file(join(plan.path, "README.md")).text()).toBe("small\n");
    expect(
      await workspaceCommand(["jj", "sparse", "list"], plan.path),
    ).not.toEqual({ ok: true, value: ".\n" });
    expect(
      await fullCheckoutReason("jj workspace add another", root, 500),
    ).toContain("research_record");
    const denied = await fullCheckoutReason(
      "jj workspace add --sparse-patterns empty another",
      root,
      500,
    );
    expect(denied).toBeNull();
  });
});

test("sparse workspace size subtracts measured excluded directories", async () => {
  await fixture(async (root) => {
    await Bun.write(
      join(root, ".agx.toml"),
      'workspace_exclude = ["research_record"]\n',
    );
    await workspaceCommand(["jj", "commit", "-m", "fixture"], root);
    const policy = await workspacePolicy(root, 500);
    expect(policy.ok).toBe(true);
    if (!policy.ok) return;
    const bytes = await sparseWorkspaceBytes(root, policy.value);
    expect(bytes.ok).toBe(true);
    if (bytes.ok) expect(bytes.value).toBeLessThan(1024 * 1024);
  });
});

test("the shared size predicate uses a strict decimal MB bound", () => {
  expect(isHeavyWorkspacePath(500_000_000, 500)).toBe(false);
  expect(isHeavyWorkspacePath(500_000_001, 500)).toBe(true);
});

test("an absent directory requires an explicit declaration instead of a guessed exclusion", async () => {
  await fixture(async (root) => {
    await workspaceCommand(["jj", "commit", "-m", "sparse source"], root);
    await workspaceCommand(
      ["jj", "sparse", "set", "--clear", "--add", "README.md"],
      root,
    );
    const unknown = await workspacePolicy(root, 500);
    expect(unknown.ok).toBe(false);
    await Bun.write(
      join(root, ".agx.toml"),
      'workspace_exclude = ["research_record"]\n',
    );
    const declared = await workspacePolicy(root, 500);
    expect(declared.ok).toBe(true);
    if (declared.ok)
      expect(declared.value.excluded).toEqual(["research_record"]);
  });
});

test("fallback excludes measured top-level directories over the bound", async () => {
  await fixture(async (root) => {
    await workspaceCommand(["jj", "commit", "-m", "fixture"], root);
    const result = await workspacePolicy(root, 0.5);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const policy = result.value;
    expect(policy.source).toBe("measured");
    expect(policy.excluded).toEqual(["research_record"]);
    expect(policy.sparse_set).toEqual(["README.md"]);
    expect(policy.measured[0]?.bytes).toBeGreaterThan(500_000);
    const bytes = await sparseWorkspaceBytes(root, policy);
    expect(bytes.ok).toBe(true);
    if (bytes.ok) expect(bytes.value).toBeLessThan(500_000);
  });
});

test("sparse size retains measured directories below the exclusion bound", async () => {
  await fixture(async (root) => {
    await workspaceCommand(["jj", "commit", "-m", "fixture"], root);
    const policy = await workspacePolicy(root, 2);
    expect(policy.ok).toBe(true);
    if (!policy.ok) return;
    expect(policy.value.excluded).toEqual([]);
    const bytes = await sparseWorkspaceBytes(root, policy.value);
    expect(bytes.ok).toBe(true);
    if (bytes.ok) expect(bytes.value).toBeGreaterThanOrEqual(1024 * 1024);
  });
});

test("invalid declaration fails before creating a workspace", async () => {
  await fixture(async (root) => {
    await Bun.write(
      join(root, ".agx.toml"),
      'workspace_exclude = ["../outside"]\n',
    );
    const result = await createSparseWorkspace(
      root,
      "bad",
      join(root, "..", "bad"),
    );
    expect(result.ok).toBe(false);
  });
});

test("same-second automatic plans differ and an atomic claim admits one creator", async () => {
  await fixture(async (root) => {
    await Bun.write(
      join(root, ".agx.toml"),
      'workspace_exclude = ["research_record"]',
    );
    const [a, b] = await Promise.all([
      planWorkspace(root, undefined, "2026-10-11T01:02:03Z"),
      planWorkspace(root, undefined, "2026-10-11T01:02:03Z"),
    ]);
    expect(a.ok && b.ok && a.path !== b.path).toBe(true);
    const path = join(root, "..", "claimed");
    let adds = 0;
    const command = async (args: string[]) => {
      if (args.includes("add")) {
        adds++;
        await Bun.sleep(100);
      }
      return { ok: false as const, error: "fixture declined creation" };
    };
    const results = await Promise.all([
      createSparseWorkspace(root, "claimed", path, command),
      createSparseWorkspace(root, "claimed", path, command),
    ]);
    expect(adds).toBe(1);
    expect(results.every((result) => !result.ok)).toBe(true);
    expect(
      results.some(
        (result) =>
          !result.ok && String(result.error).includes("already claimed"),
      ),
    ).toBe(true);
  });
});

test("setup follows only the repo declarations", async () => {
  await fixture(async (root) => {
    await Bun.write(join(root, "mise.toml"), "[tools]\n");
    await Bun.write(join(root, "bun.lock"), "fixture lock\n");
    await workspaceCommand(["jj", "commit", "-m", "setup fixture"], root);
    const calls: string[][] = [];
    const made = await createSparseWorkspace(
      root,
      "setup",
      join(root, "..", "setup"),
      async (args, cwd) => {
        calls.push(args);
        return args[0] === "jj"
          ? workspaceCommand(args, cwd)
          : { ok: true, value: "" };
      },
    );
    expect(made.ok).toBe(true);
    expect(calls.filter((args) => args[0] !== "jj")).toEqual([
      ["mise", "trust"],
      ["bun", "install", "--frozen-lockfile"],
    ]);
  });
});
