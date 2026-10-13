import { afterAll, expect, test } from "bun:test";
import { readFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../shared/src/zod.ts";
import { appendLifecycle } from "../src/lifecycle-log.ts";
import { listWriteLeases } from "../src/write-leases.ts";
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
test("lifecycle admissions and judgments release historical lineages; run history alone creates no lease", () => {
  expect(fixture.success).toBe(true);
  const rows = fixture.success ? fixture.data : [];
  const paths = new Map<string, string>();
  for (const row of rows) {
    if (row.cwd === undefined || paths.has(row.cwd)) continue;
    const cwd = join(scratch, `workspace-${paths.size}`);
    mkdirSync(join(cwd, ".jj"), { recursive: true });
    paths.set(row.cwd, cwd);
  }
  const runRows = rows.filter((row) => row.kind === "run");
  expect(runRows.filter((row) => row.ticket?.name === "agxsplit")).toHaveLength(
    5,
  );
  for (const row of runRows) {
    const cwd = row.cwd === undefined ? undefined : paths.get(row.cwd);
    if (cwd === undefined || row.ticket?.name === undefined) continue;
    const writes = row.ticket.writes ?? [];
    const record = {
      ...row,
      repo: "/repo",
      cwd,
    };
    expect(
      appendLifecycle(scratch, {
        type: "admitted",
        run_id: row.run_id,
        repo: "/repo",
        workspace: cwd,
        ticket: row.ticket.name,
        writes,
        resource: null,
        predecessor: row.resumed_from,
        record,
      }).ok,
    ).toBe(true);
    expect(
      appendLifecycle(scratch, {
        type: "terminal",
        run_id: row.run_id,
        outcome: "done",
        workspace: cwd,
        record,
      }).ok,
    ).toBe(true);
  }
  for (const row of rows.filter(
    (item) => item.kind === "acceptance" || item.kind === "landed",
  ))
    expect(
      appendLifecycle(scratch, {
        type: "judged",
        run_id: row.run_id,
        decision:
          row.kind === "landed" || row.accept === true ? "accept" : "reject",
        record: row,
      }).ok,
    ).toBe(true);
  expect(listWriteLeases({ stateDir: scratch, repo: "/repo" })).toEqual({
    ok: true,
    value: [],
  });

  const historyOnly = join(scratch, "history-only");
  mkdirSync(historyOnly);
  expect(listWriteLeases({ stateDir: historyOnly, repo: "/repo" })).toEqual({
    ok: true,
    value: [],
  });
});
