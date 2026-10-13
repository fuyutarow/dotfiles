import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../shared/src/zod.ts";
import { appendLifecycle } from "../src/lifecycle-log.ts";
import { listWriteLeases } from "../src/write-leases.ts";

const parsedFixture = jsonOf(
  z.object({
    leases: z.array(
      z.object({
        run_id: z.string(),
        cwd: z.string(),
        ticket: z.string(),
        writes: z.array(z.string()),
      }),
    ),
    evidence: z.array(
      z.looseObject({
        kind: z.string(),
        run_id: z.string(),
        cwd: z.string().optional(),
        ticket: z
          .object({ name: z.string().optional(), writes: z.array(z.string()) })
          .optional(),
        accept: z.boolean().optional(),
      }),
    ),
  }),
).safeParse(
  readFileSync(
    join(import.meta.dir, "fixtures/lease-ghosts-20261013.json"),
    "utf8",
  ),
);

const fixture = parsedFixture.success
  ? parsedFixture.data
  : { leases: [], evidence: [] };
const scratch = mkdtempSync(join(tmpdir(), "agx-lease-fold-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

test("2026-10-12/13 ghosts: judgment folds over exact ticket/workspace lineage", () => {
  expect(parsedFixture.success).toBe(true);
  const stateDir = scratch;
  const workspaces = new Map<string, string>();
  for (const lease of fixture.leases) {
    if (!workspaces.has(lease.cwd)) {
      const path = join(stateDir, `workspace-${workspaces.size}`);
      mkdirSync(path);
      mkdirSync(join(path, ".jj"));
      workspaces.set(lease.cwd, path);
    }
  }
  for (const lease of fixture.leases) {
    const cwd = workspaces.get(lease.cwd);
    if (cwd === undefined) continue;
    const admitted = appendLifecycle(stateDir, {
      type: "admitted",
      run_id: lease.run_id,
      repo: "/repo",
      workspace: cwd,
      ticket: lease.ticket,
      writes: lease.writes,
      resource: null,
      session_id: "fixture",
      record: {
        kind: "admitted",
        run_id: lease.run_id,
        repo: "/repo",
        cwd,
        ticket: { name: lease.ticket, writes: lease.writes },
        dispatcher_session: "fixture",
        started_at: "2026-10-13T00:00:00Z",
        tracked_paths: ["tools/agx/src/agx.ts", "crates/lib.rs"],
      },
      at: "2026-10-13T00:00:00Z",
    });
    expect(admitted.ok).toBe(true);
  }
  for (const row of fixture.evidence) {
    const cwd = row.cwd === undefined ? undefined : workspaces.get(row.cwd);
    if (row.kind === "acceptance") {
      const judged = appendLifecycle(stateDir, {
        type: "judged",
        run_id: row.run_id,
        decision: row.accept === true ? "accept" : "reject",
        record: { kind: "acceptance", run_id: row.run_id, accept: row.accept },
      });
      expect(judged.ok).toBe(true);
    } else if (row.kind === "run") {
      const terminal = appendLifecycle(stateDir, {
        type: "terminal",
        run_id: row.run_id,
        outcome: "done",
        ...(cwd === undefined ? {} : { workspace: cwd }),
        record: { kind: "run", run_id: row.run_id, cwd },
      });
      expect(terminal.ok).toBe(true);
    }
  }
  const result = listWriteLeases({
    stateDir,
    repo: "/repo",
  });
  expect(result.ok).toBe(true);
  if (result.ok) {
    const ids = result.value.map((lease) => lease.run_id);
    expect(ids).not.toContain("2026-10-12T04-49-32.322401013Z-3253662-xdhsvc");
    expect(ids).not.toContain("2026-10-12T06-13-45.027821307Z-224778-sv304r");
    expect(ids).not.toContain("2026-10-12T12-42-56.116155232Z-3426560-i372ti");
    expect(ids).not.toContain("2026-10-12T07-43-02.677339104Z-1153305-qizlig");
  }
});
