import { afterAll, expect, setDefaultTimeout, test } from "bun:test";
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
import { join } from "node:path";
import { decodedJson } from "../../shared/src/decode.ts";
import { z } from "../../shared/src/zod.ts";

setDefaultTimeout(60_000);
const scratch = await mkdtemp(join(tmpdir(), "tkt-lifecycle-"));
afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});
const cli = join(import.meta.dir, "../src/tkt.ts");
const bun = process.execPath;
let sequence = 0;
async function fixture(custom?: string) {
  const root = join(scratch, String(++sequence));
  const repo = join(root, "repo");
  const bin = join(root, "bin");
  const records = join(root, "runs.json");
  const localDirectory = join(root, "config/agx/repos");
  await mkdir(localDirectory, { recursive: true });
  const local = join(localDirectory, "repo.toml");
  const home = join(root, "home");
  await mkdir(bin, { recursive: true });
  await mkdir(home);
  const env = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: join(root, "config"),
    XDG_CACHE_HOME: home,
    XDG_STATE_HOME: home,
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: join(root, "transpiler-cache"),
    AGX_STATE_DIR: home,
    AGX_NEXT_STATE_DIR: home,
    JJ_CONFIG: "",
    JJ_USER: "Fixture",
    JJ_EMAIL: "fixture@example.com",
    PATH: `${bin}:${process.env.PATH}`,
    TKT_RECORDS: records,
  };
  async function run(
    args: string[],
    cwd = repo,
    overrides: NodeJS.ProcessEnv = {},
  ) {
    const p = Bun.spawn(args, {
      cwd,
      env: { ...env, ...overrides },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err, code] = await Promise.all([
      new Response(p.stdout).text(),
      new Response(p.stderr).text(),
      p.exited,
    ]);
    return { out, err, code };
  }
  expect((await run(["jj", "git", "init", repo], root)).code).toBe(0);
  if (custom !== undefined)
    await writeFile(join(repo, "agx.toml"), `schema = 1\n${custom}`);
  await writeFile(join(repo, "base"), "base\n");
  expect((await run(["jj", "commit", "-m", "base"])).code).toBe(0);
  expect(
    (await run(["jj", "bookmark", "create", "main", "-r", "@-"])).code,
  ).toBe(0);
  expect(
    (
      await run([
        "jj",
        "config",
        "set",
        "--repo",
        'revset-aliases."trunk()"',
        "bookmarks(main)",
      ])
    ).code,
  ).toBe(0);
  const shim = join(bin, "agx");
  await writeFile(
    shim,
    `#!${bun}\nif (process.argv.slice(2).join(' ') !== 'worker ls --json --all') process.exit(9);\nprocess.stdout.write(await Bun.file(process.env.TKT_RECORDS).text());\n`,
  );
  await chmod(shim, 0o755);
  await writeFile(records, "[]");
  const tkt = (args: string[]) => run([bun, cli, ...args, "--repo", repo]);
  const record = (ticket: string, extra: object = {}) => ({
    id: `run-${ticket}`,
    ticket,
    started_at: "2026-10-16T00:00:00Z",
    state: "ended",
    judgment: null,
    cwd: repo,
    workspace: repo,
    workspace_name: "default",
    ...extra,
  });
  return {
    root,
    repo,
    home,
    initialHome: await readdir(home),
    local,
    records,
    run,
    tkt,
    record,
  };
}
const Rows = z.array(
  z.object({
    ticket: z.string(),
    state: z.string(),
    landed: z.boolean().nullable(),
    run: z.string().nullable(),
  }),
);

