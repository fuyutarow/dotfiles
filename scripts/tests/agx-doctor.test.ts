import { afterAll, expect, setDefaultTimeout, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import * as fs from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { jsonOf, z } from "../../tools/shared/src/zod.ts";

import { DoctorRecord } from "../../tools/shared/src/doctor-record.ts";

setDefaultTimeout(30_000);

const ENTRY = join(import.meta.dir, "../agx-doctor.ts");
const TICKET_CLI = join(import.meta.dir, "../../tools/agx-ticket/src/tkt.ts");
const REAL_JJ = Bun.which("jj")!;
const scratch = mkdtempSync(join(tmpdir(), "agx-doctor-test-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const ticketText = (name: string) =>
  `+++\nschema = 2\nname = "${name}"\noutcome = "${name}"\nwrites = []\nverify = []\n\n[proposition]\nid = "${name}"\nclaim = "claim"\nrefuted_by = "refuted"\n+++\n\n# ${name}\n`;

async function run(args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const child = Bun.spawn(args, {
    cwd,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  // Validate the public JSONL shape before comparing the existing inventory oracle.
  const legacy = stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const record = jsonOf(DoctorRecord).safeParse(line);
      if (!record.success) return line; // --json snapshot and other CLI output
      return [
        record.data.tool,
        dirname(record.data.object),
        basename(record.data.object),
        record.data.finding,
        record.data.remedy,
      ].join("\t");
    })
    .join("\n");
  return { stdout: legacy === "" ? "" : legacy + "\n", stderr, exitCode };
}

async function jjOperations(
  repo: string,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const result = await run(
    [
      "jj",
      "op",
      "log",
      "--ignore-working-copy",
      "--no-graph",
      "-T",
      'self.id().short(12) ++ "\\n"',
    ],
    repo,
    env,
  );
  expect(result.exitCode, result.stderr).toBe(0);
  return result.stdout;
}

async function fixture(name: string) {
  const root = join(scratch, name);
  const home = join(root, "home");
  const workspace = join(home, "Workspace");
  const dotfiles = join(workspace, "dotfiles");
  const repo = join(workspace, "consumer");
  const tickets = join(root, "tickets");
  const bin = join(root, "bin");
  const state = join(root, "agx-state");
  const cache = join(root, "bun-cache");
  const ticketRecords = join(root, "ticket-records.json");
  for (const path of [dotfiles, repo, tickets, bin, state, cache])
    mkdirSync(path, { recursive: true });
  const env: NodeJS.ProcessEnv = {
    // Each fixture owns its dispatch configuration, including state isolation.
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("AGX_")),
    ),
    HOME: home,
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    JJ_CONFIG: "",
    JJ_USER: "Fixture",
    JJ_EMAIL: "fixture@example.test",
    AGX_REPOS_ROOT: workspace,
    XDG_STATE_HOME: join(home, "state"),
    AGX_STATE_DIR: state,
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: cache,
    DOCTOR_TICKET_RECORDS: ticketRecords,
    DOCTOR_CALLS: join(root, "doctor-calls"),
  };
  for (const path of [dotfiles, repo]) {
    expect((await run(["jj", "git", "init", path], root, env)).exitCode).toBe(
      0,
    );
    writeFileSync(join(path, "base.txt"), "base\n");
    writeFileSync(
      join(path, ".ws.toml"),
      'trunk = "main"\nkeep = ["ws_kept"]\n',
    );
    writeFileSync(join(path, ".agx.toml"), 'tickets = "' + tickets + '"\n');
    expect(
      (await run(["jj", "file", "track", "base.txt"], path, env)).exitCode,
    ).toBe(0);
    expect(
      (await run(["jj", "commit", "-m", "base"], path, env)).exitCode,
    ).toBe(0);
    expect(
      (await run(["jj", "bookmark", "create", "main", "-r", "@-"], path, env))
        .exitCode,
    ).toBe(0);
  }
  for (const [binName, source] of [
    ["agx-worker", "agx-worker/src/next/cli.ts"],
    ["agx-ws", "agx-ws/src/ws.ts"],
    ["agx-ticket", "agx-ticket/src/tkt.ts"],
  ]) {
    await fs.symlink(
      join(import.meta.dir, "../../tools", source!),
      join(bin, binName!),
    );
  }
  const fakeAgx = join(bin, "agx");
  writeFileSync(
    fakeAgx,
    `#!/bin/sh\nprintf '%s\\n' "$*" >> "$DOCTOR_CALLS"\ncat "$DOCTOR_TICKET_RECORDS"\n`,
  );
  chmodSync(fakeAgx, 0o755);
  writeFileSync(ticketRecords, "[]\n");
  return {
    root,
    home,
    dotfiles,
    workspace,
    repo,
    tickets,
    state,
    env,
    cache,
    ticketRecords,
  };
}

test("agx worker doctor clean fixture is silent on stdout and exits zero", async () => {
  const f = await fixture("clean");
  const before = await Promise.all([
    jjOperations(f.dotfiles, f.env),
    jjOperations(f.repo, f.env),
  ]);
  const result = await run([process.execPath, ENTRY], f.dotfiles, f.env);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("agx worker doctor: 0 finding(s)\n");
  // Ticket doctor reads global history once across both repositories.
  expect(
    (await Bun.file(f.env.DOCTOR_CALLS!).text())
      .trim()
      .split("\n")
      .filter((line) => line === "worker ls --json --all"),
  ).toEqual(["worker ls --json --all"]);
  expect(await Bun.file(join(f.state, "records.jsonl")).exists()).toBe(false);
  expect(
    await Promise.all([
      jjOperations(f.dotfiles, f.env),
      jjOperations(f.repo, f.env),
    ]),
  ).toEqual(before);
}, 30_000);

test("agx worker doctor folds the run, workspace, and ticket owners with exact findings", async () => {
  const f = await fixture("findings");
  const events = [
    {
      kind: "started",
      id: "orphan",
      at: "2026-10-12T00:00:00Z",
      ticket: "orphan",
      writes: [],
      cwd: f.repo,
      workspace: f.repo,
      row: "fixture",
      dispatcher_session: null,
      vendor_session: null,
      pid: 987654321,
      lease: { pid: 987654321, start: null, unit: null },
    },
    {
      kind: "started",
      id: "lost",
      at: "2026-10-14T00:00:00Z",
      ticket: "lost",
      writes: [],
      cwd: f.repo,
      workspace: f.repo,
      row: "fixture",
      dispatcher_session: null,
      vendor_session: null,
      pid: process.pid,
      lease: { pid: process.pid, start: null, unit: null },
    },
    {
      kind: "ended",
      id: "lost",
      at: "2026-10-14T00:01:00Z",
      exit: 1,
      outcome: "lost",
      report_path: null,
      vendor_session: null,
      verify: [],
      returned: false,
    },
    {
      kind: "started",
      id: "no-return",
      at: "2026-10-14T00:00:00Z",
      ticket: "no-return",
      writes: [],
      cwd: f.repo,
      workspace: f.repo,
      row: "fixture",
      dispatcher_session: null,
      vendor_session: null,
      pid: process.pid,
      lease: { pid: process.pid, start: null, unit: null },
    },
    {
      kind: "ended",
      id: "no-return",
      at: "2026-10-14T00:01:00Z",
      exit: 0,
      outcome: "ok",
      report_path: null,
      vendor_session: null,
      verify: [],
    },
    {
      kind: "started",
      id: "unjudged",
      at: "2026-10-14T00:00:00Z",
      ticket: "unjudged",
      writes: [],
      cwd: f.repo,
      workspace: f.repo,
      row: "fixture",
      dispatcher_session: null,
      vendor_session: null,
      pid: process.pid,
      lease: { pid: process.pid, start: null, unit: null },
    },
    {
      kind: "ended",
      id: "unjudged",
      at: "2026-10-14T00:01:00Z",
      exit: 0,
      outcome: "ok",
      report_path: null,
      vendor_session: null,
      verify: [],
      returned: true,
    },
  ];
  writeFileSync(
    join(f.state, "records.jsonl"),
    events.map((event) => JSON.stringify(event)).join("\n") + "\n",
  );

  const legacy = join(f.repo, "..", "consumer-ws-legacy");
  const landed = join(f.repo, "..", "consumer.ws", "ws_landed");
  const kept = join(f.repo, "..", "consumer.ws", "ws_kept");
  const old = join(f.repo, "..", "consumer.ws", "ws_old");
  const stale = join(f.repo, "..", "consumer.ws", "ws_stale");
  for (const path of [
    dirname(legacy),
    dirname(landed),
    dirname(kept),
    dirname(old),
    dirname(stale),
  ])
    mkdirSync(path, { recursive: true });
  expect(
    (
      await run(
        ["jj", "workspace", "add", "--name", "legacy", legacy],
        f.repo,
        f.env,
      )
    ).exitCode,
  ).toBe(0);
  expect(
    (
      await run(
        ["jj", "workspace", "add", "--name", "ws_landed", "-r", "main", landed],
        f.repo,
        f.env,
      )
    ).exitCode,
  ).toBe(0);
  expect((await run(["jj", "edit", "main"], landed, f.env)).exitCode).toBe(0);
  expect(
    (
      await run(
        ["jj", "workspace", "add", "--name", "ws_kept", kept],
        f.repo,
        f.env,
      )
    ).exitCode,
  ).toBe(0);
  expect(
    (
      await run(
        ["jj", "workspace", "add", "--name", "ws_stale", "-r", "main", stale],
        f.repo,
        f.env,
      )
    ).exitCode,
  ).toBe(0);
  expect(
    (
      await run(
        ["jj", "workspace", "add", "--name", "ws_old", old],
        f.repo,
        f.env,
      )
    ).exitCode,
  ).toBe(0);
  writeFileSync(join(old, "base.txt"), "unfinished\n");
  expect(
    (await run(["jj", "commit", "-m", "unfinished"], old, f.env)).exitCode,
  ).toBe(0);
  const oldTip = await run(
    [
      "jj",
      "log",
      "--no-graph",
      "--ignore-working-copy",
      "-r",
      "(::ws_old@ ~ ::main) ~ empty()",
      "-T",
      'commit_id.short(12) ++ "\\n"',
    ],
    old,
    f.env,
  );
  expect(oldTip.exitCode, oldTip.stderr).toBe(0);
  expect(oldTip.stdout.trim()).not.toBe("");
  const oldDate =
    Temporal.Now.instant().subtract({ hours: 80 }).epochMilliseconds / 1000;
  utimesSync(old, oldDate, oldDate);
  const jjShim = join(f.root, "bin", "jj");
  writeFileSync(
    jjShim,
    `#!/bin/sh\nif [ "$PWD" = "$DOCTOR_STALE_PATH" ] && [ "$*" = "--no-pager --color=never --ignore-working-copy status" ]; then echo 'working copy is stale' >&2; exit 1; fi\nexec "$DOCTOR_REAL_JJ" "$@"\n`,
  );
  chmodSync(jjShim, 0o755);
  f.env.DOCTOR_STALE_PATH = stale;
  f.env.DOCTOR_REAL_JJ = REAL_JJ;

  writeFileSync(join(f.tickets, "accepted.md"), ticketText("accepted"));
  writeFileSync(join(f.repo, "stray.md"), ticketText("stray"));
  writeFileSync(
    f.ticketRecords,
    JSON.stringify([
      {
        id: "accepted-run",
        ticket: "accepted",
        started_at: "2026-10-16T00:00:00Z",
        state: "ended",
        judgment: { decision: "accept" },
        cwd: f.repo,
        workspace: f.repo,
        workspace_name: "default",
      },
    ]),
  );

  const before = await Bun.file(f.ticketRecords).text();
  const operationsBefore = await Promise.all([
    jjOperations(f.dotfiles, f.env),
    jjOperations(f.repo, f.env),
  ]);
  const result = await run([process.execPath, ENTRY], f.dotfiles, f.env);
  expect(result.exitCode, result.stderr).toBe(1);
  expect(result.stdout.trim().split("\n").toSorted()).toEqual(
    [
      `agx-worker\t${f.repo}\torphan\torphaned\tagx worker judge orphan accept|reject`,
      `agx-worker\t${f.repo}\tlost\tunjudged\tagx worker judge lost accept|reject`,
      `agx-worker\t${f.repo}\tunjudged\tunjudged\tagx worker judge unjudged accept|reject`,
      `agx-ws\t${f.repo}\tws_landed\tcollectable\tagx ws gc --include-unrecorded --repo ${f.repo}`,
      `agx-ws\t${f.repo}\tws_old\tunlanded-72h\tcd ${old} && mise run land`,
      `agx-ws\t${f.repo}\tws_stale\tstale\tagx ws refresh stale --repo ${f.repo}`,
      `agx-ticket\t${f.repo}\taccepted\taccepted-landed-present\tagx ticket gc --repo ${f.repo}`,
      `agx-ticket\t${f.repo}\tstray\toutside-home\tmv ${join(f.repo, "stray.md")} ${f.tickets}/`,
    ].toSorted(),
  );
  // The unattended collector handles empty legacy workspaces; doctor reports only
  // workspaces requiring attention, so the legacy fixture must stay silent.
  expect(result.stdout).not.toContain(`\tlegacy\t`);
  expect(result.stderr).toBe("agx worker doctor: 8 finding(s)\n");
  const summary = await run([process.execPath, ENTRY, "--json"], f.dotfiles, {
    ...f.env,
    AGX_DISPATCHER_SESSION: "",
    CLAUDE_CODE_SESSION_ID: "",
  });
  expect(summary.exitCode, summary.stderr).toBe(1);
  const machine = jsonOf(
    z.object({
      kinds: z.record(z.string(), z.number()),
      capturedAt: z.number(),
      lost: z.number(),
      complete: z.boolean(),
    }),
  ).safeParse(summary.stdout);
  expect(machine.success).toBe(true);
  expect(await Bun.file(join(f.state, "doctor.json")).text()).toBe(
    summary.stdout.trim(),
  );
  if (machine.success) {
    expect(machine.data.capturedAt).toBeGreaterThan(0);
    expect(machine.data.complete).toBe(true);
    expect(machine.data.lost).toBe(1);
    expect(machine.data.kinds).toEqual({
      orphaned: 1,
      unjudged: 2,
      collectable: 1,
      "unlanded-72h": 1,
      stale: 1,
      "accepted-landed-present": 1,
      "outside-home": 1,
    });
  }
  expect(await Bun.file(f.ticketRecords).text()).toBe(before);
  expect(await Bun.file(join(f.repo, "stray.md")).exists()).toBe(true);
  expect(await Bun.file(join(f.tickets, "accepted.md")).exists()).toBe(true);
  expect(await Bun.file(join(f.state, "records.jsonl")).text()).toContain(
    '"id":"orphan"',
  );
  expect(
    await Promise.all([
      jjOperations(f.dotfiles, f.env),
      jjOperations(f.repo, f.env),
    ]),
  ).toEqual(operationsBefore);
  const ticketDoctor = await run(
    [process.execPath, TICKET_CLI, "doctor"],
    f.dotfiles,
    f.env,
  );
  expect(ticketDoctor.exitCode).toBe(1);
  expect(ticketDoctor.stdout.trim().split("\n").toSorted()).toEqual(
    [
      `agx-ticket\t${f.repo}\taccepted\taccepted-landed-present\tagx ticket gc --repo ${f.repo}`,
      `agx-ticket\t${f.repo}\tstray\toutside-home\tmv ${join(f.repo, "stray.md")} ${f.tickets}/`,
    ].toSorted(),
  );
  expect(ticketDoctor.stderr).toBe("agx-ticket doctor: 2 finding(s)\n");
}, 30_000);

test("outside-home ignores 199 finished historical paths, but retains active, unjudged, and existing stray tickets", async () => {
  const f = await fixture("actionable-outside-home");
  const record = (id: string, extra: object = {}) => ({
    id,
    ticket: id,
    started_at: "2026-10-16T00:00:00Z",
    state: "ended",
    judgment: { decision: "accept" },
    cwd: f.repo,
    workspace: f.repo,
    ticket_path: join(f.root, id + ".md"),
    ...extra,
  });
  writeFileSync(
    f.ticketRecords,
    JSON.stringify([
      ...Array.from({ length: 199 }, (_, i) => record("historical-" + i)),
      record("active", { state: "running", judgment: null }),
      record("unjudged", { judgment: null }),
      record("other-home", {
        state: "running",
        judgment: null,
        ticket_path: join(f.dotfiles, ".agents/tickets/valid.md"),
      }),
    ]),
  );
  writeFileSync(join(f.repo, "still-present.md"), ticketText("still-present"));
  const result = await runTicketDoctor(f.dotfiles, f.env);
  expect(result.exitCode, result.stderr).toBe(1);
  expect(result.stdout).not.toContain("historical-");
  expect(result.stdout).not.toContain("other-home");
  expect(
    result.stdout
      .trim()
      .split("\n")
      .map((line) => line.split("\t")[2])
      .toSorted((a, b) => (a ?? "").localeCompare(b ?? "")),
  ).toEqual(["active", "still-present", "unjudged"]);
}, 15_000);
async function runTicketDoctor(cwd: string, env: NodeJS.ProcessEnv) {
  return run([process.execPath, TICKET_CLI, "doctor"], cwd, env);
}

test("outside-home scanning ignores symlink files and symlink directories", async () => {
  const f = await fixture("scan-symlinks");
  const external = join(f.root, "external");
  await fs.mkdir(external);
  await fs.writeFile(join(external, "hidden.md"), ticketText("hidden"));
  await fs.symlink(external, join(f.repo, "external"));
  await fs.symlink(join(external, "hidden.md"), join(f.repo, "alias.md"));
  const result = await runTicketDoctor(f.dotfiles, f.env);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.stdout).toBe("");
});

