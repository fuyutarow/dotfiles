import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../shared/src/zod.ts";
import { listWriteLeases, type LeaseEvidence } from "../src/write-leases.ts";

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
  const result = listWriteLeases({
    stateDir,
    repo: "/repo",
    activeRunIds: new Set(),
    evidence: [
      ...fixture.leases.map((lease): LeaseEvidence => ({
        kind: "admitted",
        lease_version: 1,
        run_id: lease.run_id,
        repo: "/repo",
        cwd: workspaces.get(lease.cwd),
        ticket: { name: lease.ticket, writes: lease.writes },
      })),
      ...fixture.evidence.map((row) =>
        Object.assign({}, row, {
          cwd: row.cwd === undefined ? undefined : workspaces.get(row.cwd),
          repo: "/repo",
        }),
      ),
    ],
    workspaceChanges: () => ({ changed: true }),
  });
  expect(result.ok).toBe(true);
  if (result.ok) {
    const ids = result.value.map((lease) => lease.run_id);
    expect(ids).not.toContain("2026-10-12T04-49-32.322401013Z-3253662-xdhsvc");
    expect(ids).not.toContain("2026-10-12T06-13-45.027821307Z-224778-sv304r");
    expect(ids).not.toContain("2026-10-12T12-42-56.116155232Z-3426560-i372ti");
    expect(ids).toContain("2026-10-12T07-43-02.677339104Z-1153305-qizlig");
  }
});
