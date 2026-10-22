import { prepareTicketRepo } from "../ticket-repo.ts";
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../../shared/src/zod.ts";
import { changedFiles, workspaceSnapshot } from "../../src/next/outcome.ts";

const roots: string[] = [];
const servers: ReturnType<typeof Bun.serve>[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop(true);
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const scratch = () => {
  const root = mkdtempSync(join(tmpdir(), "agx-derived-outcomes-"));
  roots.push(root);
  return root;
};

test("ended fixtures retain measured outcomes while routing omits ungraded raw history", async () => {
  const root = scratch();
  await prepareTicketRepo(root);
  const state = join(root, "state");
  const Request = z.looseObject({
    state: z.looseObject({}),
    questions: z.object({
      worker: z.looseObject({ criteria: z.record(z.string(), z.string()) }),
    }),
  });
  let captured: z.output<typeof Request> | undefined;
  const server = Bun.serve({
    port: 0,
    fetch: async (request) => {
      const parsed = jsonOf(Request).safeParse(await request.text());
      if (parsed.success) captured = parsed.data;
      return Response.json({ answers: { worker: { choice: "luna-high" } } });
    },
  });
  servers.push(server);
  const cases: [string, string][] = [
    ["no-change", "no-change"],
    ["verify-failed", "verify-failed"],
    ["timeout", "timeout"],
    ["string-wrapped", "malformed"],
    ["ok", "ok"],
    ["malformed", "malformed"],
    ["refused", "refused"],
    ["structured", "ok"],
    ["last-message", "ok"],
    ["string-report", "malformed"],
    ["trailing-text", "ok"],
  ];
  const expected: string[] = [];
  const env = {
    ...process.env,
    AGX_STATE_DIR: state,
    AGX_TMP_ROOT: join(root, "agx-tmp"),
    JEV_URL: `http://127.0.0.1:${server.port}/choice`,
    AGX_WORKER_BIN: join(import.meta.dir, "fixtures/outcome-worker.ts"),
    TYPESAFE_API_KEY: "test-key",
    DISPATCH_ROSTER_PATH: join(
      process.cwd(),
      "agents/models/dispatch-roster.toml",
    ),
  };
  for (const [mode, outcome] of cases) {
    const ticket = join(root, `${mode}.md`);
    writeFileSync(
      ticket,
      `+++\nschema = 2\nname = "${mode}"\nwrites = ["work.txt"]\noutcome = "fixture"\nverify = ["${mode === "verify-failed" ? "false" : "true"}"]\n[proposition]\nid = "OUTCOME"\nclaim = "derived outcomes"\nrefuted_by = "incorrect classification"\n+++\nFixture.\n`,
    );
    const child = Bun.spawn(
      [
        process.execPath,
        "tools/agx-worker/src/next/cli.ts",
        "run",
        ticket,
        "--cd",
        root,
      ],
      {
        env: { ...env, AGX_OUTCOME_FIXTURE: mode },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [stdout, stderr, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exit, stderr).toBe(0);
    const receipt = jsonOf(z.looseObject({ outcome: z.string() })).safeParse(
      stdout,
    );
    expect(receipt.success).toBe(true);
    if (receipt.success) expect(receipt.data.outcome).toBe(outcome);
    if (mode === "trailing-text")
      expect(stderr).toContain(
        "WARN trailing text after report JSON: extra text",
      );
    expect(captured?.state.history).toBeUndefined();
    expect(captured?.questions.worker.criteria["luna-high"]).toContain(
      "graded here 0/0/0",
    );
    expected.push(outcome);
  }
  const listed = Bun.spawnSync(
    [process.execPath, "tools/agx-worker/src/next/cli.ts", "ls", "--json"],
    { env },
  );
  expect(listed.exitCode).toBe(0);
  const rows = jsonOf(
    z.array(z.looseObject({ outcome: z.string(), changed_files: z.number() })),
  ).safeParse(listed.stdout.toString());
  expect(rows.success).toBe(true);
  if (rows.success) {
    expect(rows.data.map((row) => row.outcome)).toEqual(expected);
    expect(rows.data.map((row) => row.changed_files)).toEqual([
      0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    ]);
  }
  const events = readFileSync(join(state, "records.jsonl"), "utf8")
    .trim()
    .split("\n");
  const ended = events.flatMap((line) => {
    const parsed = jsonOf(
      z.looseObject({ kind: z.literal("ended"), outcome: z.string() }),
    ).safeParse(line);
    return parsed.success ? [parsed.data.outcome] : [];
  });
  expect(ended).toEqual(expected);
}, 60_000);

test("workspace evidence detects added, deleted and edited files without counting preexisting dirt", () => {
  const root = scratch();
  writeFileSync(join(root, "dirty.txt"), "preexisting dirt");
  writeFileSync(join(root, "delete.txt"), "remove me");
  const before = workspaceSnapshot(root, ["*.txt"]);
  writeFileSync(join(root, "dirty.txt"), "edited dirt");
  writeFileSync(join(root, "added.txt"), "new");
  rmSync(join(root, "delete.txt"));
  const after = workspaceSnapshot(root, ["*.txt"]);
  expect(before.isOk() && after.isOk()).toBe(true);
  if (before.isOk() && after.isOk()) {
    expect(changedFiles(before.value, before.value)).toBe(0);
    expect(changedFiles(before.value, after.value)).toBe(3);
  }
});
