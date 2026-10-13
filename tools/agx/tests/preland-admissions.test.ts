import { afterAll, expect, test } from "bun:test";
import { readFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../shared/src/zod.ts";
import { listWriteLeases, type LeaseEvidence } from "../src/write-leases.ts";
const fixture = jsonOf(
  z.array(
    z.object({
      kind: z.string(),
      run_id: z.string(),
      cwd: z.string().optional(),
      ticket: z
        .object({
          name: z.string().optional(),
          writes: z.array(z.string()).optional(),
        })
        .optional(),
      accept: z.boolean().optional(),
      resumed_from: z.string().optional(),
    }),
  ),
).safeParse(
  readFileSync(
    join(import.meta.dir, "fixtures/preland-lineages-20261013.json"),
    "utf8",
  ),
);
const scratch = mkdtempSync(join(tmpdir(), "agx-preland-admissions-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});
test("five agxsplit runs and other landed live shapes release after actual judgments, with synthetic lease-aware admissions", () => {
  expect(fixture.success).toBe(true);
  const rows = fixture.success ? fixture.data : [];
  const paths = new Map<string, string>();
  for (const row of rows) {
    if (row.cwd === undefined || paths.has(row.cwd)) continue;
    const cwd = join(scratch, `workspace-${paths.size}`);
    mkdirSync(join(cwd, ".jj"), { recursive: true });
    paths.set(row.cwd, cwd);
  }
  const evidence: LeaseEvidence[] = rows.map((row) =>
    Object.assign({}, row, {
      repo: "/repo",
      cwd: row.cwd === undefined ? undefined : paths.get(row.cwd),
    }),
  );
  const admissions = evidence
    .filter((row) => row.kind === "run")
    .map((row): LeaseEvidence => Object.assign({}, row, { kind: "admitted" }));
  expect(
    admissions.filter((row) => row.ticket?.name === "agxsplit"),
  ).toHaveLength(5);
  expect(
    evidence.filter((row) => row.kind === "acceptance").length,
  ).toBeGreaterThan(0);
  expect(
    listWriteLeases({
      stateDir: scratch,
      repo: "/repo",
      evidence: [...admissions, ...evidence],
      activeRunIds: new Set(),
      unitAlive: () => false,
      workspaceChanges: () => ({ changed: true }),
    }),
  ).toEqual({ ok: true, value: [] });
  expect(
    listWriteLeases({
      stateDir: scratch,
      repo: "/repo",
      evidence,
      activeRunIds: new Set(),
      workspaceChanges: () => ({ changed: true }),
    }),
  ).toEqual({ ok: true, value: [] });
});
