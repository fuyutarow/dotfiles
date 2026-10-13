import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../../shared/src/zod.ts";

const servers: ReturnType<typeof Bun.spawn>[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.kill();
});

describe("agx-next run", () => {
  test("routes through Jev, starts a worker, and records its report", async () => {
    const root = mkdtempSync(join(tmpdir(), "agx-next-run-"));
    const state = join(root, "state");
    const ticket = join(root, "ticket.md");
    const worker = join(root, "fake-worker.ts");
    const jevFile = join(root, "fake-jev.ts");
    const portProbe = Bun.serve({ port: 0, fetch: () => new Response() });
    const jevPort = portProbe.port;
    await portProbe.stop(true);
    writeFileSync(
      jevFile,
      `Bun.serve({ hostname: "127.0.0.1", port: ${jevPort}, fetch: () => Response.json({ answers: { worker: { choice: "luna-high", confidence: 0.9 } } }) });\n`,
    );
    const jev = Bun.spawn([process.execPath, jevFile], {
      stdout: "ignore",
      stderr: "ignore",
    });
    servers.push(jev);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const ready = await fetch(`http://127.0.0.1:${jevPort}/health`).catch(
        () => null,
      );
      if (ready !== null) break;
      await Bun.sleep(25);
    }
    writeFileSync(
      ticket,
      `+++\nschema = 2\nname = "fake"\nwrites = ["src/**"]\noutcome = "run fake worker"\nconsumer = "legacy consumer field"\nfirst_return = "legacy return field"\nread_only_diagnostic = true\ntimeout_reason = "legacy reason"\nverify = []\ncapabilities = ["long-tool-loop"]\n[proposition]\nid = "T1"\nclaim = "fake worker runs"\nrefuted_by = "worker does not run"\ndecides = "infrastructure"\nserves = ["coordination-throughput"]\ngraph_node = "legacy-node"\n+++\nRESOURCE-CLASS(NONCOMPUTE): test fixture\nDo the test.\n`,
    );
    const interim = JSON.stringify({
      interim: true,
      findings: [{ text: "progress" }],
      evidence: [],
      impact_on_brief: "",
      proposed_next: "continue",
      artifacts: [],
    });
    const interimMessage = `\`\`\`agx-return\n${interim}\n\`\`\``;
    writeFileSync(
      worker,
      `import { appendFileSync } from "node:fs";\nconst resumeIndex = process.argv.indexOf("--resume");\nconst vendorSession = resumeIndex < 0 ? "vendor-1" : "continued-" + String(process.argv[resumeIndex + 1]);\nappendFileSync(process.env.AGX_INTERIM_REPORTS_FILE, JSON.stringify({ last_message: ${JSON.stringify(interimMessage)} }) + "\\n");\nprocess.stdout.write(JSON.stringify({ exit: 0, report: { summary: "fake done", changes: [], checks: [], for_coordinator: [], open: [] }, vendor_session: vendorSession }) + "\\n");\n`,
    );

    const workerEnv = {
      ...process.env,
      AGX_NEXT_STATE_DIR: state,
      AGX_NEXT_JEV_URL: `http://127.0.0.1:${jevPort}/choice`,
      AGX_NEXT_WORKER: worker,
      TYPESAFE_API_KEY: "test-key",
      DISPATCH_ROSTER_PATH: join(
        process.cwd(),
        "agents/models/dispatch-roster.toml",
      ),
      AGX_DISPATCHER_SESSION: "",
      CLAUDE_CODE_SESSION_ID: "claude-session",
    };

    const result = Bun.spawnSync(
      [
        process.execPath,
        "tools/agx/src/next/cli.ts",
        "run",
        ticket,
        "--cd",
        root,
        "--sandbox",
        "read-only",
      ],
      {
        cwd: process.cwd(),
        env: { ...workerEnv, AGX_DISPATCHER_SESSION: "dispatcher-session" },
        timeout: 10_000,
      },
    );

    expect(result.stderr.toString().trim().split("\n")).toHaveLength(1);
    expect(result.stderr.toString()).toStartWith(
      "WARN ignored legacy ticket fields:",
    );
    expect(result.exitCode).toBe(0);
    const lineSchema = z.looseObject({
      kind: z.string(),
      id: z.string().optional(),
      row: z.string().optional(),
      exit: z.number().optional(),
      dispatcher_session: z.string().nullable().optional(),
      vendor_session: z.string().nullable().optional(),
      continues: z.string().nullable().optional(),
    });
    const parsedLines = jsonOf(z.array(lineSchema)).safeParse(
      `[${readFileSync(join(state, "records.jsonl"), "utf8").trim().split("\n").join(",")}]`,
    );
    expect(parsedLines.success).toBe(true);
    if (!parsedLines.success) return;
    const lines = parsedLines.data;
    const started = lines[0];
    const ended = lines.at(-1);
    if (started === undefined || ended === undefined) return;
    expect(lines.map((line) => line.kind)).toEqual([
      "started",
      "progress",
      "ended",
    ]);
    expect(started.row).toBe("luna-high");
    expect(ended.exit).toBe(0);
    expect(started.dispatcher_session).toBe("dispatcher-session");
    expect(started.continues).toBeNull();
    if (started.id === undefined) return;

    const accepted = Bun.spawnSync(
      [
        process.execPath,
        "tools/agx/src/next/cli.ts",
        "judge",
        started.id,
        "accept",
        "--note",
        "test acceptance",
      ],
      { cwd: process.cwd(), env: { ...workerEnv, AGX_NEXT_STATE_DIR: state } },
    );
    expect(accepted.exitCode).toBe(0);

    const continued = Bun.spawnSync(
      [
        process.execPath,
        "tools/agx/src/next/cli.ts",
        "run",
        ticket,
        "--cd",
        root,
        "--sandbox",
        "read-only",
        "--continue",
        started.id,
      ],
      { cwd: process.cwd(), env: workerEnv, timeout: 10_000 },
    );
    expect(continued.exitCode).toBe(0);
    expect(continued.stderr.toString().trim().split("\n")).toHaveLength(1);
    expect(continued.stderr.toString()).toStartWith(
      "WARN ignored legacy ticket fields:",
    );

    const noDispatcher = Bun.spawnSync(
      [
        process.execPath,
        "tools/agx/src/next/cli.ts",
        "run",
        ticket,
        "--cd",
        root,
        "--sandbox",
        "read-only",
      ],
      {
        cwd: process.cwd(),
        env: {
          ...workerEnv,
          AGX_DISPATCHER_SESSION: "",
          CLAUDE_CODE_SESSION_ID: "",
        },
        timeout: 10_000,
      },
    );
    expect(noDispatcher.exitCode).toBe(0);
    const noDispatcherReceipt = jsonOf(
      z.looseObject({ id: z.string() }),
    ).safeParse(noDispatcher.stdout.toString().trim());
    expect(noDispatcherReceipt.success).toBe(true);
    if (!noDispatcherReceipt.success) return;

    const listed = Bun.spawnSync(
      [process.execPath, "tools/agx/src/next/cli.ts", "ls", "--json"],
      {
        cwd: process.cwd(),
        env: { ...process.env, AGX_NEXT_STATE_DIR: state },
      },
    );
    const listedSchema = z.array(
      z.looseObject({
        id: z.string(),
        ticket: z.string(),
        state: z.enum(["running", "ended", "orphaned"]),
        exit: z.number().nullable(),
        row: z.string(),
        dispatcher_session: z.string().nullable(),
        cwd: z.string(),
        workspace: z.string(),
        writes: z.array(z.string()),
        judgment: z
          .looseObject({ decision: z.string(), note: z.string() })
          .nullable(),
        report_path: z.string().nullable(),
        last_progress_path: z.string().nullable(),
        continues: z.string().nullable(),
        vendor_session: z.string().nullable(),
      }),
    );
    const parsedRows = jsonOf(listedSchema).safeParse(listed.stdout.toString());
    expect(parsedRows.success).toBe(true);
    if (!parsedRows.success) return;
    const rows = parsedRows.data;
    const firstRow = rows.find((row) => row.id === started.id);
    const secondRow = rows.find((row) => row.continues === started.id);
    const noDispatcherRow = rows.find(
      (row) => row.id === noDispatcherReceipt.data.id,
    );
    expect(firstRow).toBeDefined();
    expect(secondRow).toBeDefined();
    expect(noDispatcherRow).toBeDefined();
    if (
      firstRow === undefined ||
      secondRow === undefined ||
      noDispatcherRow === undefined
    )
      return;
    if (firstRow.last_progress_path === null) return;
    expect(existsSync(firstRow.last_progress_path)).toBe(true);
    expect(firstRow.dispatcher_session).toBe("dispatcher-session");
    expect(firstRow.continues).toBeNull();
    expect(firstRow.judgment?.decision).toBe("accept");
    expect(secondRow.dispatcher_session).toBe("claude-session");
    expect(secondRow.continues).toBe(started.id);
    expect(secondRow.vendor_session).toBe("continued-vendor-1");
    expect(noDispatcherRow.dispatcher_session).toBeNull();
    expect(noDispatcherRow.continues).toBeNull();
    const rejected = Bun.spawnSync(
      [
        process.execPath,
        "tools/agx/src/next/cli.ts",
        "judge",
        secondRow.id,
        "reject",
      ],
      { cwd: process.cwd(), env: { ...workerEnv, AGX_NEXT_STATE_DIR: state } },
    );
    expect(rejected.exitCode).toBe(0);
    expect(Object.keys(firstRow).toSorted()).toEqual(
      [
        "continues",
        "cwd",
        "dispatcher_session",
        "exit",
        "id",
        "judgment",
        "last_progress_path",
        "report_path",
        "row",
        "state",
        "ticket",
        "vendor_session",
        "workspace",
        "writes",
      ].toSorted(),
    );

    const checked = Bun.spawnSync(
      [
        process.execPath,
        "tools/agx/src/next/cli.ts",
        "check",
        ticket,
        "--cd",
        root,
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, AGX_NEXT_STATE_DIR: join(root, "check-state") },
      },
    );
    expect(checked.exitCode).toBe(0);
    expect(checked.stdout.toString()).toContain(`OK ticket=fake cwd=${root}`);
    expect(checked.stderr.toString().trim().split("\n")).toHaveLength(1);
    expect(checked.stderr.toString()).toStartWith(
      "WARN ignored legacy ticket fields:",
    );
  }, 15_000);

  test("validation refusal exits 2", () => {
    const root = mkdtempSync(join(tmpdir(), "agx-next-invalid-ticket-"));
    const ticket = join(root, "invalid.md");
    writeFileSync(
      ticket,
      `+++\nschema = 2\nwrites = []\noutcome = "invalid fixture"\nverify = []\n[proposition]\nid = "bad"\nclaim = "missing refuted_by"\n+++\n`,
    );
    const result = Bun.spawnSync(
      [
        process.execPath,
        "tools/agx/src/next/cli.ts",
        "check",
        ticket,
        "--cd",
        root,
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, AGX_NEXT_STATE_DIR: join(root, "state") },
      },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString()).toContain("invalid ticket:");
  });

  test("imports sampled real legacy line shapes once", () => {
    const root = mkdtempSync(join(tmpdir(), "agx-next-import-"));
    const source = join(root, "legacy");
    const destination = join(root, "next");
    const fixture = join(import.meta.dir, "fixtures/legacy-real-shapes.jsonl");
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, "runs.jsonl"), readFileSync(fixture));
    const env = {
      ...process.env,
      AGX_STATE_DIR: source,
      AGX_NEXT_STATE_DIR: destination,
    };
    const first = Bun.spawnSync(
      [
        process.execPath,
        "tools/agx/src/next/cli.ts",
        "stats",
        "--import-legacy",
      ],
      { cwd: process.cwd(), env },
    );
    const reportSchema = z.looseObject({
      runs: z.number(),
      legacy_import: z.looseObject({
        runs_imported: z.number(),
        judgments_imported: z.number(),
        progress_imported: z.number(),
      }),
    });
    const report = jsonOf(reportSchema).safeParse(first.stdout.toString());
    expect(first.stderr.toString()).toBe("");
    expect(first.exitCode).toBe(0);
    expect(report.success).toBe(true);
    if (!report.success) return;
    expect(report.data.runs).toBe(1);
    expect(report.data.legacy_import).toEqual({
      runs_imported: 1,
      judgments_imported: 3,
      progress_imported: 1,
      malformed_lines: 0,
      ignored_rows: 0,
    });

    const second = Bun.spawnSync(
      [
        process.execPath,
        "tools/agx/src/next/cli.ts",
        "stats",
        "--import-legacy",
      ],
      { cwd: process.cwd(), env },
    );
    const repeat = jsonOf(reportSchema).safeParse(second.stdout.toString());
    expect(second.exitCode).toBe(0);
    expect(repeat.success).toBe(true);
    if (repeat.success) expect(repeat.data.runs).toBe(1);
  });
});