test("new accepts a hyphenated slug and refuses underscores and uppercase before writing", async () => {
  const f = await fixture();
  for (const slug of ["arena_g3", "Arena-G3"]) {
    const refused = await f.tkt(["new", slug]);
    expect(refused.code).toBe(1);
    expect(refused.err).toContain("agx ticket new arena-g3");
  }
  expect(
    await Bun.file(join(f.repo, ".agents/tickets/arena_g3.md")).exists(),
  ).toBe(false);
  const accepted = await f.tkt(["new", "arena-g3"]);
  expect(accepted.code, accepted.err).toBe(0);
  expect(await readdir(join(f.repo, ".agents/tickets"))).toEqual([
    "arena-g3.md",
  ]);
  expect(await readFile(accepted.out.trim(), "utf8")).toContain(
    'name = "arena-g3"',
  );
});

test("an uncommitted agx.toml edit does not move the ticket home", async () => {
  const f = await fixture('tickets = "committed-tickets"\n');
  await writeFile(
    join(f.repo, "agx.toml"),
    'tickets = "uncommitted-tickets"\n',
  );
  const result = await f.tkt(["new", "committed"]);
  expect(result.code, result.err).toBe(0);
  expect(result.out.trim()).toBe(
    join(f.repo, "committed-tickets/committed.md"),
  );
  expect(
    await Bun.file(join(f.repo, "uncommitted-tickets/committed.md")).exists(),
  ).toBe(false);
});

test("new defaults, template escaping, overwrite refusal and three input lines; no state", async () => {
  const f = await fixture();
  const before = await readdir(f.repo);
  const first = await f.tkt(["new", "demo"]);
  expect(first.code, first.err).toBe(0);
  const ticket = join(f.repo, ".agents/tickets/demo.md");
  const original = await readFile(ticket, "utf8");
  expect(original).toContain('name = "demo"');
  expect((await f.tkt(["new", "demo"])).code).toBe(1);
  expect(await readFile(ticket, "utf8")).toBe(original);
  const template = join(f.root, "template.md");
  const inputs = join(f.root, "inputs.txt");
  await writeFile(template, "{{slug}} {{index}} {{input}} {{owner:json}}\n");
  await writeFile(inputs, "one\ntwo\nthree\n");
  const many = await f.tkt([
    "new",
    "batch",
    "--from",
    template,
    "--set",
    'owner=a"b',
    "--each",
    inputs,
  ]);
  expect(many.code, many.err).toBe(0);
  expect(many.out.trim().split("\n")).toHaveLength(3);
  expect(
    await readFile(join(f.repo, ".agents/tickets/batch-2.md"), "utf8"),
  ).toBe('batch-2 2 two "a\\"b"\n');
  expect((await f.tkt(["new", "bad/slug"])).code).toBe(1);
  expect((await f.tkt(["new", "missing", "--from", template])).code).toBe(1);
  expect((await f.tkt(["ls"])).code).toBe(0);
  expect((await f.tkt(["gc", "--dry-run"])).out).toBe("");
  expect(
    (await readdir(f.repo)).filter((name) => !before.includes(name)),
  ).toEqual([".agents"]);
  expect(await readdir(join(f.repo, ".agents"))).toEqual(["tickets"]);
  expect(await readdir(f.home)).toEqual(f.initialHome);
});

