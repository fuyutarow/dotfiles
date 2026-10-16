import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { jsonOf, z } from "../../../shared/src/zod.ts";
import { parseNextTicket } from "../../src/next/ticket.ts";
import { ticketContext, treeRead } from "../../src/next/ticket-home.ts";
import { prepareTicketRepo } from "../ticket-repo.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
const CLI = resolve("tools/agx-run/src/next/cli.ts");
const text = (extra = "") =>
  `+++\nschema = 2\nname = "home"\noutcome = "recover ticket"\n${extra}\n[proposition]\nid = "HOME"\nclaim = "ticket is recoverable"\nrefuted_by = "bytes differ"\n+++\n原本\r\n`;
async function fixture(home = "tickets") {
  const root = await mkdtemp(join(tmpdir(), "agx-ticket-home-"));
  roots.push(root);
  await prepareTicketRepo(root, home);
  const directory = resolve(root, home);
  await mkdir(directory, { recursive: true });
  const ticket = join(directory, "home.md");
  await writeFile(ticket, text());
  const env = {
    ...process.env,
    AGX_NEXT_STATE_DIR: join(root, "state"),
    DISPATCH_ROSTER_PATH: resolve("agents/models/dispatch-roster.toml"),
  };
  const invoke = async (args: string[]) => {
    const child = Bun.spawn([process.execPath, CLI, ...args, "--cd", root], {
      env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: 15000,
    });
    const [exit, out, err] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { exit, out, err };
  };
  return { root, directory, ticket, env, invoke };
}

test("check refuses an undeclared /tmp ticket with refused, declared home and tkt new", async () => {
  const f = await fixture();
  const stray = join(f.root, "stray.md");
  await writeFile(stray, text());
  const result = await f.invoke(["check", stray]);
  expect(result.exit).toBe(2);
  expect(result.err).toMatch(/^agx: refused ticket path/u);
  expect(result.err).toContain(f.directory);
  expect(result.err).toContain("tkt new");
  expect(
    await Bun.file(join(f.env.AGX_NEXT_STATE_DIR, "records.jsonl")).exists(),
  ).toBe(false);
});

test("check accepts an absolute home declared on the repository trunk", async () => {
  const parent = await mkdtemp(join(tmpdir(), "agx-ticket-home-trunk-"));
  roots.push(parent);
  const root = join(parent, "repo");
  const directory = join(parent, "tickets");
  await mkdir(root, { recursive: true });
  await mkdir(directory, { recursive: true });
  const env = {
    ...process.env,
    JJ_CONFIG: "",
    JJ_USER: "Fixture",
    JJ_EMAIL: "fixture@example.invalid",
    AGX_NEXT_STATE_DIR: join(parent, "state"),
    DISPATCH_ROSTER_PATH: resolve("agents/models/dispatch-roster.toml"),
  };
  const jj = async (args: string[]) => {
    const child = Bun.spawn(["jj", ...args], {
      cwd: root,
      env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: 5000,
    });
    const [exit, out, err] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exit, err).toBe(0);
    return out.trim();
  };
  await jj(["git", "init", "."]);
  await jj([
    "config",
    "set",
    "--repo",
    'revset-aliases."trunk()"',
    "bookmarks(alpha)",
  ]);
  await writeFile(
    join(root, ".agx.toml"),
    `tickets = ${JSON.stringify(directory)}\n`,
  );
  await jj(["bookmark", "create", "alpha", "-r", "@"]);
  await jj(["commit", "-m", "Declare absolute ticket home"]);
  const ticket = join(directory, "design_g5.md");
  await writeFile(ticket, text());
  const child = Bun.spawn(
    [process.execPath, CLI, "check", ticket, "--cd", root],
    {
      env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: 15000,
    },
  );
  const [exit, out, err] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(exit, `${out}\n${err}`).toBe(0);
});

test("committed relative and absolute homes and the default home are accepted, including /tmp", async () => {
  for (const home of ["tickets", ".agents/tickets"]) {
    const f = await fixture(home);
    expect((await f.invoke(["check", f.ticket])).exit).toBe(0);
  }
  const f = await fixture();
  await prepareTicketRepo(f.root, f.directory);
  expect((await f.invoke(["check", f.ticket])).exit).toBe(0);
  const defaultHome = join(f.root, ".agents/tickets");
  await mkdir(defaultHome, { recursive: true });
  await writeFile(join(defaultHome, "default.md"), text());
  expect(
    (await f.invoke(["check", join(defaultHome, "default.md")])).exit,
  ).toBe(0);
});

test("an uncommitted declaration and a symlink escaping the home cannot bypass placement", async () => {
  const f = await fixture();
  await writeFile(join(f.root, ".agx.toml"), 'tickets = "."\n');
  const stray = join(f.root, "stray.md");
  await writeFile(stray, text());
  expect((await f.invoke(["check", stray])).exit).toBe(2);
  await symlink(stray, join(f.directory, "alias.md"));
  expect((await f.invoke(["check", join(f.directory, "alias.md")])).exit).toBe(
    2,
  );
});