test("header scan retains hidden, ignored, CRLF and spaced paths, but excludes dependency trees", async () => {
  const f = await fixture("scan-headers");
  await fs.mkdir(join(f.repo, ".hidden"));
  await fs.mkdir(join(f.repo, "node_modules"));
  await fs.mkdir(join(f.repo, ".ws"));
  await fs.writeFile(join(f.repo, ".gitignore"), "*.md\n");
  await fs.writeFile(
    join(f.repo, ".hidden/crlf.md"),
    ticketText("crlf").replaceAll("\n", "\r\n"),
  );
  await fs.writeFile(join(f.repo, "with space.md"), ticketText("with-space"));
  await fs.writeFile(
    join(f.repo, "node_modules/excluded.md"),
    ticketText("excluded"),
  );
  await fs.writeFile(join(f.repo, ".ws/excluded.md"), ticketText("excluded"));
  await fs.writeFile(
    join(f.repo, "documentation.md"),
    "# Documentation\n" + ticketText("not-a-ticket"),
  );
  const result = await runTicketDoctor(f.dotfiles, f.env);
  expect(result.exitCode, result.stderr).toBe(1);
  expect(
    result.stdout
      .trim()
      .split("\n")
      .map((line) => line.split("\t")[2])
      .toSorted((a, b) => (a ?? "").localeCompare(b ?? "")),
  ).toEqual(["crlf", "with space"]);
});

