import { prepareTicketRepo } from "../ticket-repo.ts";
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../../shared/src/zod.ts";
import { createTempTracker } from "../temp.ts";

const tempDirs = createTempTracker();
afterAll(tempDirs.assertRemoved);
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

const ticketText = (prose: string): string =>
  `+++\nschema = 2\nname = "pin"\nwrites = []\noutcome = "continue pinned"\nverify = []\n[proposition]\nid = "PIN"\nclaim = "continue pins the row"\nrefuted_by = "continue routes"\n+++\n${prose}\n`;

// Seeds one ended run per prior row; the Jev endpoint is a closed port, so a continue that
// routed would fall back to the roster default (luna-high) instead of the pinned row.
const fixture = async (ticketName = "pin") => {
  const root = tempDirs.register(
    mkdtempSync(join(tmpdir(), `agx-test-${process.pid}-continue-`)),
  );
  roots.push(root);
  await prepareTicketRepo(root);
  const state = join(root, "state");
  mkdirSync(state, { recursive: true });
  const seed = (id: string, row: string, session: string | null) => [
    {
      kind: "started",
      id,
      at: "2026-10-14T01:00:00.000Z",
      ticket: ticketName,
      writes: [],
      cwd: root,
      workspace: root,
      row,
      dispatcher_session: null,
      vendor_session: null,
      pid: 0,
    },
    {
      kind: "ended",
      id,
      at: "2026-10-14T01:10:00.000Z",
      exit: 0,
      report_path: null,
      vendor_session: session,
      verify: [],
    },
  ];
  const records = [
    ...seed("codex-run", "terra-high", "codex-thread-1"),
    ...seed("claude-run", "sonnet-high", "claude-session-1"),
    ...seed("bare-run", "terra-high", null),
    ...seed("ghost-run", "no-such-row", "ghost-session"),
  ];
  writeFileSync(
    join(state, "records.jsonl"),
    `${records.map((event) => JSON.stringify(event)).join("\n")}\n`,
  );
  const worker = join(root, "fake-worker.ts");
  writeFileSync(
    worker,
    `const i = process.argv.indexOf("--resume");\nprocess.stdout.write(JSON.stringify({ exit: 0, report: { summary: "ok", changes: [], checks: [], for_coordinator: [], open: [] }, vendor_session: "next-" + process.argv[i + 1] }) + "\\n");\n`,
  );
  const ticket = join(root, "ticket.md");
  writeFileSync(
    ticket,
    ticketText("first prose").replace('name = "pin"', `name = "${ticketName}"`),
  );
  const resume = (id: string) =>
    Bun.spawnSync(
      [
        process.execPath,
        "tools/agx-worker/src/next/cli.ts",
        "run",
        ticket,
        "--cd",
        root,
        "--sandbox",
        "read-only",
        "--continue",
        id,
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          AGX_STATE_DIR: state,
          AGX_TMP_ROOT: join(root, "agx-tmp"),
          JEV_URL: "http://127.0.0.1:1/choice",
          AGX_WORKER_BIN: worker,
          TYPESAFE_API_KEY: "test-key",
          AGX_CONFIG: new URL(
            "../../src/roster/policy.example.toml",
            import.meta.url,
          ).pathname,
          AGX_DISPATCHER_SESSION: "dispatcher",
        },
        timeout: 10_000,
      },
    );
  const events = () =>
    readFileSync(join(state, "records.jsonl"), "utf8")
      .trim()
      .split("\n")
      .flatMap((line) => {
        const decoded = jsonOf(z.looseObject({ kind: z.string() })).safeParse(
          line,
        );
        if (!decoded.success) return [];
        const event = z
          .looseObject({ kind: z.string() })
          .safeParse(decoded.data);
        return event.success ? [event.data] : [];
      });
  return { root, state, ticket, resume, events };
};

const Started = z.looseObject({
  kind: z.literal("started"),
  id: z.string(),
  row: z.string(),
  vendor_session: z.string().nullable(),
  continues: z.string().nullable(),
});
const Receipt = z.looseObject({ id: z.string(), row: z.string() });

describe("agx worker run --continue pins the prior row", () => {
  test.each(["design_g5", "Design-G5"])(
    "legacy ticket %s resumes on its pinned row",
    async (name) => {
      const f = await fixture(name);
      const result = f.resume("codex-run");
      expect(result.exitCode).toBe(0);
      const receiptResult = jsonOf(Receipt).safeParse(
        result.stdout.toString().trim(),
      );
      expect(receiptResult.success).toBe(true);
      if (!receiptResult.success) return;
      const receipt = receiptResult.data;
      expect(receipt.row).toBe("terra-high");
      const started = f
        .events()
        .map((event) => Started.safeParse(event))
        .flatMap((parsed) => (parsed.success ? [parsed.data] : []))
        .find((event) => event.id === receipt.id);
      expect(started?.row).toBe("terra-high");
      expect(started?.vendor_session).toBe("codex-thread-1");
      expect(started?.continues).toBe("codex-run");
    },
    30000,
  );

  test("a claude run resumes its claude session on its claude row", async () => {
    const f = await fixture();
    const result = f.resume("claude-run");
    expect(result.exitCode).toBe(0);
    const receiptResult = jsonOf(Receipt).safeParse(
      result.stdout.toString().trim(),
    );
    expect(receiptResult.success).toBe(true);
    if (!receiptResult.success) return;
    const receipt = receiptResult.data;
    expect(receipt.row).toBe("sonnet-high");
    const ended = f
      .events()
      .find((event) => event.kind === "ended" && event.id === receipt.id);
    expect(ended?.vendor_session).toBe("next-claude-session-1");
  }, 30000);

  test("a run without a vendor session exits 2 before any worker starts", async () => {
    const f = await fixture();
    const before = f.events().length;
    const result = f.resume("bare-run");
    expect(result.exitCode).toBe(2);
    const lines = result.stderr.toString().trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("bare-run");
    expect(lines[0]).toContain("agx worker run");
    expect(f.events()).toHaveLength(before);
    expect(existsSync(join(f.state, "runs"))).toBe(false);
  });

  test("a run whose row left the roster exits 2 before any worker starts", async () => {
    const f = await fixture();
    const before = f.events().length;
    const result = f.resume("ghost-run");
    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString().trim().split("\n")).toHaveLength(1);
    expect(f.events()).toHaveLength(before);
  });

  test("the ticket file is re-read on continue", async () => {
    const f = await fixture();
    writeFileSync(f.ticket, ticketText("amended prose"));
    const result = f.resume("codex-run");
    expect(result.exitCode).toBe(0);
    const receiptResult = jsonOf(Receipt).safeParse(
      result.stdout.toString().trim(),
    );
    expect(receiptResult.success).toBe(true);
    if (!receiptResult.success) return;
    const receipt = receiptResult.data;
    const brief = readFileSync(
      join(f.state, "runs", receipt.id, "brief.md"),
      "utf8",
    );
    expect(brief).toContain("amended prose");
    expect(brief).not.toContain("first prose");
  }, 30000);
});