test("a jj tree uses its recorded working-copy commit and committed home without taking a snapshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "agx-ticket-home-jj-"));
  roots.push(root);
  const env = {
    ...process.env,
    JJ_CONFIG: "",
    JJ_USER: "Fixture",
    JJ_EMAIL: "fixture@example.invalid",
  };
  const command = async (args: string[]) => {
    const child = Bun.spawn(["jj", ...args], {
      cwd: root,
      env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: 5000,
    });
    const [exit, out, err] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exit, err).toBe(0);
    return out.trim();
  };
  await command(["git", "init", "."]);
  await command([
    "config",
    "set",
    "--repo",
    'revset-aliases."trunk()"',
    "bookmarks(alpha)",
  ]);
  await writeFile(join(root, ".agx.toml"), 'tickets = "declared"\n');
  await command(["commit", "-m", "Declare home"]);
  await command(["bookmark", "create", "alpha", "-r", "@-"]);
  const expected = await command([
    "log",
    "--ignore-working-copy",
    "--no-graph",
    "-r",
    "@",
    "-T",
    "commit_id",
  ]);
  await writeFile(join(root, ".agx.toml"), 'tickets = "dirty"\n');
  const before = await readdir(join(root, ".jj/repo/op_heads"));
  const ctx = await ticketContext(root);
  expect(ctx.ok).toBe(true);
  if (!ctx.ok) return;
  expect(ctx.home).toBe(join(root, "declared"));
  expect(ctx.base_rev).toBe(expected);
  expect(await ctx.revision("@-")).not.toBe(expected);
  expect(
    await command([
      "log",
      "--ignore-working-copy",
      "--no-graph",
      "-r",
      "@",
      "-T",
      "commit_id",
    ]),
  ).toBe(expected);
  expect(await readdir(join(root, ".jj/repo/op_heads"))).toEqual(before);
});

test("a repository without .agx.toml accepts its default home", async () => {
  const f = await fixture(".agents/tickets");
  await unlink(join(f.root, ".agx.toml"));
  // Remove the declaration from the disposable fixture's commit.
  for (const args of [
    ["rm", "--", ".agx.toml"],
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "-m",
      "Use default home",
    ],
  ]) {
    const child = Bun.spawn(["git", ...args], {
      cwd: f.root,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: 5000,
      env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
    });
    const [exit, , err] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exit, err).toBe(0);
  }
  expect((await f.invoke(["check", f.ticket])).exit).toBe(0);
  expect(
    (await treeRead(["git", "show", "HEAD:.agx.toml"], f.root)).exit,
  ).not.toBe(0);
});

test("base_rev mismatch names both ids before routing, artifacts or launch", async () => {
  const f = await fixture();
  const wrong = "f".repeat(40);
  await writeFile(f.ticket, text(`base_rev = "${wrong}"`));
  const result = await f.invoke(["run", f.ticket]);
  expect(result.exit).toBe(2);
  expect(result.err).toContain(wrong);
  const child = Bun.spawn(["git", "rev-parse", "HEAD"], {
    cwd: f.root,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 5000,
  });
  const [exit, head] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(exit).toBe(0);
  expect(result.err).toContain(head.trim());
  expect(
    await Bun.file(join(f.env.AGX_NEXT_STATE_DIR, "records.jsonl")).exists(),
  ).toBe(false);
});

test("conflicting sandbox and replacement declarations refuse before launch", async () => {
  const f = await fixture();
  await writeFile(f.ticket, text('sandbox = "read-only"'));
  const sandbox = await f.invoke(["run", f.ticket, "--sandbox", "none"]);
  expect(sandbox.exit).toBe(2);
  expect(sandbox.err).toContain("differs from ticket sandbox read-only");
  const replacement = await f.invoke([
    "run",
    f.ticket,
    "--supersedes",
    "unknown",
  ]);
  expect(replacement.exit).toBe(2);
  expect(replacement.err).toContain("unknown run unknown");
  await writeFile(f.ticket, text('supersedes = "previous"'));
  const mixed = await f.invoke(["run", f.ticket, "--continue", "previous"]);
  expect(mixed.exit).toBe(2);
  expect(mixed.err).toContain("mutually exclusive");
  expect(
    await Bun.file(join(f.env.AGX_NEXT_STATE_DIR, "records.jsonl")).exists(),
  ).toBe(false);
});