test("invalid run history remains a failure and cannot publish a complete snapshot", async () => {
  const f = await fixture("history-failure");
  await fs.writeFile(f.ticketRecords, "invalid history");
  const result = await run(
    [process.execPath, ENTRY, "--json"],
    f.dotfiles,
    f.env,
  );
  expect(result.exitCode).toBe(2);
  expect(result.stderr).toContain("invalid agx worker ls --json");
  expect(result.stdout).toContain('"complete":false');
  expect(await Bun.file(join(f.state, "doctor.json")).text()).toContain(
    '"complete":false',
  );
});

test("forgotten accepted workspaces need one inventory, not a jj log per ticket", async () => {
  const f = await fixture("forgotten-workspaces");
  const records = Array.from({ length: 30 }, (_, i) => ({
    id: `gone-${i}`,
    ticket: `gone-${i}`,
    started_at: "2026-10-16T00:00:00Z",
    state: "ended",
    judgment: { decision: "accept" },
    cwd: f.repo,
    workspace: join(f.root, `forgotten-${i}`),
    workspace_name: `forgotten-${i}`,
  }));
  for (const record of records)
    await fs.writeFile(
      join(f.tickets, record.ticket + ".md"),
      ticketText(record.ticket),
    );
  await fs.writeFile(f.ticketRecords, JSON.stringify(records));
  const calls = join(f.root, "jj-calls");
  const shim = join(f.root, "bin/jj");
  await fs.writeFile(
    shim,
    `#!${process.execPath}
import { appendFile } from "node:fs/promises";
const args = process.argv.slice(2);
if (args.includes("workspace") || args.includes("log")) await appendFile(${JSON.stringify(calls)}, JSON.stringify(args) + "\\n");
const child = Bun.spawn([${JSON.stringify(REAL_JJ)}, ...args], {stdin:"inherit", stdout:"inherit", stderr:"inherit"});
process.exitCode = await child.exited;
`,
  );
  await fs.chmod(shim, 0o755);
  const result = await runTicketDoctor(f.dotfiles, f.env);
  expect(result.exitCode, result.stderr).toBe(0);
  const commands = (await Bun.file(calls).text()).trim().split("\n");
  expect(commands.filter((line) => line.includes('"log"'))).toHaveLength(0);
  expect(
    commands.filter((line) => line.includes('"workspace","list"')),
  ).toHaveLength(1);
  expect((await Bun.file(f.env.DOCTOR_CALLS!).text()).trim()).toBe(
    "worker ls --json --all",
  );
});

