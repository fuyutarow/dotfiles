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
function inheritedEnv() {
  const env = { ...process.env };
  Reflect.deleteProperty(env, "AGX_NEXT_STATE_DIR");
  return env;
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

const overlapStartedRecord = (
  id: string,
  workspace: string,
  ticketPath: string,
) =>
  JSON.stringify({
    kind: "started",
    id,
    at: "2026-10-19T01:00:00Z",
    ticket: id,
    ticket_path: ticketPath,
    writes: ["src/**"],
    cwd: workspace,
    workspace,
    row: "terra-high",
    dispatcher_session: null,
    vendor_session: null,
    pid: process.pid,
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
    ...inheritedEnv(),
    PATH: `${bin}:${process.env.PATH}`,
    AGX_STATE_DIR: state,
    AGX_CONFIG: new URL("../../src/roster/policy.example.toml", import.meta.url)
      .pathname,
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

test("check warns only about overlapping runs whose ticket or workspace shares the ticket repository", async () => {
  const root = await mkdtemp(join(tmpdir(), "agx-overlap-scope-"));
  const unrelated = await mkdtemp(join(tmpdir(), "agx-overlap-unrelated-"));
  roots.push(root, unrelated);
  await prepareTicketRepo(root, ".agents/tickets");
  await prepareTicketRepo(unrelated, ".agents/tickets");
  const ticketHome = join(root, ".agents/tickets");
  const unrelatedTicketHome = join(unrelated, ".agents/tickets");
  await mkdir(ticketHome, { recursive: true });
  await mkdir(unrelatedTicketHome, { recursive: true });
  const ticket = join(ticketHome, "current.md");
  await writeFile(
    ticket,
    `+++\nschema = 2\nname = "current"\nwrites = ["src/**"]\noutcome = "checked"\n[proposition]\nid = "SCOPE"\nclaim = "only same-repository overlap is warned"\nrefuted_by = "an unrelated overlap warning"\n+++\n`,
  );
  const state = join(root, "state");
  await mkdir(state);
  await mkdir(join(root, "secondary"));
  await writeFile(
    join(state, "records.jsonl"),
    `${overlapStartedRecord("same-repository", join(root, "secondary"), ticket)}\n${overlapStartedRecord("unrelated", unrelated, join(unrelatedTicketHome, "prior.md"))}\n`,
  );
  const env = {
    ...inheritedEnv(),
    AGX_STATE_DIR: state,
    AGX_CONFIG: new URL("../../src/roster/policy.example.toml", import.meta.url)
      .pathname,
  };
  const child = Bun.spawn(
    [
      process.execPath,
      resolve("tools/agx-worker/src/next/cli.ts"),
      "check",
      ticket,
      "--cd",
      root,
    ],
    { env, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 15000 },
  );
  const [exit, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(exit, stderr).toBe(0);
  expect(stdout).toContain("OK ticket=current");
  expect(stderr).toContain("WARN overlap run=same-repository");
  expect(stderr).not.toContain("WARN overlap run=unrelated");
}, 30000);

test("inspection deadlines stay operational across VCS, mise and premise reads", async () => {
  const { treeRead } = await import("../../src/next/ticket-home.ts");
  const { verificationEnvironment } = await import("../../src/next/verify.ts");
  const { checkPremises } = await import("../../src/premises.ts");
  const { InspectionTimeout } =
    await import("../../../shared/src/agx-config.ts");
  const root = await mkdtemp(join(tmpdir(), "agx-inspection-timeout-"));
  roots.push(root);
  const argv = [process.execPath, "-e", "await Bun.sleep(5000)"];
  const tree = await treeRead(argv, root, 20);
  expect(tree.exit).toBe(75);
  expect(tree.err).toContain("TREE_READ_TIMEOUT_MS=20ms");
  const bin = join(root, "bin");
  await mkdir(bin);
  const mise = join(bin, "mise");
  await writeFile(mise, "#!/usr/bin/env bun\nawait Bun.sleep(5000);\n", {
    mode: 0o755,
  });
  const environment = verificationEnvironment(
    root,
    { ...inheritedEnv(), PATH: `${bin}:${process.env.PATH}` },
    {},
    undefined,
    20,
  );
  expect(environment).toBeInstanceOf(InspectionTimeout);
  if (environment instanceof InspectionTimeout)
    expect(environment.message).toContain("MISE_ENV_TIMEOUT_MS=20ms");
  let premiseTimeout: string | undefined;
  checkPremises(["task:fixture"], root, {
    budgetMs: 20,
    runner: () => ({ exitCode: null, output: "" }),
    onTimeout: (args, cwd, budget) => {
      premiseTimeout = new InspectionTimeout(
        "PREFLIGHT_PREMISE_BUDGET_MS",
        budget,
        args,
        cwd,
      ).message;
    },
  });
  expect(premiseTimeout).toContain(
    'PREFLIGHT_PREMISE_BUDGET_MS=20ms; command=["mise","tasks","--json"]',
  );
});

test("check and run preserve operational environment failure as exit 75 without run artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "agx-temporary-preflight-"));
  roots.push(root);
  await prepareTicketRepo(root);
  const ticket = join(root, "ticket.md");
  await writeFile(
    ticket,
    '+++\nschema = 2\nname = "temporary"\noutcome = "fixture"\n[proposition]\nid = "TEMP"\nclaim = "fixture"\nrefuted_by = "fixture"\n+++\n',
  );
  const bin = join(root, "bin");
  const state = join(root, "state");
  await mkdir(bin);
  await mkdir(state);
  await writeFile(
    join(bin, "mise"),
    `#!/usr/bin/env bun
console.error('inspection timeout MISE_ENV_TIMEOUT_MS=60000ms; command=["mise","env","--json"]; cwd=${root}');
process.exit(75);
`,
    { mode: 0o755 },
  );
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
      {
        env: {
          ...inheritedEnv(),
          PATH: `${bin}:${process.env.PATH}`,
          AGX_STATE_DIR: state,
          AGX_CONFIG: new URL(
            "../../src/roster/policy.example.toml",
            import.meta.url,
          ).pathname,
        },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 15_000,
      },
    );
    const [code, err] = await Promise.all([
      child.exited,
      new Response(child.stderr).text(),
    ]);
    expect(code, err).toBe(75);
    expect(err).toContain("MISE_ENV_TIMEOUT_MS=60000ms");
    expect(err.trim().split("\n")).toHaveLength(1);
    expect(err).not.toContain("preflight failed");
    expect(await readdir(state)).not.toContain("runs");
  }
}, 30_000);
