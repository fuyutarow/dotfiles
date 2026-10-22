import { prepareTicketRepo } from "../ticket-repo.ts";
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { jsonOf, z } from "../../../shared/src/zod.ts";
import { createTempTracker } from "../temp.ts";
import { earlyQuitRows, systemdUnitName } from "../../src/next/run.ts";
import { foldedRuns } from "../../src/next/store.ts";
import { VerifyResult } from "../../src/next/verify.ts";

const tempDirs = createTempTracker();
const registerTempDir = tempDirs.register;
afterAll(tempDirs.assertRemoved);

const servers: ReturnType<typeof Bun.spawn>[] = [];
const roots: string[] = [];
const priorNextStateDir = process.env.AGX_NEXT_STATE_DIR;
afterEach(() => {
  for (const server of servers.splice(0)) server.kill();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
  if (priorNextStateDir === undefined) delete process.env.AGX_NEXT_STATE_DIR;
  else process.env.AGX_NEXT_STATE_DIR = priorNextStateDir;
});
const scratch = async (prefix: string): Promise<string> => {
  const root = registerTempDir(
    mkdtempSync(join(tmpdir(), `agx-test-${process.pid}-${prefix}`)),
  );
  roots.push(root);
  await prepareTicketRepo(root);
  return root;
};

