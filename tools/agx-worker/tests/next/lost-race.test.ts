import { jsonOf } from "../../../shared/src/zod.ts";
import { DoctorRecord } from "../../../shared/src/doctor-record.ts";
import { afterEach, expect, test } from "bun:test";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { leaseFor } from "../../src/next/lease.ts";
import {
  append,
  flushRunPublications,
  events,
  foldedRuns,
  fullFoldedRuns,
} from "../../src/next/store.ts";

const previousState = process.env.AGX_STATE_DIR;
const previousPath = process.env.PATH;
const roots: string[] = [];
afterEach(async () => {
  await flushRunPublications();
  if (previousState === undefined) delete process.env.AGX_STATE_DIR;
  else process.env.AGX_STATE_DIR = previousState;
  if (previousPath === undefined) delete process.env.PATH;
  else process.env.PATH = previousPath;
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "agx-lost-race-"));
  roots.push(root);
  process.env.AGX_STATE_DIR = root;
  await Bun.write(
    join(root, "records.jsonl"),
    Bun.file(join(import.meta.dir, "fixtures/lost-race-records.jsonl")),
  );
  return root;
}

test("the five observed started/ended sequences preserve outcome and verification", async () => {
  await fixture();
  const rows = await fullFoldedRuns();
  expect(rows).toHaveLength(5);
  for (const row of rows) {
    expect(row.state).toBe("ended");
    expect(row.exit).toBe(0);
    expect(row.outcome === "ok" || row.outcome === "no-change").toBe(true);
    expect(row.verify.length).toBeGreaterThan(0);
    expect(row.evidence).toBeUndefined();
  }
  expect(await foldedRuns()).toEqual(rows);
});

for (const fold of [fullFoldedRuns, foldedRuns]) {
  test(`${fold.name} rereads an ended record appended during owner-loss observation`, async () => {
    const root = await fixture();
    const sequence = events();
    const start = sequence.find((event) => event.kind === "started");
    const end = sequence.find(
      (event) => event.kind === "ended" && event.id === start?.id,
    );
    expect(start).toBeDefined();
    expect(end).toBeDefined();
    if (start === undefined || end === undefined) return;
    const gate = join(root, "finish-owner");
    const gone = join(root, "owner-gone");
    const owner = Bun.spawn(
      [
        process.execPath,
        "-e",
        `import { appendFile } from "node:fs/promises"; while (!(await Bun.file(${JSON.stringify(gate)}).exists())) await Bun.sleep(5); await appendFile(${JSON.stringify(join(root, "records.jsonl"))}, ${JSON.stringify(`${JSON.stringify(end)}\n`)});`,
      ],
      { stdout: "ignore", stderr: "pipe", timeout: 4000 },
    );
    const finished = owner.exited.then(() => Bun.write(gone, "gone"));
    const target = {
      ...start,
      pid: owner.pid,
      lease: await leaseFor(owner.pid, null),
    };
    await Bun.write(
      join(root, "records.jsonl"),
      `${JSON.stringify({ ...start, id: "earlier-dead-run" })}\n${JSON.stringify(target)}\n`,
    );
    // An earlier dead run's unit query holds the reader after replay. The
    // actual owner appends ended and exits before this query lets replay proceed.
    const binary = join(root, "systemctl");
    await Bun.write(
      binary,
      `#!${process.execPath}\nawait Bun.write(${JSON.stringify(gate)}, "finish");\nwhile (!(await Bun.file(${JSON.stringify(gone)}).exists())) await Bun.sleep(5);\nprocess.stdout.write("success\\n");\n`,
    );
    await chmod(binary, 0o755);
    process.env.PATH = `${root}:${previousPath ?? ""}`;
    const rows = await fold();
    await finished;
    expect(owner.exitCode).toBe(0);
    expect(rows.find((row) => row.id === start.id)).toMatchObject({
      state: "ended",
      exit: 0,
      outcome: "ok",
      verify: end.kind === "ended" ? end.verify : [],
    });
    expect(rows.find((row) => row.id === start.id)?.evidence).toBeUndefined();
  });
}

test("a later ended record replaces derived loss in a warm fold", async () => {
  const root = await fixture();
  const sequence = events();
  const start = sequence.find((event) => event.kind === "started");
  const end = sequence.find(
    (event) => event.kind === "ended" && event.id === start?.id,
  );
  if (start === undefined || end === undefined) return;
  await Bun.write(
    join(root, "records.jsonl"),
    `${JSON.stringify({ ...start, lease: { pid: 2147483647, start: null, unit: null } })}\n`,
  );
  expect((await foldedRuns())[0]?.outcome).toBe("lost");
  append(end);
  expect((await foldedRuns())[0]).toMatchObject({
    state: "ended",
    outcome: "ok",
    exit: 0,
  });
});

test("doctor distinguishes observed completions, missing returns, legacy history and owner loss", async () => {
  const root = await fixture();
  const start = events().find((event) => event.kind === "started");
  if (start?.kind !== "started") return;
  append({
    ...start,
    id: "killed",
    lease: { pid: 2147483647, start: null, unit: null },
  });
  append({
    ...start,
    id: "legacy",
    lease: undefined,
    legacy_key: "run:fixture",
  });
  append({
    kind: "ended",
    id: "legacy",
    at: "2026-10-16T00:00:00Z",
    exit: 0,
    report_path: null,
    vendor_session: null,
    verify: [],
    legacy_key: "run-ended:fixture",
  });
  const child = Bun.spawn(
    [process.execPath, "tools/agx-worker/src/next/cli.ts", "doctor"],
    {
      env: { ...process.env, AGX_STATE_DIR: root },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const output = await new Response(child.stdout).text();
  expect(await child.exited).toBe(1);
  const findings = output
    .trim()
    .split("\n")
    .flatMap((line) => {
      const parsed = jsonOf(DoctorRecord).safeParse(line);
      expect(parsed.success).toBe(true);
      return parsed.success ? [parsed.data] : [];
    });
  expect(findings.filter((row) => row.finding === "lost")).toEqual([]);
  expect(findings.filter((row) => row.finding === "missing-return")).toEqual(
    [],
  );
  expect(findings.filter((row) => row.finding === "unjudged")).toHaveLength(1);
  expect(
    findings.filter(
      (row) =>
        row.object.split("/").at(-1) !== "killed" &&
        row.object.split("/").at(-1) !== "a7473fdd-ae5e-4dc2-be2f-3c63aa50dcbd",
    ),
  ).toEqual([]);
  expect(
    findings.find((row) => row.object.split("/").at(-1) === "legacy"),
  ).toBeUndefined();
  expect(
    findings.find((row) => row.object.split("/").at(-1) === "killed")?.finding,
  ).toBe("orphaned");
  const endings = events(root).filter(
    (event) => event.kind === "ended" && event.id === "killed",
  );
  expect(endings).toHaveLength(1);
  expect(endings[0]).toMatchObject({
    outcome: "lost",
    evidence: { reason: "owner-gone" },
  });
  const ended = (await foldedRuns()).find((run) => run.id === "killed");
  expect(ended?.ended_at).toBe(endings[0]?.at);
});