test("declared directory, all five states, dry-run exactly eligible and GC only accepted+landed", async () => {
  const f = await fixture('tickets = "work/tickets"\n');
  const names = [
    "none",
    "live",
    "unjudged",
    "accepted",
    "rejected",
    "dirty",
    "rerun",
    "oldlive",
    "unknown",
  ];
  for (const name of names) expect((await f.tkt(["new", name])).code).toBe(0);
  expect((await f.run(["jj", "commit", "-m", "tickets"])).code).toBe(0);
  expect(
    (await f.run(["jj", "bookmark", "set", "main", "-r", "@-"])).code,
  ).toBe(0);
  const other = join(f.root, "dirty-ws");
  expect(
    (await f.run(["jj", "workspace", "add", "--name", "dirty", other])).code,
  ).toBe(0);
  await writeFile(join(other, "unlanded.txt"), "not landed");
  expect((await f.run(["jj", "commit", "-m", "work"], other)).code).toBe(0);
  await writeFile(
    f.records,
    JSON.stringify([
      f.record("live", { state: "running" }),
      f.record("unjudged"),
      f.record("accepted", { judgment: { decision: "accept" } }),
      f.record("rejected", { judgment: { decision: "reject" } }),
      f.record("dirty", {
        workspace: other,
        workspace_name: "dirty",
        judgment: { decision: "accept" },
      }),
      f.record("rerun", { judgment: { decision: "accept" } }),
      f.record("rerun", {
        id: "new-rerun",
        started_at: "2026-10-16T01:00:00Z",
      }),
      f.record("oldlive", { state: "running" }),
      f.record("oldlive", {
        id: "new-oldlive",
        started_at: "2026-10-16T01:00:00Z",
        judgment: { decision: "accept" },
      }),
      f.record("unknown", {
        workspace_name: "forgotten",
        judgment: { decision: "accept" },
      }),
    ]),
  );
  const ls = await f.tkt(["ls", "--json"]);
  expect(ls.code, ls.err).toBe(0);
  const rows = decodedJson(Rows, ls.out);
  expect(Object.fromEntries(rows.map((r) => [r.ticket, r.state]))).toEqual({
    none: "no-run",
    live: "running",
    unjudged: "ended-unjudged",
    accepted: "accepted",
    rejected: "rejected",
    dirty: "accepted",
    rerun: "ended-unjudged",
    oldlive: "running",
    unknown: "accepted",
  });
  expect(rows.find((r) => r.ticket === "dirty")?.landed).toBe(false);
  expect(rows.find((r) => r.ticket === "unknown")?.landed).toBeNull();
  const dry = await f.tkt(["gc", "--dry-run"]);
  expect(dry.code, dry.err).toBe(0);
  expect(dry.out.trim().split("\n")).toHaveLength(1);
  expect(dry.out).toContain(
    `would-collect\t${join(f.repo, "work/tickets/accepted.md")}`,
  );
  expect(await readdir(join(f.repo, "work/tickets"))).toHaveLength(
    names.length,
  );
  const collected = await f.tkt(["gc"]);
  expect(collected.code, collected.err).toBe(0);
  expect(collected.out).toContain("collected\t");
  expect((await readdir(join(f.repo, "work/tickets"))).toSorted()).toEqual(
    names
      .filter((n) => n !== "accepted")
      .map((n) => `${n}.md`)
      .toSorted(),
  );
});

test("matching ticket metadata name, foreign repo exclusion, malformed agx fails closed", async () => {
  const f = await fixture();
  const foreign = await fixture();
  expect((await f.tkt(["new", "file"])).code).toBe(0);
  await writeFile(
    join(f.repo, ".agents/tickets/file.md"),
    '+++\nname = "logical"\n+++\n',
  );
  await writeFile(
    f.records,
    JSON.stringify([
      f.record("logical", {
        cwd: foreign.repo,
        workspace: foreign.repo,
        judgment: { decision: "accept" },
      }),
    ]),
  );
  expect(decodedJson(Rows, (await f.tkt(["ls", "--json"])).out)[0]?.state).toBe(
    "no-run",
  );
  await writeFile(
    f.records,
    JSON.stringify([
      f.record("logical", {
        state: "orphaned",
        judgment: { decision: "accept" },
      }),
    ]),
  );
  expect(decodedJson(Rows, (await f.tkt(["ls", "--json"])).out)[0]?.state).toBe(
    "ended-unjudged",
  );
  await writeFile(f.records, "broken");
  expect((await f.tkt(["gc"])).code).toBe(1);
  expect(await readdir(join(f.repo, ".agents/tickets"))).toEqual(["file.md"]);
});

