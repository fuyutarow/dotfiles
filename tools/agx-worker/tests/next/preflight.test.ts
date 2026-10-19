import { afterEach, expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { prepareTicketRepo } from "../ticket-repo.ts";
import { parseNextTicket } from "../../src/next/ticket.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

test("schema failures include every invalid field and write glob", () => {
  const parsed = parseNextTicket(
    `+++\nschema = 1\noutcome = ""\nwrites = ["/absolute/**", "../escape/**"]\n+++\n`,
    true,
  );
  expect(parsed.success).toBe(false);
  if (parsed.success) return;
  for (const field of [
    "schema",
    "outcome",
    "proposition",
    "writes.0",
    "writes.1",
  ])
    expect(parsed.reasons?.some((reason) => reason.includes(field))).toBe(true);
  expect(parsed.reasons).toHaveLength(5);
});

test("check and run report writes, home, mise, live workspace and premises together without launch artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "agx-preflight-"));
  roots.push(root);
  await prepareTicketRepo(root, ".agents/tickets");
  const state = join(root, "state");
  const bin = join(root, "bin");
  await mkdir(state);
  await mkdir(bin);
  const mise = join(bin, "mise");
  await writeFile(
    mise,
    `#!/usr/bin/env bun\nprocess.stderr.write("mise ERROR untrusted config file: mise.toml\\n"); process.exitCode = 1;\n`,
  );
  await chmod(mise, 0o755);
  const ticket = join(root, "outside.md");
  const original = `+++\nschema = 2\nname = "aggregate"\nwrites = ["/absolute/**", "../escape/**"]\noutcome = "all reasons"\npremises = ["file:missing-one", "file:missing-two"]\n[proposition]\nid = "ALL"\nclaim = "all blockers are visible"\nrefuted_by = "only one blocker"\n+++\n`;
  await writeFile(ticket, original);
  const log = join(state, "records.jsonl");
  const records = `${JSON.stringify({ kind: "started", id: "live-holder", at: "2026-10-19T01:00:00Z", ticket: "prior", writes: [], cwd: root, workspace: root, row: "terra-high", dispatcher_session: null, vendor_session: null, pid: process.pid })}\n`;
  await writeFile(log, records);
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    AGX_NEXT_STATE_DIR: state,
    DISPATCH_ROSTER_PATH: resolve("agents/models/dispatch-roster.toml"),
  };
  for (const command of ["check", "run"]) {
    const child = Bun.spawn(
      [
        process.execPath,
        resolve("tools/agx-worker/src/next/cli.ts"),
        command,
        ticket,
        "--cd",
        root,
      ],
      { env, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 10000 },
    );
    const [exit, out, err] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exit, err).toBe(2);
    expect(out).not.toContain("OK");
    for (const reason of [
      "writes.0",
      "writes.1",
      "declared home",
      "untrusted config",
      "already has running run live-holder",
      "missing-one",
      "missing-two",
    ])
      expect(err).toContain(reason);
    const failures = err
      .trim()
      .split("\n")
      .filter((line) => line.startsWith("agx:"));
    expect(failures.length).toBeGreaterThanOrEqual(7);
    expect(failures.every((line) => line.includes("repair:"))).toBe(true);
    expect(await readFile(log, "utf8")).toBe(records);
    expect(await readFile(ticket, "utf8")).toBe(original);
    expect(await readdir(state)).not.toContain("runs");
  }
}, 30000);