describe("agx-worker run", () => {
  test.each(["passed", "failed", "absent"])(
    "real run orders and records verify.always: %s",
    async (mode) => {
      const root = await scratch("always-");
      const state = join(root, "state");
      const always = [
        'printf "always-one\\n" >> order; echo always-log; test "$VERIFY_FIXTURE" = shared',
        `printf "always-two\\n" >> order; exit ${mode === "failed" ? 1 : 0}`,
      ];
      if (mode !== "absent") {
        writeFileSync(
          join(root, "agx.toml"),
          `schema = 1\ntickets = "."\n[verify]\nalways = ${JSON.stringify(always)}\n`,
        );
        // Commit the declaration so the real immutable L1 reader sees it.
        for (const args of [
          ["add", "agx.toml"],
          [
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "-c",
            "commit.gpgsign=false",
            "commit",
            "-qm",
            "Declare verification",
          ],
        ]) {
          const committed = Bun.spawnSync(["git", ...args], {
            cwd: root,
            env: {
              ...process.env,
              GIT_CONFIG_NOSYSTEM: "1",
              GIT_CONFIG_GLOBAL: "/dev/null",
            },
          });
          expect(committed.exitCode, committed.stderr.toString()).toBe(0);
        }
      }
      const ticket = join(root, "ticket.md");
      const ticketCommand =
        'printf "ticket\\n" >> order; echo ticket-log; test "$VERIFY_FIXTURE" = shared';
      writeFileSync(
        ticket,
        `+++\nschema = 2\nname = "always-probe"\nwrites = ["order"]\noutcome = "verify command order"\nverify = ${JSON.stringify([ticketCommand])}\n[proposition]\nid = "ORDER"\nclaim = "always runs first"\nrefuted_by = "incorrect order"\n+++\nRun the fixture.\n`,
      );
      const worker = join(root, "worker.ts");
      writeFileSync(
        worker,
        'import { writeFileSync } from "node:fs"; writeFileSync("order", ""); console.log(JSON.stringify({ report: { summary: "done", changes: [], checks: [], for_coordinator: [], open: [] } }));\n',
      );
      const jevFile = join(root, "jev.ts");
      const probe = Bun.serve({ port: 0, fetch: () => new Response() });
      const port = probe.port;
      await probe.stop(true);
      writeFileSync(
        jevFile,
        `Bun.serve({ hostname: "127.0.0.1", port: ${port}, fetch: () => Response.json({ answers: { worker: { choice: "luna-high", confidence: 0.9 } } }) });\n`,
      );
      const server = Bun.spawn([process.execPath, jevFile], {
        stdout: "ignore",
        stderr: "ignore",
      });
      servers.push(server);
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (
          (await fetch(`http://127.0.0.1:${port}`).catch(() => null)) !== null
        )
          break;
        await Bun.sleep(25);
      }
      const env = {
        ...process.env,
        XDG_CONFIG_HOME: join(root, "config"),
        AGX_NEXT_STATE_DIR: state,
        AGX_TMP_ROOT: join(root, "tmp"),
        JEV_URL: `http://127.0.0.1:${port}`,
        TYPESAFE_API_KEY: "test-key",
        AGX_WORKER_BIN: worker,
        VERIFY_FIXTURE: "shared",
        DISPATCH_ROSTER_PATH: join(
          process.cwd(),
          "agents/models/dispatch-roster.toml",
        ),
      };
      const invoke = (command: string) =>
        Bun.spawnSync(
          [
            process.execPath,
            "tools/agx-worker/src/next/cli.ts",
            command,
            ticket,
            "--cd",
            root,
          ],
          { cwd: process.cwd(), env, timeout: 10_000 },
        );
      const checked = invoke("check");
      expect(checked.exitCode, checked.stderr.toString()).toBe(0);
      if (mode === "absent")
        expect(checked.stdout.toString()).not.toContain("[verify].always");
      else
        expect(checked.stdout.toString()).toContain(
          `[verify].always=${JSON.stringify(always)}`,
        );
      expect(existsSync(join(root, "order"))).toBe(false);
      const result = invoke("run");
      expect(result.exitCode, result.stderr.toString()).toBe(0);
      expect(readFileSync(join(root, "order"), "utf8")).toBe(
        mode === "absent" ? "ticket\n" : "always-one\nalways-two\nticket\n",
      );
      process.env.AGX_NEXT_STATE_DIR = state;
      const run = (await foldedRuns()).at(-1);
      expect(run?.outcome).toBe(mode === "failed" ? "verify-failed" : "ok");
      expect(run?.verify.map((entry) => entry.cmd)).toEqual(
        mode === "absent" ? [ticketCommand] : [...always, ticketCommand],
      );
      const alwaysExits = [0, mode === "failed" ? 1 : 0, 0];
      expect(run?.verify.map((entry) => entry.exit)).toEqual(
        mode === "absent" ? [0] : alwaysExits,
      );
      expect(run).toBeDefined();
      expect(run?.report_path).not.toBeNull();
      if (run === undefined || run.report_path === null) return;
      const parsedReport = jsonOf(
        z.looseObject({ verify: z.array(VerifyResult).optional() }),
      ).safeParse(readFileSync(run.report_path, "utf8"));
      expect(parsedReport.success).toBe(true);
      if (!parsedReport.success) return;
      const report = parsedReport.data;
      if (mode === "absent") {
        expect(run.verify[0]).not.toHaveProperty("source");
        expect(report).not.toHaveProperty("verify");
      } else {
        expect(run.verify.slice(0, 2).map((entry) => entry.source)).toEqual([
          "[verify].always",
          "[verify].always",
        ]);
        expect(run.verify[2]).not.toHaveProperty("source");
        expect(report.verify).toEqual(run.verify);
        expect(readFileSync(run.verify[0]!.log_path, "utf8")).toBe(
          "always-log\n",
        );
      }
      expect(readFileSync(run.verify.at(-1)!.log_path, "utf8")).toBe(
        "ticket-log\n",
      );
    },
    30_000,
  );

  test("refuses the retired worker override before inspecting the ticket", () => {
    const result = Bun.spawnSync(
      [
        process.execPath,
        "tools/agx-worker/src/next/cli.ts",
        "run",
        "missing-ticket.md",
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          AGX_NEXT_WORKER: "/tmp/retired-worker.ts",
          AGX_WORKER_BIN: "/tmp/current-worker.ts",
        },
      },
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString().trim()).toBe(
      "agx: AGX_NEXT_WORKER is no longer supported; use AGX_WORKER_BIN",
    );
  });

  test("reads a systemd service unit from the process cgroup", () => {
    expect(
      systemdUnitName(
        "0::/user.slice/user-1000.slice/user@1000.service/app.slice/agt_example.service\n",
      ),
    ).toBe("agt_example");
    expect(
      systemdUnitName("0::/user.slice/user-1000.slice/session.scope\n"),
    ).toBeUndefined();
  });

  test("refuses dispatch when the target has an ownerless ref lock", async () => {
    const root = await scratch("ownerless-ref-lock-");
    const repo = join(root, "repo");
    mkdirSync(join(repo, ".git"), { recursive: true });
    const lock = join(repo, ".git", "packed-refs.lock");
    writeFileSync(lock, "fixture\n");
    const oldSeconds =
      (Temporal.Now.instant().epochMilliseconds - 70_000) / 1_000;
    utimesSync(lock, oldSeconds, oldSeconds);
    const ticket = join(root, "ticket.md");
    writeFileSync(
      ticket,
      `+++\nschema = 2\nname = "stale-lock"\nwrites = []\noutcome = "must not dispatch"\nverify = []\n[proposition]\nid = "LOCK"\nclaim = "stale lock blocks dispatch"\nrefuted_by = "dispatch starts"\n+++\nProbe the lock guard.\n`,
    );
    const state = join(root, "state");
    const result = Bun.spawnSync(
      [
        process.execPath,
        "tools/agx-worker/src/next/cli.ts",
        "run",
        ticket,
        "--cd",
        repo,
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, AGX_NEXT_STATE_DIR: state },
        timeout: 5_000,
      },
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString()).toContain(lock);
    expect(result.stderr.toString()).toContain("age=");
    expect(result.stderr.toString()).toContain("rip <path>");
    expect(existsSync(join(state, "records.jsonl"))).toBe(false);
  });

  test("a sub-two-minute zero-change exit without RETURN fails its lineage", async () => {
    const root = await scratch("early-quit-");
    const state = join(root, "state");
    mkdirSync(state, { recursive: true });
    process.env.AGX_NEXT_STATE_DIR = state;
    const started = "2026-10-14T01:00:00.000Z";
    const records = [
      {
        kind: "started",
        id: "early",
        at: started,
        ticket: "th_purge",
        writes: [],
        cwd: root,
        workspace: root,
        row: "sol-low",
        dispatcher_session: null,
        vendor_session: null,
        pid: 0,
      },
      {
        kind: "ended",
        id: "early",
        at: "2026-10-14T01:01:15.000Z",
        exit: 0,
        report_path: null,
        vendor_session: null,
        verify: [],
        returned: false,
        changed_files: 0,
      },
    ];
    writeFileSync(
      join(state, "records.jsonl"),
      `${records.map((event) => JSON.stringify(event)).join("\n")}\n`,
    );
    expect((await foldedRuns())[0]?.failed_early_quit).toBe(true);
  });

  test("legacy early quits are read only for the matching ticket lineage", async () => {
    const root = await scratch("legacy-early-quit-");
    const state = join(root, "state");
    mkdirSync(state, { recursive: true });
    process.env.AGX_NEXT_STATE_DIR = state;
    const reportPath = join(root, "historical-report.json");
    writeFileSync(
      reportPath,
      JSON.stringify({ summary: "stopped without work", changes: [] }),
    );
    const records = [
      {
        kind: "started",
        id: "legacy-early",
        at: "2026-10-14T01:00:00.000Z",
        ticket: "th_purge",
        writes: [],
        cwd: root,
        workspace: root,
        row: "luna-medium",
        dispatcher_session: null,
        vendor_session: null,
        pid: 0,
      },
      {
        kind: "ended",
        id: "legacy-early",
        at: "2026-10-14T01:01:15.000Z",
        exit: 0,
        report_path: reportPath,
        vendor_session: null,
        verify: [],
      },
    ];
    writeFileSync(
      join(state, "records.jsonl"),
      `${records.map((event) => JSON.stringify(event)).join("\n")}\n`,
    );

    expect((await foldedRuns())[0]?.failed_early_quit).toBe(false);
    expect(await earlyQuitRows("th_purge", root)).toEqual(["luna-medium"]);
    expect(await earlyQuitRows("other-ticket", root)).toEqual([]);
  });

  test("routes through Jev, starts a worker, and records its report", async () => {
    const root = await scratch("next-run-");
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
      `+++\nschema = 2\nname = "fake"\nwrites = ["src/**"]\noutcome = "run fake worker"\nconsumer = "legacy consumer field"\nfirst_return = "legacy return field"\nfirst_return_s = 1\ntimeout_s = 60\nread_only_diagnostic = true\ntimeout_reason = "legacy reason"\nverify = []\ncapabilities = ["routine-check"]\n[proposition]\nid = "T1"\nclaim = "fake worker runs"\nrefuted_by = "worker does not run"\ndecides = "infrastructure"\nserves = ["coordination-throughput"]\ngraph_node = "legacy-node"\n+++\nRESOURCE-CLASS(NONCOMPUTE): test fixture\nDo the test.\n`,
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
      `import { appendFileSync } from "node:fs";\nconst resumeIndex = process.argv.indexOf("--resume");\nconst vendorSession = resumeIndex < 0 ? "vendor-1" : "continued-" + String(process.argv[resumeIndex + 1]);\nif (process.env.AGX_LATE_FIXTURE === "1") await Bun.sleep(1400);\nelse appendFileSync(process.env.AGX_INTERIM_REPORTS_FILE, JSON.stringify({ last_message: ${JSON.stringify(interimMessage)} }) + "\\n");\nprocess.stdout.write(JSON.stringify({ exit: 0, report: { summary: "fake done", changes: [], checks: [], for_coordinator: [], open: [] }, vendor_session: vendorSession }) + "\\n");\n`,
    );

    const workerEnv = {
      ...process.env,
      AGX_NEXT_STATE_DIR: state,
      AGX_TMP_ROOT: join(root, "agx-tmp"),
      JEV_URL: `http://127.0.0.1:${jevPort}/choice`,
      AGX_WORKER_BIN: worker,
      TYPESAFE_API_KEY: "test-key",
      DISPATCH_ROSTER_PATH: join(
        process.cwd(),
        "agents/models/dispatch-roster.toml",
      ),
      AGX_DISPATCHER_SESSION: "",
      CLAUDE_CODE_SESSION_ID: "claude-session",
    };
    const binding = {
      id: "00000000-0000-4000-8000-000000000001",
      ticket: "fake",
      workspace: root,
      unit: "agt_other-2",
    };

    const result = Bun.spawnSync(
      [
        process.execPath,
        "tools/agx-worker/src/next/cli.ts",
        "run",
        ticket,
        "--cd",
        root,
        "--sandbox",
        "read-only",
        "--session",
        "flag-session",
        "--dispatch-binding",
        JSON.stringify(binding),
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
      at: z.string().optional(),
      row: z.string().optional(),
      worker_name: z.string().optional(),
      unit: z.string().optional(),
      workspace_name: z.string().optional(),
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
    if (started.at === undefined || ended.at === undefined) return;
    expect(lines.map((line) => line.kind)).toEqual([
      "started",
      "progress",
      "ended",
    ]);
    expect(started.row).toBe("luna-high");
    expect(started.id).toBe(binding.id);
    expect(started.unit).toBe(binding.unit);
    expect(started.worker_name).toBe(binding.unit);
    expect(started.workspace_name).toBe(basename(root));
    expect(ended.exit).toBe(0);
    expect(started.dispatcher_session).toBe("flag-session");
    expect(started.continues).toBeNull();
    if (started.id === undefined) return;

    const lateBinding = {
      ...binding,
      id: "00000000-0000-4000-8000-000000000002",
    };
    const lateRun = Bun.spawnSync(
      [
        process.execPath,
        "tools/agx-worker/src/next/cli.ts",
        "run",
        ticket,
        "--cd",
        root,
        "--sandbox",
        "read-only",
        "--dispatch-binding",
        JSON.stringify(lateBinding),
      ],
      {
        cwd: process.cwd(),
        env: { ...workerEnv, AGX_LATE_FIXTURE: "1" },
        timeout: 10_000,
      },
    );
    expect(lateRun.exitCode).toBe(0);
    const lateRecordsResult = jsonOf(
      z.array(
        z.looseObject({
          kind: z.string(),
          id: z.string().optional(),
          at: z.string().optional(),
          first_return_s: z.number().optional(),
          elapsed: z.number().optional(),
          exit: z.number().optional(),
        }),
      ),
    ).safeParse(
      `[${readFileSync(join(state, "records.jsonl"), "utf8").trim().split("\n").join(",")}]`,
    );
    expect(lateRecordsResult.success).toBe(true);
    if (!lateRecordsResult.success) return;
    const lateRecords = lateRecordsResult.data;
    const lateEvents = lateRecords.filter(
      (event) => event.kind === "late" && event.id === lateBinding.id,
    );
    expect(lateEvents).toHaveLength(1);
    expect(lateEvents[0]).toMatchObject({
      first_return_s: 1,
      id: lateBinding.id,
      kind: "late",
    });
    expect(lateEvents[0]?.at).toBeDefined();
    expect(lateEvents[0]?.elapsed).toBeGreaterThanOrEqual(1);
    const lateEnded = lateRecords.find(
      (event) => event.kind === "ended" && event.id === lateBinding.id,
    );
    expect(lateEnded?.exit).toBe(0);
    expect(
      lateRecords.filter(
        (event) => event.kind === "late" && event.id === binding.id,
      ),
    ).toHaveLength(0);

    const accepted = Bun.spawnSync(
      [
        process.execPath,
        "tools/agx-worker/src/next/cli.ts",
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
        "tools/agx-worker/src/next/cli.ts",
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

    const codexDispatcher = Bun.spawnSync(
      [
        process.execPath,
        "tools/agx-worker/src/next/cli.ts",
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
          AGX_NEXT_STATE_DIR: state,
          AGX_DISPATCHER_SESSION: "",
          CLAUDE_CODE_SESSION_ID: "",
          CODEX_SESSION_ID: "codex-session",
        },
        timeout: 10_000,
      },
    );
    expect(codexDispatcher.exitCode).toBe(0);
    const codexReceipt = jsonOf(z.looseObject({ id: z.string() })).safeParse(
      codexDispatcher.stdout.toString().trim(),
    );
    expect(codexReceipt.success).toBe(true);
    if (!codexReceipt.success) return;

    const noDispatcher = Bun.spawnSync(
      [
        process.execPath,
        "tools/agx-worker/src/next/cli.ts",
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
          CODEX_SESSION_ID: "",
        },
        timeout: 10_000,
      },
    );
    expect(noDispatcher.exitCode).toBe(0);
    expect(
      noDispatcher.stderr
        .toString()
        .split("\n")
        .filter((line) => line.startsWith("WARN dispatcher session")),
    ).toEqual([
      "WARN dispatcher session is unavailable; pass --session ID or preserve CLAUDE_CODE_SESSION_ID/CODEX_SESSION_ID (systemd-run: use -E NAME).",
    ]);
    const noDispatcherReceipt = jsonOf(
      z.looseObject({ id: z.string() }),
    ).safeParse(noDispatcher.stdout.toString().trim());
    expect(noDispatcherReceipt.success).toBe(true);
    if (!noDispatcherReceipt.success) return;

    const listed = Bun.spawnSync(
      [process.execPath, "tools/agx-worker/src/next/cli.ts", "ls", "--json"],
      {
        cwd: process.cwd(),
        env: { ...process.env, AGX_NEXT_STATE_DIR: state },
      },
    );
    const listedSchema = z.array(
      z.looseObject({
        id: z.string(),
        started_at: z.string(),
        ended_at: z.string().nullable(),
        ticket: z.string(),
        state: z.enum(["running", "ended"]),
        exit: z.number().nullable(),
        row: z.string(),
        dispatcher_session: z.string().nullable(),
        unit: z.string().optional(),
        cwd: z.string(),
        workspace: z.string(),
        writes: z.array(z.string()),
        judgment: z
          .looseObject({ decision: z.string(), note: z.string() })
          .nullable(),
        report_path: z.string().nullable(),
        verify: z.array(
          z.strictObject({
            cmd: z.string(),
            exit: z.number(),
            log_path: z.string(),
          }),
        ),
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
    const codexRow = rows.find((row) => row.id === codexReceipt.data.id);
    expect(firstRow).toBeDefined();
    expect(secondRow).toBeDefined();
    expect(noDispatcherRow).toBeDefined();
    expect(codexRow).toBeDefined();
    if (
      firstRow === undefined ||
      secondRow === undefined ||
      noDispatcherRow === undefined ||
      codexRow === undefined
    )
      return;
    if (firstRow.last_progress_path === null) return;
    expect(existsSync(firstRow.last_progress_path)).toBe(true);
    expect(firstRow.dispatcher_session).toBe("flag-session");
    expect(firstRow.continues).toBeNull();
    expect(firstRow.judgment?.decision).toBe("accept");
    expect(firstRow.verify).toEqual([]);
    expect(firstRow.started_at).toBe(started.at);
    expect(firstRow.ended_at).toBe(ended.at);
    expect(secondRow.dispatcher_session).toBe("claude-session");
    expect(secondRow.continues).toBe(started.id);
    expect(secondRow.vendor_session).toBe("continued-vendor-1");
    expect(codexRow.dispatcher_session).toBe("codex-session");
    expect(noDispatcherRow.dispatcher_session).toBeNull();
    expect(noDispatcherRow.continues).toBeNull();
    const rejected = Bun.spawnSync(
      [
        process.execPath,
        "tools/agx-worker/src/next/cli.ts",
        "judge",
        secondRow.id,
        "reject",
      ],
      { cwd: process.cwd(), env: { ...workerEnv, AGX_NEXT_STATE_DIR: state } },
    );
    expect(rejected.exitCode).toBe(0);
    expect(Object.keys(firstRow).toSorted()).toEqual(
      [
        "ended_at",
        "elapsed_seconds",
        "started_at",
        "continues",
        "supersedes",
        "base_rev",
        "premise_commits",
        "ticket_path",
        "ticket_orig_path",
        "ticket_sha256",
        "cwd",
        "dispatcher_session",
        "exit",
        "outcome",
        "failed_early_quit",
        "health",
        "id",
        "judgment",
        "last_progress_path",
        "lease",
        "report_path",
        "returned",
        "changed_files",
        "row",
        "state",
        "ticket",
        "vendor_session",
        "unit",
        "worker_name",
        "verify",
        "workspace",
        "workspace_name",
        "writes",
      ].toSorted(),
    );

    const checked = Bun.spawnSync(
      [
        process.execPath,
        "tools/agx-worker/src/next/cli.ts",
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
    // Four run subprocesses retain their own 10s limits; this case also checks judgment, listing and validation.
  }, 60_000);

  test("runs ticket verification in order and records every exit and log", async () => {
    const root = await scratch("next-verify-");
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
      `+++\nschema = 2\nname = "verify-fixture"\nwrites = []\noutcome = "verify fixture"\nverify = ["true", "sh -c 'exit 3'"]\n[proposition]\nid = "VERIFY-1"\nclaim = "verification runs"\nrefuted_by = "verification does not run"\n+++\nRun the fixture.\n`,
    );
    writeFileSync(
      worker,
      `process.stdout.write(JSON.stringify({ exit: 0, report: { summary: "worker done", changes: [], checks: [], for_coordinator: [], open: [] } }) + "\\n");\n`,
    );
    const env = {
      ...process.env,
      AGX_NEXT_STATE_DIR: state,
      AGX_TMP_ROOT: join(root, "agx-tmp"),
      JEV_URL: `http://127.0.0.1:${jevPort}/choice`,
      AGX_WORKER_BIN: worker,
      TYPESAFE_API_KEY: "test-key",
      DISPATCH_ROSTER_PATH: join(
        process.cwd(),
        "agents/models/dispatch-roster.toml",
      ),
    };
    const result = Bun.spawnSync(
      [
        process.execPath,
        "tools/agx-worker/src/next/cli.ts",
        "run",
        ticket,
        "--cd",
        root,
      ],
      { cwd: process.cwd(), env, timeout: 10_000 },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr.toString()).toContain("VERIFY exit=0 true");
    expect(result.stderr.toString()).toContain("VERIFY exit=3 sh -c 'exit 3'");
    const listed = Bun.spawnSync(
      [process.execPath, "tools/agx-worker/src/next/cli.ts", "ls", "--json"],
      { cwd: process.cwd(), env },
    );
    const rows = jsonOf(
      z.array(
        z.looseObject({
          exit: z.number().nullable(),
          verify: z.array(
            z.strictObject({
              cmd: z.string(),
              exit: z.number(),
              log_path: z.string(),
              kind: z.enum(["passed", "failed", "unrunnable", "killed"]),
            }),
          ),
        }),
      ),
    ).safeParse(listed.stdout.toString());
    expect(rows.success).toBe(true);
    if (!rows.success) return;
    expect(rows.data).toHaveLength(1);
    const row = rows.data[0];
    if (row === undefined) return;
    expect(row.exit).toBe(0);
    expect(row.verify.map(({ exit }) => exit)).toEqual([0, 3]);
    expect(row.verify.map(({ cmd }) => cmd)).toEqual([
      "true",
      "sh -c 'exit 3'",
    ]);
    expect(row.verify.every(({ log_path }) => existsSync(log_path))).toBe(true);
  });

  test("validation refusal exits 2", async () => {
    const root = await scratch("next-invalid-ticket-");
    const ticket = join(root, "invalid.md");
    writeFileSync(
      ticket,
      `+++\nschema = 2\nwrites = []\noutcome = "invalid fixture"\nverify = []\n[proposition]\nid = "bad"\nclaim = "missing refuted_by"\n+++\n`,
    );
    const result = Bun.spawnSync(
      [
        process.execPath,
        "tools/agx-worker/src/next/cli.ts",
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

  test("imports sampled real legacy line shapes once", async () => {
    const root = await scratch("next-import-");
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
        "tools/agx-worker/src/next/cli.ts",
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
      judgments_imported: 2,
      progress_imported: 1,
      malformed_lines: 0,
      ignored_rows: 2,
    });

    const listed = Bun.spawnSync(
      [process.execPath, "tools/agx-worker/src/next/cli.ts", "ls", "--json"],
      { cwd: process.cwd(), env },
    );
    const legacyRows = jsonOf(
      z.array(
        z.looseObject({
          ticket: z.string(),
          started_at: z.string(),
          ended_at: z.string().nullable(),
        }),
      ),
    ).safeParse(listed.stdout.toString());
    expect(listed.exitCode).toBe(0);
    expect(legacyRows.success).toBe(true);
    if (legacyRows.success)
      expect(legacyRows.data[0]).toMatchObject({
        ticket: "legacy_fixture",
        started_at: "2026-10-10T12:00:00Z",
        ended_at: "2026-10-10T12:02:00Z",
      });

    const second = Bun.spawnSync(
      [
        process.execPath,
        "tools/agx-worker/src/next/cli.ts",
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

  test("folds only accept and reject judgments from legacy decisions", async () => {
    const root = await scratch("next-judgment-fold-");
    const state = join(root, "state");
    mkdirSync(state, { recursive: true });
    const at = "2026-10-14T00:00:00Z";
    const started = (id: string) => ({
      kind: "started",
      id,
      at,
      ticket: id,
      writes: [],
      cwd: root,
      workspace: root,
      row: "fixture",
      dispatcher_session: null,
      vendor_session: null,
      pid: 0,
    });
    const judged = (id: string, decision: string) => ({
      kind: "judged",
      id,
      at,
      decision,
      note: "fixture",
    });
    writeFileSync(
      join(state, "records.jsonl"),
      [
        started("pass"),
        judged("pass", "pass"),
        started("waived"),
        judged("waived", "waived"),
        started("landed"),
        judged("landed", "landed"),
        started("later-valid"),
        judged("later-valid", "pass"),
        judged("later-valid", "reject"),
      ]
        .map((event) => JSON.stringify(event))
        .join("\n") + "\n",
    );
    const result = Bun.spawnSync(
      [process.execPath, "tools/agx-worker/src/next/cli.ts", "ls", "--json"],
      {
        cwd: process.cwd(),
        env: { ...process.env, AGX_NEXT_STATE_DIR: state },
      },
    );
    const rows = jsonOf(
      z.array(
        z.looseObject({
          id: z.string(),
          judgment: z
            .looseObject({ decision: z.string(), note: z.string() })
            .nullable(),
        }),
      ),
    ).safeParse(result.stdout.toString());
    expect(result.exitCode).toBe(0);
    expect(rows.success).toBe(true);
    if (!rows.success) return;
    const judgments = new Map(
      rows.data.map((row) => [row.id, row.judgment?.decision ?? null]),
    );
    expect(judgments).toEqual(
      new Map([
        ["pass", null],
        ["waived", null],
        ["landed", "accept"],
        ["later-valid", "reject"],
      ]),
    );
    expect(
      [...judgments.values()].filter(
        (decision) =>
          decision !== null && decision !== "accept" && decision !== "reject",
      ),
    ).toEqual([]);
  });

  test("ls JSON exposes started and ended event timestamps", () => {
    const root = mkdtempSync(join(tmpdir(), "agx-next-run-timestamps-"));
    const state = join(root, "state");
    mkdirSync(state, { recursive: true });
    const runningAt = "2026-10-14T01:02:03Z";
    const endedStartedAt = "2026-10-14T02:03:04Z";
    const endedAt = "2026-10-14T02:05:06Z";
    const started = (id: string, at: string) => ({
      kind: "started",
      id,
      at,
      ticket: id,
      writes: [],
      cwd: root,
      workspace: root,
      worker_name: id === "running" ? "agt_systemd-unit" : "agt_ended",
      workspace_name: "ws_fixture",
      row: "fixture",
      dispatcher_session: null,
      vendor_session: null,
      pid: id === "running" ? process.pid : 0,
    });
    const records = [
      started("running", runningAt),
      started("ended", endedStartedAt),
      {
        kind: "ended",
        id: "ended",
        at: endedAt,
        exit: 0,
        report_path: null,
        vendor_session: null,
        verify: [],
      },
    ];
    writeFileSync(
      join(state, "records.jsonl"),
      records.map((event) => JSON.stringify(event)).join("\n") + "\n",
    );
    const result = Bun.spawnSync(
      [process.execPath, "tools/agx-worker/src/next/cli.ts", "ls", "--json"],
      {
        cwd: process.cwd(),
        env: { ...process.env, AGX_NEXT_STATE_DIR: state },
      },
    );
    const rows = jsonOf(
      z.array(
        z.looseObject({
          id: z.string(),
          state: z.enum(["running", "ended"]),
          started_at: z.string(),
          ended_at: z.string().nullable(),
          worker_name: z.string(),
          workspace_name: z.string(),
        }),
      ),
    ).safeParse(result.stdout.toString());
    expect(result.exitCode).toBe(0);
    expect(rows.success).toBe(true);
    if (!rows.success) return;
    expect(rows.data.find(({ id }) => id === "running")).toMatchObject({
      state: "running",
      started_at: runningAt,
      ended_at: null,
      worker_name: "agt_systemd-unit",
      workspace_name: "ws_fixture",
    });
    expect(rows.data.find(({ id }) => id === "ended")).toMatchObject({
      state: "ended",
      started_at: endedStartedAt,
      ended_at: endedAt,
    });
  });

  test("ignores unknown record fields and bounds human ls without changing JSON order", async () => {
    const root = await scratch("next-forward-fields-");
    const state = join(root, "state");
    mkdirSync(state, { recursive: true });
    const records: Record<string, unknown>[] = Array.from(
      { length: 32 },
      (_, index) => ({
        kind: "started",
        id: `run-${index}`,
        at: `2026-10-14T00:00:${String(index).padStart(2, "0")}Z`,
        ticket: `ticket-${index}`,
        writes: [],
        cwd: root,
        workspace: root,
        row: "fixture",
        dispatcher_session: null,
        vendor_session: null,
        pid: 0,
        ...(index === 0 ? { future_field: "ignored" } : {}),
      }),
    );
    const runIds = Array.from({ length: 32 }, (_, index) => `run-${index}`);
    records.splice(1, 0, {
      kind: "ended",
      id: "run-0",
      at: "2026-10-14T00:00:00Z",
      exit: 0,
      report_path: null,
      vendor_session: null,
      verify: [
        { cmd: "true", exit: 0, log_path: "verify.log", future_fact: true },
      ],
      future_field: "also ignored",
    });
    writeFileSync(
      join(state, "records.jsonl"),
      records.map((event) => JSON.stringify(event)).join("\n") + "\n",
    );
    const env = { ...process.env, AGX_NEXT_STATE_DIR: state };
    const human = Bun.spawnSync(
      [process.execPath, "tools/agx-worker/src/next/cli.ts", "ls"],
      { cwd: process.cwd(), env },
    );
    expect(human.exitCode).toBe(0);
    const humanLines = human.stdout.toString().trimEnd().split("\n");
    expect(humanLines).toHaveLength(31);
    expect(humanLines[0]).toStartWith("run-31 ");
    expect(humanLines[29]).toStartWith("run-2 ");
    expect(humanLines[30]).toBe("… 2 older (agx worker ls --all)");

    const all = Bun.spawnSync(
      [process.execPath, "tools/agx-worker/src/next/cli.ts", "ls", "--all"],
      { cwd: process.cwd(), env },
    );
    expect(all.exitCode).toBe(0);
    expect(all.stdout.toString().trimEnd().split("\n")).toHaveLength(32);

    const json = Bun.spawnSync(
      [process.execPath, "tools/agx-worker/src/next/cli.ts", "ls", "--json"],
      { cwd: process.cwd(), env },
    );
    expect(json.exitCode).toBe(0);
    const rows = jsonOf(z.array(z.looseObject({ id: z.string() }))).safeParse(
      json.stdout.toString(),
    );
    expect(rows.success).toBe(true);
    if (rows.success) {
      expect(rows.data.map(({ id }) => id)).toEqual(runIds);
      expect(rows.data).toHaveLength(32);
    }

    const malformed = { ...records[0], pid: "not-a-number" };
    writeFileSync(
      join(state, "records.jsonl"),
      `${JSON.stringify(malformed)}\n`,
    );
    const refused = Bun.spawnSync(
      [process.execPath, "tools/agx-worker/src/next/cli.ts", "ls"],
      { cwd: process.cwd(), env },
    );
    expect(refused.exitCode).toBe(1);
    expect(refused.stderr.toString()).toContain("invalid record log line");
  });
});
