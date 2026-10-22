import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../../shared/src/zod.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

const fixture = (): string => {
  const root = mkdtempSync(join(tmpdir(), "agx-ls-selector-"));
  roots.push(root);
  mkdirSync(join(root, "state"));
  const events = [
    {
      kind: "started",
      id: "run-ticket-old",
      at: "2026-10-13T10:00:00Z",
      ticket: "accept-fold",
      writes: [],
      cwd: root,
      workspace: root,
      row: "sol-high",
      dispatcher_session: null,
      vendor_session: null,
      pid: 0,
    },
    {
      kind: "ended",
      id: "run-ticket-old",
      at: "2026-10-13T10:01:00Z",
      exit: 0,
      report_path: null,
      vendor_session: null,
      verify: [],
    },
    {
      kind: "started",
      id: "run-ticket-new",
      at: "2026-10-14T10:00:00Z",
      ticket: "accept-fold",
      continues: "run-ticket-old",
      writes: [],
      cwd: root,
      workspace: root,
      row: "terra-medium",
      dispatcher_session: null,
      vendor_session: null,
      pid: 0,
    },
    {
      kind: "ended",
      id: "run-ticket-new",
      at: "2026-10-14T10:02:00Z",
      exit: 1,
      outcome: "verify-failed",
      report_path: join(root, "state", "runs", "run-ticket-new", "report.json"),
      vendor_session: null,
      verify: [
        {
          cmd: "mise run check",
          exit: 7,
          log_path: join(
            root,
            "state",
            "runs",
            "run-ticket-new",
            "verify-01.log",
          ),
          kind: "failed",
        },
        {
          cmd: "mise run lint",
          exit: 0,
          log_path: join(
            root,
            "state",
            "runs",
            "run-ticket-new",
            "verify-02.log",
          ),
          kind: "passed",
        },
      ],
    },
    {
      kind: "started",
      id: "run-ticket-extra",
      at: "2026-10-14T11:00:00Z",
      ticket: "accept-fold-extra",
      writes: [],
      cwd: root,
      workspace: root,
      row: "luna-high",
      dispatcher_session: null,
      vendor_session: null,
      pid: 0,
    },
    {
      kind: "ended",
      id: "run-ticket-extra",
      at: "2026-10-14T11:01:00Z",
      exit: 0,
      report_path: null,
      vendor_session: null,
      verify: [],
    },
  ];
  writeFileSync(
    join(root, "state", "records.jsonl"),
    `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
  );
  return root;
};

const runLs = (root: string, selector: string) =>
  Bun.spawnSync(
    [
      process.execPath,
      "tools/agx-worker/src/next/cli.ts",
      "ls",
      selector,
      "--json",
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, AGX_STATE_DIR: join(root, "state") },
    },
  );

const runLatest = (root: string, ticket: string, ...flags: string[]) =>
  Bun.spawnSync(
    [
      process.execPath,
      "tools/agx-worker/src/next/cli.ts",
      "ls",
      "--ticket",
      ticket,
      "--latest",
      ...flags,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, AGX_STATE_DIR: join(root, "state") },
    },
  );

test("agx worker ls selects an id prefix and an exact ticket with newest last", () => {
  const root = fixture();
  const prefix = runLs(root, "run-ticket-ol");
  expect(prefix.exitCode).toBe(0);
  const prefixRows = jsonOf(z.array(z.object({ id: z.string() }))).safeParse(
    prefix.stdout.toString(),
  );
  expect(prefixRows.success).toBe(true);
  if (prefixRows.success)
    expect(prefixRows.data.map((run) => run.id)).toEqual(["run-ticket-old"]);

  const ticket = runLs(root, "accept-fold");
  expect(ticket.exitCode).toBe(0);
  const ticketRows = jsonOf(z.array(z.object({ id: z.string() }))).safeParse(
    ticket.stdout.toString(),
  );
  expect(ticketRows.success).toBe(true);
  if (ticketRows.success)
    expect(ticketRows.data.map((run) => run.id)).toEqual([
      "run-ticket-old",
      "run-ticket-new",
    ]);

  const similarTicket = runLs(root, "accept-fold-extra");
  expect(similarTicket.exitCode).toBe(0);
  const similarRows = jsonOf(z.array(z.object({ id: z.string() }))).safeParse(
    similarTicket.stdout.toString(),
  );
  expect(similarRows.success).toBe(true);
  if (similarRows.success)
    expect(similarRows.data.map((run) => run.id)).toEqual(["run-ticket-extra"]);

  const substring = runLs(root, "accept");
  expect(substring.exitCode).toBe(2);
  expect(substring.stderr.toString()).toContain("no run id or exact ticket");
  expect(substring.stderr.toString()).toContain(
    "tkt_accept-fold, tkt_accept-fold-extra",
  );
  expect(substring.stderr.toString().trim().split("\n")).toHaveLength(1);

  const ambiguousPrefix = runLs(root, "run-ticket-");
  expect(ambiguousPrefix.exitCode).toBe(2);
  expect(ambiguousPrefix.stderr.toString()).toContain("run id candidates:");
  expect(ambiguousPrefix.stderr.toString()).toContain("run-ticket-extra");
  expect(ambiguousPrefix.stderr.toString().trim().split("\n")).toHaveLength(1);
}, 60_000);

test("agx worker ls --latest selects a continued run and emits its outcome facts", () => {
  const root = fixture();
  const result = runLatest(root, "accept-fold", "--json");
  expect(result.exitCode).toBe(0);
  const latest = jsonOf(
    z.object({
      id: z.string(),
      state: z.string(),
      outcome: z.string().nullable(),
      verify_exits: z.array(z.number()),
      report_path: z.string().nullable(),
    }),
  ).safeParse(result.stdout.toString());
  expect(latest.success).toBe(true);
  if (latest.success)
    expect(latest.data).toEqual({
      id: "run-ticket-new",
      state: "ended",
      outcome: "verify-failed",
      verify_exits: [7, 0],
      report_path: join(root, "state", "runs", "run-ticket-new", "report.json"),
    });

  const human = runLatest(root, "accept-fold");
  expect(human.exitCode).toBe(0);
  expect(human.stdout.toString()).toContain("run-ticket-new state=ended");
  expect(human.stdout.toString()).toContain("verify_exits=7,0");
  expect(human.stdout.toString()).toContain("report_path=");
});

test("agx worker ls --latest requires an exact ticket and rejects a missing ticket", () => {
  const root = fixture();
  const result = Bun.spawnSync(
    [process.execPath, "tools/agx-worker/src/next/cli.ts", "ls", "--latest"],
    {
      cwd: process.cwd(),
      env: { ...process.env, AGX_STATE_DIR: join(root, "state") },
    },
  );
  expect(result.exitCode).toBe(2);
  expect(result.stderr.toString()).toContain("--latest requires --ticket");
});

const workspaceLs = (root: string, ...flags: string[]) => {
  const { AGX_NEXT_STATE_DIR: _retiredStateDir, ...inheritedEnv } = process.env;
  return Bun.spawnSync(
    [process.execPath, "tools/agx-worker/src/next/cli.ts", "ls", ...flags],
    {
      env: { ...inheritedEnv, AGX_STATE_DIR: join(root, "state") },
      timeout: 15_000,
    },
  );
};

const started = (id: string, workspace: string) => ({
  kind: "started",
  id,
  at: "2026-10-14T12:00:00Z",
  ticket: "live",
  writes: [],
  cwd: workspace,
  workspace,
  row: "fixture",
  dispatcher_session: null,
  vendor_session: null,
  pid: process.pid,
});

test("workspace listing includes ended and live runs, resolves aliases, and preserves JSON rows", async () => {
  const { appendFileSync, symlinkSync } = await import("node:fs");
  const { publishCurrentRuns } = await import("../../src/next/store.ts");
  const { leaseFor } = await import("../../src/next/lease.ts");
  const root = fixture();
  const other = join(root, "other");
  mkdirSync(other);
  const alias = join(root, "alias");
  symlinkSync(root, alias);
  const lease = await leaseFor(process.pid, null);
  appendFileSync(
    join(root, "state", "records.jsonl"),
    [
      { ...started("live-here", root), lease },
      { ...started("live-other", other), lease },
      started("ended-other", other),
      {
        kind: "ended",
        id: "ended-other",
        at: "2026-10-14T12:01:00Z",
        exit: 0,
        report_path: null,
        vendor_session: null,
      },
    ]
      .map((event) => JSON.stringify(event) + "\n")
      .join(""),
  );
  await publishCurrentRuns(join(root, "state"));
  const unfiltered = workspaceLs(root, "--json");
  const schema = jsonOf(z.array(z.record(z.string(), z.unknown())));
  const allResult = schema.safeParse(unfiltered.stdout.toString());
  expect(allResult.success).toBe(true);
  if (!allResult.success) return;
  const all = allResult.data;
  for (const flags of [[], ["--all"]]) {
    const filtered = workspaceLs(
      root,
      "--json",
      "--workspace",
      alias,
      ...flags,
    );
    expect(filtered.exitCode).toBe(0);
    expect(filtered.stderr.toString()).toBe("");
    const rowsResult = schema.safeParse(filtered.stdout.toString());
    expect(rowsResult.success).toBe(true);
    if (!rowsResult.success) return;
    const rows = rowsResult.data;
    expect(rows.map((row) => row.id)).toEqual([
      "run-ticket-old",
      "run-ticket-new",
      "run-ticket-extra",
      "live-here",
    ]);
    // Elapsed time is observation-time data, not a shape change.
    for (const row of rows) {
      const expected = all.find((entry) => entry.id === row.id);
      expect(Object.keys(row).toSorted()).toEqual(
        Object.keys(expected ?? {}).toSorted(),
      );
      expect({ ...row, elapsed_seconds: 0 }).toEqual({
        ...expected,
        elapsed_seconds: 0,
      });
    }
  }
  const running = workspaceLs(root, "--json", "--workspace", root, "--running");
  const runningResult = schema.safeParse(running.stdout.toString());
  expect(runningResult.success).toBe(true);
  if (!runningResult.success) return;
  expect(runningResult.data.map((row) => row.id)).toEqual(["live-here"]);
  const human = workspaceLs(root, "--workspace", root, "--all");
  expect(human.exitCode).toBe(0);
  expect(human.stdout.toString()).toContain("live-here running");
  expect(human.stdout.toString()).not.toContain("other");
  const missing = workspaceLs(
    root,
    "--workspace",
    join(root, "missing"),
    "--json",
  );
  expect(missing.exitCode).toBe(2);
  expect(missing.stdout.toString()).toBe("");
  expect(missing.stderr.toString().trim().split("\n")).toHaveLength(1);
  appendFileSync(
    join(root, "state", "records.jsonl"),
    JSON.stringify({
      ...started("new-after-publication", root),
      lease,
    }) + "\n",
  );
  const stale = workspaceLs(root, "--json", "--workspace", root);
  expect(stale.exitCode).toBe(0);
  expect(stale.stderr.toString()).toContain("scanning records.jsonl");
  const staleResult = schema.safeParse(stale.stdout.toString());
  expect(staleResult.success).toBe(true);
  if (!staleResult.success) return;
  expect(
    staleResult.data.some((row) => row.id === "new-after-publication"),
  ).toBe(true);
});