const endedRecord = (id: string, extra: object = {}) => ({
  kind: "ended",
  id,
  at: Temporal.Now.instant().toString(),
  exit: 0,
  outcome: "ok",
  report_path: null,
  vendor_session: null,
  verify: [],
  ...extra,
});

test("doctor reports only current actionable runs and keeps history in ls --all", async () => {
  const f = await fixture("current-runs");
  const started = (id: string, extra: object = {}) => ({
    kind: "started",
    id,
    at: "2026-10-12T00:00:00Z",
    ticket: id,
    writes: [],
    cwd: f.repo,
    workspace: f.repo,
    row: "fixture",
    dispatcher_session: null,
    vendor_session: null,
    pid: process.pid,
    lease: { pid: process.pid, start: null, unit: null },
    ...extra,
  });
  const rows = [
    started("legacy-imported", { lease: undefined, legacy_key: "run:old" }),
    endedRecord("legacy-imported", { legacy_key: "run-ended:old" }),
    started("pre-contract"),
    endedRecord("pre-contract"),
    started("judged"),
    endedRecord("judged", { returned: false }),
    {
      kind: "judged",
      id: "judged",
      at: "2026-10-17T00:00:00Z",
      decision: "accept",
      note: "done",
    },
    started("orphaned", {
      lease: { pid: 2147483647, start: null, unit: null },
      pid: 2147483647,
    }),
    started("unjudged"),
    endedRecord("unjudged", { returned: false }),
    started("live", { ticket_path: join(f.root, "live.md") }),
  ];
  await Bun.write(
    join(f.state, "records.jsonl"),
    rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
  );
  await Bun.write(
    f.ticketRecords,
    JSON.stringify([
      {
        id: "live",
        ticket: "live",
        started_at: "2026-10-17T00:00:00Z",
        state: "running",
        judgment: null,
        cwd: f.repo,
        workspace: f.repo,
        ticket_path: join(f.root, "live.md"),
      },
    ]),
  );
  const result = await run([process.execPath, ENTRY], f.dotfiles, f.env);
  expect(result.exitCode, result.stderr).toBe(1);
  expect(result.stdout.trim().split("\n").toSorted()).toEqual(
    [
      [
        "agx-worker",
        f.repo,
        "orphaned",
        "orphaned",
        "agx worker judge orphaned accept|reject",
      ].join("\t"),
      [
        "agx-worker",
        f.repo,
        "unjudged",
        "unjudged",
        "agx worker judge unjudged accept|reject",
      ].join("\t"),
      [
        "agx-ticket",
        f.repo,
        "live",
        "outside-home",
        `mv ${join(f.root, "live.md")} ${f.tickets}/`,
      ].join("\t"),
    ].toSorted(),
  );
  const history = await run(
    [
      process.execPath,
      join(import.meta.dir, "../../tools/agx-worker/src/next/cli.ts"),
      "ls",
      "--all",
      "--json",
    ],
    f.dotfiles,
    f.env,
  );
  expect(history.exitCode, history.stderr).toBe(0);
  for (const id of ["legacy-imported", "pre-contract", "judged"])
    expect(history.stdout).toContain(`"id":"${id}"`);
});

