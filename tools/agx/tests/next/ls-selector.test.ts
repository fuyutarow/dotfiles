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
      report_path: null,
      vendor_session: null,
      verify: [],
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
    [process.execPath, "tools/agx/src/next/cli.ts", "ls", selector, "--json"],
    {
      cwd: process.cwd(),
      env: { ...process.env, AGX_NEXT_STATE_DIR: join(root, "state") },
    },
  );

test("agx ls selects an id prefix and an exact ticket with newest last", () => {
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
    "accept-fold, accept-fold-extra",
  );
  expect(substring.stderr.toString().trim().split("\n")).toHaveLength(1);

  const ambiguousPrefix = runLs(root, "run-ticket-");
  expect(ambiguousPrefix.exitCode).toBe(2);
  expect(ambiguousPrefix.stderr.toString()).toContain("run id candidates:");
  expect(ambiguousPrefix.stderr.toString()).toContain("run-ticket-extra");
  expect(ambiguousPrefix.stderr.toString().trim().split("\n")).toHaveLength(1);
});