test("run preserves exact original bytes and hash, base and premise commits, replacement and continuation", async () => {
  const f = await fixture();
  await prepareTicketRepo(f.root, f.directory);
  const ctx = await ticketContext(f.root);
  expect(ctx.ok).toBe(true);
  if (!ctx.ok) return;
  const previousCommit = await ctx.revision("HEAD^");
  expect(previousCommit).not.toBeNull();
  const baseRev = ctx.base_rev;
  expect(baseRev).not.toBeNull();
  if (baseRev === null || previousCommit === null) return;
  const original = Buffer.concat([
    Buffer.from(
      text(
        'premises = ["file:.agx.toml", "rev:HEAD^"]\nresources = { cpu = 1, ram_gb = 1 }\nexternal_reads = ["/reference"]\nfirst_return_s = 60\nnetwork = "none"\nsandbox = "read-only"',
      ),
    ),
    Buffer.from([255, 0, 13, 10]),
  ]);
  await writeFile(f.ticket, original);
  const state = f.env.AGX_NEXT_STATE_DIR;
  await mkdir(state);
  await writeFile(
    join(state, "records.jsonl"),
    [
      {
        kind: "started",
        id: "previous",
        at: "2026-10-16T00:00:00Z",
        ticket: "home",
        writes: [],
        cwd: f.root,
        workspace: f.root,
        row: "terra-high",
        dispatcher_session: null,
        vendor_session: null,
        pid: 0,
      },
      {
        kind: "ended",
        id: "previous",
        at: "2026-10-16T00:01:00Z",
        exit: 0,
        report_path: null,
        vendor_session: "fixture-session",
        verify: [],
      },
    ]
      .map((row) => JSON.stringify(row))
      .join("\n") + "\n",
  );
  const worker = join(f.root, "worker.ts");
  await writeFile(
    worker,
    'console.log(JSON.stringify({exit:0, vendor_session:"next-session", report:{summary:"done",changes:[],checks:[],for_coordinator:[],open:[]}}));\n',
  );
  const invoke = async (args: string[]) => {
    const child = Bun.spawn(
      [process.execPath, CLI, "run", f.ticket, "--cd", f.root, ...args],
      {
        env: {
          ...f.env,
          AGX_NEXT_WORKER: worker,
          AGX_TMP_ROOT: join(f.root, "tmp"),
          AGX_NEXT_JEV_URL: "http://127.0.0.1:1/choice",
        },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        timeout: 15000,
      },
    );
    const [exit, out, err] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exit, err).toBe(0);
    return out;
  };
  await invoke(["--continue", "previous"]);
  await invoke(["--supersedes", "previous"]);
  const events = (await readFile(join(state, "records.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .flatMap((line) => {
      const parsed = jsonOf(
        z.looseObject({
          kind: z.literal("started"),
          id: z.string(),
          base_rev: z.string(),
          premise_commits: z.array(
            z.object({ premise: z.string(), commit: z.string() }),
          ),
          ticket_sha256: z.string(),
          continues: z.string().nullable(),
          supersedes: z.string().nullable(),
        }),
      ).safeParse(line);
      return parsed.success ? [parsed.data] : [];
    });
  expect(events).toHaveLength(2);
  for (const event of events) {
    const copy = await readFile(
      join(state, "runs", event.id, "ticket.orig.md"),
    );
    expect(copy).toEqual(original);
    expect(createHash("sha256").update(copy).digest("hex")).toBe(
      event.ticket_sha256,
    );
    expect(
      await readFile(
        join(state, "runs", event.id, "ticket.orig.md.sha256"),
        "utf8",
      ),
    ).toBe(`${event.ticket_sha256}  ticket.orig.md\n`);
    expect(event.base_rev).toMatch(/^[a-f0-9]{40}$/u);
    expect(event.base_rev).toBe(baseRev);
    expect(event.premise_commits).toEqual([
      { premise: "file:.agx.toml", commit: event.base_rev },
      { premise: "rev:HEAD^", commit: previousCommit },
    ]);
    const brief = await readFile(
      join(state, "runs", event.id, "brief.md"),
      "utf8",
    );
    expect(brief).toContain("Sandbox mode: read-only");
    expect(brief).toContain('network: "none"');
  }
  expect(events[0]).toMatchObject({ continues: "previous", supersedes: null });
  expect(events[1]).toMatchObject({ continues: null, supersedes: "previous" });
}, 30000);

test("missing proposition names the table, all keys and a one-line example", () => {
  const parsed = parseNextTicket('+++\nschema = 2\noutcome = "x"\n+++\n');
  expect(parsed.success).toBe(false);
  if (parsed.success) return;
  for (const part of ["[proposition]", "id", "claim", "refuted_by", "example:"])
    expect(parsed.reason).toContain(part);
});

test.each([
  "resources = { cpu = 0, ram_gb = 1 }",
  "resources = { cpu = 1 }",
  'base_rev = "wrong"',
  "external_reads = [1]",
  "first_return_s = 601",
  'network = "anything"',
  'sandbox = "anything"',
])("rejects invalid typed declaration: %s", (extra) => {
  expect(parseNextTicket(text(extra)).success).toBe(false);
});