test("absolute ticket directory; batch conflict preflight; symlinks never overwritten or collected", async () => {
  const f = await fixture();
  const directory = join(f.root, "external-tickets");
  await writeFile(
    f.local,
    `schema = 1\nroot = ${JSON.stringify(f.repo)}\ntickets = ${JSON.stringify(directory)}\n`,
  );
  expect(
    (await f.run(["jj", "commit", "-m", "Declare absolute ticket home"])).code,
  ).toBe(0);
  expect((await f.tkt(["new", "batch-2"])).code).toBe(0);
  const input = join(f.root, "inputs");
  await writeFile(input, "one\ntwo\nthree\n");
  expect((await f.tkt(["new", "batch", "--each", input])).code).toBe(1);
  expect(await readdir(directory)).toEqual(["batch-2.md"]);
  const { symlink } = await import("node:fs/promises");
  const target = join(f.root, "precious.md");
  await writeFile(target, "keep me");
  await symlink(target, join(directory, "alias.md"));
  expect((await f.tkt(["new", "alias"])).code).toBe(1);
  await writeFile(
    f.records,
    JSON.stringify([f.record("alias", { judgment: { decision: "accept" } })]),
  );
  expect((await f.tkt(["gc"])).out).toBe("");
  expect(await readFile(target, "utf8")).toBe("keep me");
  expect((await readdir(directory)).toSorted()).toEqual([
    "alias.md",
    "batch-2.md",
  ]);
});

test("a workspace already removed by ws retains ticket state but cannot authorize GC", async () => {
  const f = await fixture();
  expect((await f.tkt(["new", "past"])).code).toBe(0);
  const removed = join(f.root, "repo.ws/ws_past");
  await writeFile(
    f.records,
    JSON.stringify([
      f.record("past", {
        cwd: removed,
        workspace: removed,
        workspace_name: "ws_past",
        judgment: { decision: "accept" },
      }),
    ]),
  );
  const row = decodedJson(Rows, (await f.tkt(["ls", "--json"])).out)[0];
  expect(row?.state).toBe("accepted");
  expect(row?.landed).toBeNull();
  expect((await f.tkt(["gc"])).out).toBe("");
  expect(await readdir(join(f.repo, ".agents/tickets"))).toEqual(["past.md"]);
});

test("repository override scans only its root and unset preserves both default locations", async () => {
  const f = await fixture();
  const defaults = [
    join(f.home, "dotfiles"),
    join(f.home, "Workspace/default"),
  ];
  for (const path of defaults) {
    await mkdir(path, { recursive: true });
    expect((await f.run(["jj", "git", "init", path], f.root)).code).toBe(0);
    await writeFile(
      join(path, "stray.md"),
      "+++\nschema = 2\n[proposition]\n+++\n",
    );
  }
  await writeFile(
    join(f.repo, "stray.md"),
    "+++\nschema = 2\n[proposition]\n+++\n",
  );
  const normal = await f.run([bun, cli, "doctor"], f.repo, {
    AGX_REPOS_ROOT: undefined,
  });
  expect(normal.code, normal.err).toBe(1);
  for (const path of defaults) expect(normal.out).toContain(path);
  expect(normal.out).not.toContain(f.repo);
  const overridden = await f.run([bun, cli, "doctor"], f.repo, {
    AGX_REPOS_ROOT: f.root,
  });
  expect(overridden.code, overridden.err).toBe(1);
  expect(overridden.out).toContain(f.repo);
  for (const path of defaults) expect(overridden.out).not.toContain(path);
});

test("retired repository overrides fail with exit 2 even when empty or paired with the replacement", async () => {
  const f = await fixture();
  for (const name of ["AGX_DOCTOR_HOME", "AGX_DOCTOR_WORKSPACE"]) {
    for (const [value, replacement] of [
      ["", undefined],
      ["", f.root],
      [f.root, undefined],
      [f.root, f.root],
    ]) {
      const refused = await f.run([bun, cli, "doctor"], f.repo, {
        [name]: value,
        AGX_REPOS_ROOT: replacement,
      });
      expect(refused.code).toBe(2);
      expect(refused.out).toBe("");
      expect(refused.err.trim().split("\n")).toHaveLength(1);
      expect(refused.err).toContain(name);
      expect(refused.err).toContain("AGX_REPOS_ROOT");
    }
  }
});

