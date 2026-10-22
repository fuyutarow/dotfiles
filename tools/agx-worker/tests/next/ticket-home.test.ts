import { afterEach, beforeEach, expect, test } from "bun:test";
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
import { prepareTicketRepo, writeLocalTicketConfig } from "../ticket-repo.ts";

const roots: string[] = [];
function inheritedEnv() {
  const env = { ...process.env };
  Reflect.deleteProperty(env, "AGX_NEXT_STATE_DIR");
  return env;
}
const originalXdg = process.env.XDG_CONFIG_HOME;
beforeEach(async () => {
  const config = await mkdtemp(join(tmpdir(), "worker-xdg-"));
  roots.push(config);
  process.env.XDG_CONFIG_HOME = config;
});
afterEach(async () => {
  if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalXdg;
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
const CLI = resolve("tools/agx-worker/src/next/cli.ts");
const text = (extra = "") =>
  `+++\nschema = 2\nname = "home"\noutcome = "recover ticket"\n${extra}\n[proposition]\nid = "HOME"\nclaim = "ticket is recoverable"\nrefuted_by = "bytes differ"\n+++\n原本\r\n`;

test("new dispatch refuses nonconforming names with agx ticket new repair, without artifacts", async () => {
  const f = await fixture();
  for (const command of ["check", "run"]) {
    for (const name of ["design_g5", "Design-G5"]) {
      const original = text().replace('name = "home"', `name = "${name}"`);
      await writeFile(f.ticket, original);
      const result = await f.invoke([command, f.ticket]);
      expect(result.exit).toBe(2);
      expect(result.err).toContain("agx ticket new design-g5");
      expect(await readFile(f.ticket, "utf8")).toBe(original);
    }
  }
  const unnamed = join(f.directory, "design_g5.md");
  await writeFile(unnamed, text().replace('name = "home"\n', ""));
  expect((await f.invoke(["check", unnamed])).err).toContain(
    "agx ticket new design-g5",
  );
  const valid = join(f.directory, "arena-g3.md");
  await writeFile(valid, text().replace('name = "home"\n', ""));
  const checked = await f.invoke(["check", valid]);
  expect(checked.exit, checked.err).toBe(0);
  expect(checked.out).toContain("ticket=arena-g3 ");
  expect(
    await Bun.file(join(f.env.AGX_STATE_DIR, "records.jsonl")).exists(),
  ).toBe(false);
}, 30000);

test.each([
  {
    name: "main checkout default home",
    secondary: false,
    home: "default",
    accepted: true,
  },
  {
    name: "secondary workspace default home",
    secondary: true,
    home: "default",
    accepted: true,
  },
  {
    name: "secondary workspace absolute home",
    secondary: true,
    home: "absolute",
    accepted: true,
  },
  {
    name: "secondary workspace relative home",
    secondary: true,
    home: "relative",
    accepted: true,
  },
  {
    name: "secondary workspace undeclared /tmp path",
    secondary: true,
    home: "stray",
    accepted: false,
  },
])(
  "jj dispatch: $name",
  async ({ secondary, home, accepted }) => {
    const parent = await mkdtemp(join(tmpdir(), "agx-ticket-workspace-"));
    roots.push(parent);
    const root = join(parent, "repo");
    const workspace = join(parent, "repo.ws", "ws_dispatch");
    const absoluteHome = join(parent, "tickets");
    await mkdir(root, { recursive: true });
    const bin = join(parent, "bin");
    await mkdir(bin);
    await symlink(CLI, join(bin, "agx-worker"));
    const env = {
      ...inheritedEnv(),
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      JJ_CONFIG: "",
      JJ_USER: "Fixture",
      JJ_EMAIL: "fixture@example.invalid",
      AGX_STATE_DIR: join(parent, "state"),
      DISPATCH_ROSTER_PATH: resolve("agents/models/dispatch-roster.toml"),
      AGX_WORKER_BIN: join(parent, "worker.ts"),
      AGX_TMP_ROOT: join(parent, "tmp"),
      JEV_URL: "http://127.0.0.1:1/choice",
    };
    const command = async (args: string[], cwd = root) => {
      const child = Bun.spawn(args, {
        cwd,
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
    const jj = async (args: string[]) => {
      const result = await command(["jj", ...args]);
      expect(result.exit, result.err).toBe(0);
      return result.out.trim();
    };
    await jj(["git", "init", "."]);
    await jj([
      "config",
      "set",
      "--repo",
      'revset-aliases."trunk()"',
      "bookmarks(alpha)",
    ]);
    await writeFile(join(root, ".agx.toml"), "legacy workspace policy\n");
    await jj(["commit", "-m", "Legacy workspace base"]);
    const oldBase = await jj([
      "log",
      "--no-graph",
      "-r",
      "@-",
      "-T",
      "commit_id",
    ]);
    await unlink(join(root, ".agx.toml"));
    const declared = home === "absolute" ? absoluteHome : "declared";
    if (home === "absolute") await writeLocalTicketConfig(root, declared);
    else
      await writeFile(
        join(root, "agx.toml"),
        `schema = 1\ntickets = ${JSON.stringify(declared)}\n`,
      );
    await jj(["commit", "-m", "Declare ticket home"]);
    await jj(["bookmark", "create", "alpha", "-r", "@-"]);
    if (secondary) {
      await mkdir(join(parent, "repo.ws"));
      await jj([
        "workspace",
        "add",
        "--name",
        "dispatch",
        "-r",
        oldBase,
        workspace,
      ]);
    }
    const cwd = secondary ? workspace : root;
    // Neither checkout's dirty declaration is authority; only trunk is.
    await writeFile(join(root, "agx.toml"), 'schema = 1\ntickets = "."\n');
    await writeFile(join(cwd, "agx.toml"), 'schema = 1\ntickets = "."\n');
    const directory = new Map([
      ["default", join(root, ".agents/tickets")],
      ["absolute", absoluteHome],
      ["relative", join(root, "declared")],
      ["stray", join(parent, "undeclared")],
    ]).get(home);
    expect(directory).toBeDefined();
    if (directory === undefined) return;
    await mkdir(directory, { recursive: true });
    const ticket = join(directory, "dispatch.md");
    const revision = await command(
      [
        "jj",
        "--ignore-working-copy",
        "--at-operation=@",
        "log",
        "--no-graph",
        "-r",
        "@",
        "-T",
        "commit_id",
      ],
      cwd,
    );
    expect(revision.exit, revision.err).toBe(0);
    await writeFile(ticket, text(`base_rev = "${revision.out.trim()}"`));
    const before = await readdir(join(root, ".jj/repo/op_heads"));
    const result = await command([
      process.execPath,
      resolve("tools/agx/src/agx.ts"),
      "worker",
      "check",
      ticket,
      "--cd",
      cwd,
    ]);
    expect(result.exit, `${result.out}\n${result.err}`).toBe(accepted ? 0 : 2);
    if (!accepted) expect(result.err).toContain("agx: refused ticket path");
    expect(await readdir(join(root, ".jj/repo/op_heads"))).toEqual(before);
    expect(
      await Bun.file(join(env.AGX_STATE_DIR, "records.jsonl")).exists(),
    ).toBe(false);
    if (secondary && home === "absolute") {
      await writeFile(
        env.AGX_WORKER_BIN,
        'console.log(JSON.stringify({exit:0, vendor_session:"fixture-session", report:{summary:"done",changes:[],checks:[],for_coordinator:[],open:[]}}));\n',
      );
      const invokeWorker = (args: string[]) =>
        command([process.execPath, CLI, ...args, ticket, "--cd", cwd]);
      const fresh = await invokeWorker(["run"]);
      expect(fresh.exit, `${fresh.out}\n${fresh.err}`).toBe(0);
      const started = (
        await readFile(join(env.AGX_STATE_DIR, "records.jsonl"), "utf8")
      )
        .trim()
        .split("\n")
        .flatMap((line) => {
          const parsed = jsonOf(
            z.looseObject({ kind: z.literal("started"), id: z.string() }),
          ).safeParse(line);
          return parsed.success ? [parsed.data.id] : [];
        });
      expect(started).toHaveLength(1);
      const previous = started[0];
      if (previous === undefined) return;
      for (const workerCommand of ["check", "run"]) {
        const continued = await invokeWorker([
          workerCommand,
          "--continue",
          previous,
        ]);
        expect(continued.exit, `${continued.out}\n${continued.err}`).toBe(0);
      }
    }
  },
  30000,
);

async function fixture(home = "tickets") {
  const root = await mkdtemp(join(tmpdir(), "agx-ticket-home-"));
  roots.push(root);
  await prepareTicketRepo(root, home);
  const directory = resolve(root, home);
  await mkdir(directory, { recursive: true });
  const ticket = join(directory, "home.md");
  await writeFile(ticket, text());
  const env = {
    ...inheritedEnv(),
    // Match prepareTicketRepo: reads must use the same Git context as commits.
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_DIR: undefined,
    GIT_WORK_TREE: undefined,
    GIT_INDEX_FILE: undefined,
    AGX_STATE_DIR: join(root, "state"),
    DISPATCH_ROSTER_PATH: resolve("agents/models/dispatch-roster.toml"),
  };
  const invoke = async (args: string[], cwd = root) => {
    const child = Bun.spawn([process.execPath, CLI, ...args, "--cd", cwd], {
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

test.each(["scratch", "empty-git", "other-repository"])(
  "ticket repository wins over scratch --cd (fake parent: %s)",
  async (fake) => {
    const f = await fixture(".agents/tickets");
    const parent = await mkdtemp(join(tmpdir(), "agx-ticket-scratch-"));
    roots.push(parent);
    const scratch = join(parent, "scratch");
    await mkdir(scratch);
    if (fake === "empty-git") await mkdir(join(parent, ".git"));
    if (fake === "other-repository") await prepareTicketRepo(scratch, ".");
    const worker = join(parent, "worker.ts");
    await writeFile(
      worker,
      'console.log(JSON.stringify({exit:0, report:{summary:"done",changes:[],checks:[],for_coordinator:[],open:[]}}));\n',
    );
    const invoke = async (command: string, ticket: string) => {
      const child = Bun.spawn(
        [process.execPath, CLI, command, ticket, "--cd", scratch],
        {
          env: {
            ...f.env,
            AGX_WORKER_BIN: worker,
            AGX_TMP_ROOT: join(parent, "tmp"),
            JEV_URL: "http://127.0.0.1:1/choice",
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
      return { exit, out, err };
    };
    for (const command of ["check", "run"]) {
      const result = await invoke(command, f.ticket);
      expect(result.exit, `${result.out}\n${result.err}`).toBe(0);
      const stray = join(f.root, "undeclared.md");
      await writeFile(stray, text());
      const refused = await invoke(command, stray);
      expect(refused.exit).toBe(2);
      expect(refused.err).toContain(`refused ticket path ${stray}`);
    }
  },
  30000,
);

test.each([".git", ".jj"])(
  "invalid %s marker is skipped on the ticket path",
  async (marker) => {
    const f = await fixture(".agents/tickets");
    await mkdir(join(f.directory, marker));
    const result = await f.invoke(["check", f.ticket]);
    expect(result.exit, result.err).toBe(0);
    const ctx = await ticketContext(f.directory);
    expect(ctx.ok).toBe(true);
    if (ctx.ok) expect(ctx.root).toBe(f.root);
  },
);

test("an undeclared external ticket names its path even under an invalid repository marker", async () => {
  const f = await fixture();
  const parent = await mkdtemp(join(tmpdir(), "agx-ticket-invalid-parent-"));
  roots.push(parent);
  await mkdir(join(parent, ".git"));
  const stray = join(parent, "stray.md");
  await writeFile(stray, text());
  for (const command of ["check", "run"]) {
    const result = await f.invoke([command, stray], parent);
    expect(result.exit).toBe(2);
    expect(result.err).toContain(`refused ticket path ${stray}`);
    expect(result.err).not.toContain("configuration for HEAD");
  }
});

test("check refuses an undeclared /tmp ticket with refused, declared home and agx ticket new", async () => {
  const f = await fixture();
  const stray = join(f.root, "stray.md");
  await writeFile(stray, text());
  const result = await f.invoke(["check", stray]);
  expect(result.exit).toBe(2);
  expect(result.err).toMatch(/^agx: refused ticket path/u);
  expect(result.err).toContain(f.directory);
  expect(result.err).toContain("agx ticket new");
  expect(
    await Bun.file(join(f.env.AGX_STATE_DIR, "records.jsonl")).exists(),
  ).toBe(false);
}, 30000);

test("check accepts an absolute home declared on the repository trunk", async () => {
  const parent = await mkdtemp(join(tmpdir(), "agx-ticket-home-trunk-"));
  roots.push(parent);
  const root = join(parent, "repo");
  const directory = join(parent, "tickets");
  await mkdir(root, { recursive: true });
  await mkdir(directory, { recursive: true });
  const env = {
    ...inheritedEnv(),
    JJ_CONFIG: "",
    JJ_USER: "Fixture",
    JJ_EMAIL: "fixture@example.invalid",
    AGX_STATE_DIR: join(parent, "state"),
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
  await writeLocalTicketConfig(root, directory);
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
}, 30000);

test("committed relative and absolute homes and the default home are accepted, including /tmp", async () => {
  for (const home of ["tickets", ".agents/tickets"]) {
    const f = await fixture(home);
    const result = await f.invoke(["check", f.ticket]);
    expect(result.exit, `${result.out}\n${result.err}`).toBe(0);
  }
  const f = await fixture();
  await prepareTicketRepo(f.root, f.directory);
  const absolute = await f.invoke(["check", f.ticket]);
  expect(absolute.exit, `${absolute.out}\n${absolute.err}`).toBe(0);
  const defaultHome = join(f.root, ".agents/tickets");
  await mkdir(defaultHome, { recursive: true });
  await writeFile(join(defaultHome, "default.md"), text());
  const fallback = await f.invoke(["check", join(defaultHome, "default.md")]);
  expect(fallback.exit, `${fallback.out}\n${fallback.err}`).toBe(0);
}, 60000);

test("an uncommitted declaration and a symlink escaping the home cannot bypass placement", async () => {
  const f = await fixture();
  await writeFile(join(f.root, "agx.toml"), 'schema = 1\ntickets = "."\n');
  const stray = join(f.root, "stray.md");
  await writeFile(stray, text());
  expect((await f.invoke(["check", stray])).exit).toBe(2);
  await symlink(stray, join(f.directory, "alias.md"));
  expect((await f.invoke(["check", join(f.directory, "alias.md")])).exit).toBe(
    2,
  );
}, 30000);

test("a jj tree uses its recorded working-copy commit and committed home without taking a snapshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "agx-ticket-home-jj-"));
  roots.push(root);
  const env = {
    ...inheritedEnv(),
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
  await writeFile(join(root, "agx.toml"), 'schema = 1\ntickets = "declared"\n');
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
  await writeFile(join(root, "agx.toml"), 'schema = 1\ntickets = "dirty"\n');
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
}, 30000);

test("a repository without agx.toml accepts its default home", async () => {
  const f = await fixture(".agents/tickets");
  await unlink(join(f.root, "agx.toml"));
  // Remove the declaration from the disposable fixture's commit.
  for (const args of [
    ["rm", "--", "agx.toml"],
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
      env: { ...inheritedEnv(), GIT_CONFIG_GLOBAL: "/dev/null" },
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
    (await treeRead(["git", "show", "HEAD:agx.toml"], f.root)).exit,
  ).not.toBe(0);
}, 30000);

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
    await Bun.file(join(f.env.AGX_STATE_DIR, "records.jsonl")).exists(),
  ).toBe(false);
}, 30000);

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
    await Bun.file(join(f.env.AGX_STATE_DIR, "records.jsonl")).exists(),
  ).toBe(false);
}, 30000);

test("run preserves exact original bytes and hash, base and premise commits, replacement and continuation", async () => {
  const f = await fixture();
  await prepareTicketRepo(f.root, f.directory);
  const ctx = await ticketContext(f.root);
  expect(ctx.ok).toBe(true);
  if (!ctx.ok) return;
  const previousCommit = await ctx.revision("HEAD^");
  expect(typeof previousCommit).toBe("string");
  expect(previousCommit).not.toBeNull();
  const baseRev = ctx.base_rev;
  expect(baseRev).not.toBeNull();
  if (baseRev === null || typeof previousCommit !== "string") return;
  const original = Buffer.concat([
    Buffer.from(
      text(
        'premises = ["file:agx.toml", "rev:HEAD^"]\nresources = { cpu = 1, ram_gb = 1 }\nexternal_reads = ["/reference"]\nfirst_return_s = 60\nnetwork = "none"\nsandbox = "read-only"',
      ),
    ),
    Buffer.from([255, 0, 13, 10]),
  ]);
  await writeFile(f.ticket, original);
  const state = f.env.AGX_STATE_DIR;
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
          AGX_WORKER_BIN: worker,
          AGX_TMP_ROOT: join(f.root, "tmp"),
          JEV_URL: "http://127.0.0.1:1/choice",
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
      { premise: "file:agx.toml", commit: event.base_rev },
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

test("worker CLI check and run exit 2 for retired configuration before artifacts", async () => {
  const f = await fixture();
  await writeFile(join(f.root, ".agx.toml"), "");
  for (const args of [
    ["add", "--", ".agx.toml"],
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
      "Retired policy",
    ],
  ]) {
    const child = Bun.spawn(["git", ...args], {
      cwd: f.root,
      env: f.env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: 5000,
    });
    const [exit, , err] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exit, err).toBe(0);
  }
  for (const command of ["check", "run"]) {
    const result = await f.invoke([command, f.ticket]);
    expect(result.exit, result.err).toBe(2);
    expect(result.out).toBe("");
    expect(result.err.trim()).toBe(
      `${f.root}/.agx.toml is retired; rename it: mv .agx.toml agx.toml (machine-local absolute paths go in $XDG_CONFIG_HOME/agx/repos/<name>.toml (default ~/.config/agx/repos/<name>.toml) with root = ${JSON.stringify(f.root)})`,
    );
    expect(result.err.trim().split("\n")).toHaveLength(1);
    expect(
      await Bun.file(join(f.env.AGX_STATE_DIR, "records.jsonl")).exists(),
    ).toBe(false);
  }
});