const doctorOwners = [
  ["agx-worker", "agx-worker/src/next/cli.ts"],
  ["agx-ws", "agx-ws/src/ws.ts"],
  ["agx-ticket", "agx-ticket/src/tkt.ts"],
] as const;

for (const [tool, source] of doctorOwners) {
  const entry = join(import.meta.dir, "../../tools", source);
  test(`${tool} doctor --quiet suppresses only the summary and is documented`, async () => {
    const f = await fixture(`quiet-${tool}`);
    const normal = await run(
      [process.execPath, entry, "doctor"],
      f.dotfiles,
      f.env,
    );
    const quiet = await run(
      [process.execPath, entry, "doctor", "--quiet"],
      f.dotfiles,
      f.env,
    );
    expect(normal.exitCode, normal.stderr).toBe(0);
    expect(normal.stderr).toContain("0 finding(s)");
    expect(quiet.exitCode, quiet.stderr).toBe(normal.exitCode);
    expect(quiet.stdout).toBe(normal.stdout);
    expect(quiet.stderr).toBe("");
    const help = await run(
      [process.execPath, entry, "doctor", "--help"],
      f.dotfiles,
      f.env,
    );
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("--quiet");
  });

  test.each(["1", "0", ""])(
    `${tool} doctor rejects retired quiet environment value %j`,
    async (value) => {
      const result = await run(
        [process.execPath, entry, "doctor", "--quiet"],
        scratch,
        {
          ...process.env,
          AGX_DOCTOR_QUIET: value,
        },
      );
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr.trim().split("\n")).toHaveLength(1);
      expect(result.stderr).toContain("AGX_DOCTOR_QUIET");
      expect(result.stderr).toContain("--quiet");
    },
  );
}

test("composed doctor rejects the retired environment variable with one diagnostic", async () => {
  const result = await run([process.execPath, ENTRY], scratch, {
    ...process.env,
    AGX_DOCTOR_QUIET: "1",
  });
  expect(result.exitCode).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr.trim().split("\n")).toHaveLength(1);
  expect(result.stderr).toContain("--quiet");
});