test.each([
  {
    name: "retired file",
    policy: undefined,
    legacy: true,
    message: ".agx.toml is retired; rename it:",
  },
  {
    name: "absolute L1 tickets",
    policy: 'schema = 1\ntickets = "/absolute"\n',
    legacy: false,
    message: "agx/repos/",
  },
  {
    name: "unknown key",
    policy: "schema = 1\nunknown = true\n",
    legacy: false,
    message: "unknown",
  },
  {
    name: "missing schema",
    policy: 'tickets = "tickets"\n',
    legacy: false,
    message: "schema",
  },
])(
  "configuration errors exit 2: $name",
  async ({ policy, legacy, message }) => {
    const f = await fixture();
    if (policy !== undefined) {
      await writeFile(join(f.repo, "agx.toml"), policy);
      expect((await f.run(["jj", "commit", "-m", "Invalid policy"])).code).toBe(
        0,
      );
      expect(
        (await f.run(["jj", "bookmark", "set", "main", "-r", "@-"])).code,
      ).toBe(0);
    }
    if (legacy) {
      await writeFile(join(f.repo, ".agx.toml"), "");
      expect(
        (await f.run(["jj", "commit", "-m", "Retired trunk policy"])).code,
      ).toBe(0);
      expect(
        (await f.run(["jj", "bookmark", "set", "main", "-r", "@-"])).code,
      ).toBe(0);
    }
    for (const args of [["new", "refused"], ["ls"], ["gc"]]) {
      const result = await f.tkt(args);
      expect(result.code, result.err).toBe(2);
      expect(result.err.trim().split("\n")).toHaveLength(1);
      expect(result.err).toContain(message);
      expect(result.out).toBe("");
      if (legacy)
        expect(result.err.trim()).toBe(
          `${f.repo}/.agx.toml is retired; rename it: mv .agx.toml agx.toml (machine-local absolute paths go in $XDG_CONFIG_HOME/agx/repos/<name>.toml (default ~/.config/agx/repos/<name>.toml) with root = ${JSON.stringify(f.repo)})`,
        );
    }
  },
);

test("other operational failures retain exit 1", async () => {
  const f = await fixture();
  expect((await f.tkt(["new", "existing"])).code).toBe(0);
  const conflict = await f.tkt(["new", "existing"]);
  expect(conflict.code).toBe(1);
  expect(conflict.err).toContain("tkt:");
  const template = await f.tkt([
    "new",
    "template",
    "--from",
    join(f.root, "missing"),
  ]);
  expect(template.code).toBe(1);
  await writeFile(f.records, "invalid");
  expect((await f.tkt(["ls"])).code).toBe(1);
});

test("secondary workspace issuance selects XDG L2 by main checkout root", async () => {
  const f = await fixture('tickets = "policy"\n');
  const secondary = join(f.root, "secondary");
  expect(
    (await f.run(["jj", "workspace", "add", "--name", "secondary", secondary]))
      .code,
  ).toBe(0);
  await writeFile(
    f.local,
    `schema = 1\nroot = ${JSON.stringify(f.repo)}\ntickets = "main-local"\n`,
  );
  await writeFile(
    join(secondary, "repo.toml"),
    'schema = 1\ntickets = "wrong-local"\n',
  );
  const result = await f.run([
    bun,
    cli,
    "new",
    "secondary",
    "--repo",
    secondary,
  ]);
  expect(result.code, result.err).toBe(0);
  expect(result.out.trim()).toBe(join(f.repo, "main-local/secondary.md"));
});

test("duplicate XDG root claims exit 2", async () => {
  const f = await fixture();
  const text = `schema = 1\nroot = ${JSON.stringify(f.repo)}\ntickets = "local"\n`;
  await writeFile(f.local, text);
  await writeFile(join(f.root, "config/agx/repos/duplicate.toml"), text);
  const result = await f.tkt(["ls"]);
  expect(result.code, result.err).toBe(2);
  expect(result.err).toContain("two files claim root");
  expect(result.out).toBe("");
});
