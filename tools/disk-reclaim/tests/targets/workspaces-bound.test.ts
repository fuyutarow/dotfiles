import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempRoot } from "../fixtures/temp.ts";
import { World } from "../jj/fixture.ts";
import { scanWorkspace } from "../../src/jj/scan.ts";
import { treeBytes } from "../../src/targets/tree.ts";
import {
  createWorkspacesTarget,
  WORKSPACES_WORKSPACE_BUDGET_MS,
} from "../../src/targets/workspaces.ts";

const dirs: string[] = [];
const worlds: World[] = [];
const scratch = (): string => {
  const dir = tempRoot("reclaim-bound-");
  dirs.push(dir);
  return dir;
};
const world = (): World => {
  const w = new World();
  worlds.push(w);
  return w;
};
afterAll(() => {
  for (const w of worlds.splice(0)) w.dispose();
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe("workspaces plan time bounds", () => {
  test("the declared workspace bound is the one the target uses by default", () => {
    expect(WORKSPACES_WORKSPACE_BUDGET_MS).toBe(60_000);
  });

  test("a scan past its deadline is bounded, never a complete verdict", async () => {
    const dir = scratch();
    mkdirSync(join(dir, "a"));
    writeFileSync(join(dir, "a", "tracked"), "x");
    writeFileSync(join(dir, "stray"), "y");
    const bounded = await scanWorkspace(
      dir,
      ["a/tracked"],
      [],
      null,
      performance.now() - 1,
    );
    expect(bounded.bounded).toBe(true);
    expect(bounded.foreign).toEqual([]);
    const complete = await scanWorkspace(dir, ["a/tracked"], [], null);
    expect(complete.bounded).toBeUndefined();
    expect(complete.foreign).toEqual(["stray"]);
  });

  test("a tree walk past its deadline never starts and resolves truncated", async () => {
    const dir = scratch();
    writeFileSync(join(dir, "file"), "x".repeat(4096));
    let truncated = false;
    const bytes = await treeBytes(dir, undefined, undefined, {
      deadline: performance.now() - 1,
      onTruncated: () => {
        truncated = true;
      },
    });
    expect(truncated).toBe(true);
    expect(bytes).toBe(0);
    expect(await treeBytes(dir)).toBeGreaterThan(0);
  });

  test("an exhausted workspace bound names the bound on the row", async () => {
    const w = world();
    const ws = w.add("bounded-row");
    const reports: string[] = [];
    const rows = await createWorkspacesTarget({
      budget: { workspaceMs: 0 },
    }).plan({
      ...w.context("plan"),
      reportPlanError: (message, partial) => {
        reports.push(`${partial === true}:${message}`);
      },
    });
    const row = rows.find((c) => c.path === ws);
    expect(row).toBeDefined();
    expect(row?.verdict).toBe("ASK");
    expect(row?.reason).toContain("0 ms workspace bound");
    expect(row?.bytes_kind).toBe("estimate");
    expect(
      reports.some((r) => r.startsWith("true:") && r.includes("incomplete")),
    ).toBe(true);
  });

  test("an exhausted plan bound reports the plan incomplete instead of a complete plan", async () => {
    const w = world();
    w.add("bounded-plan");
    const reports: string[] = [];
    const rows = await createWorkspacesTarget({
      budget: { planMs: 0 },
    }).plan({
      ...w.context("plan"),
      reportPlanError: (message, partial) => {
        reports.push(`${partial === true}:${message}`);
      },
    });
    expect(rows).toEqual([]);
    expect(
      reports.some((r) => r.startsWith("true:") && r.includes("incomplete")),
    ).toBe(true);
  });
});
