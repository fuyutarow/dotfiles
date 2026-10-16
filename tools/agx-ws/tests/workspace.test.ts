// Fixtures use real jj repositories in a scratch directory, a fake `agx` on PATH, and a `stat`
// shim whose answer decides whether the graveyard looks RAM-backed.
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  writeFileSync,
  chmodSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../shared/src/zod.ts";

setDefaultTimeout(60_000);
const WS = join(import.meta.dir, "../src/ws.ts");
const scratch = mkdtempSync(join(tmpdir(), "ws-test-"));
const bin = join(scratch, "bin");
const graveyard = join(scratch, "graveyard");
const records = join(scratch, "agx.json");
const home = join(scratch, "home");

const baseEnv = (
  extra: Record<string, string> = {},
): Record<string, string | undefined> => ({
  ...process.env,
  PATH: `${bin}:${process.env.PATH}`,
  HOME: home,
  XDG_STATE_HOME: join(home, "state"),
  XDG_CONFIG_HOME: join(scratch, "config"),
  XDG_DATA_HOME: join(home, "data"),
  XDG_CACHE_HOME: join(scratch, "cache"),
  MISE_STATE_DIR: join(scratch, "mise-state"),
  MISE_CONFIG_DIR: join(scratch, "mise-config"),
  MISE_CEILING_PATHS: scratch,
  MISE_TRUSTED_CONFIG_PATHS: "",
  MISE_PARANOID: "1",
  RIP_GRAVEYARD: graveyard,
  GRAVEYARD: graveyard,
  JJ_USER: "t",
  JJ_EMAIL: "t@example.com",
  FAKE_FS: "ext4",
  ...extra,
});

async function run(cmd: string[], cwd: string, env = baseEnv()) {
  const child = Bun.spawn(cmd, { cwd, env, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { out, err, code };
}
const ws = (args: string[], cwd: string, env = baseEnv()) =>
  run(["bun", WS, ...args], cwd, env);
const jj = (args: string[], cwd: string) => run(["jj", ...args], cwd);

function shim(name: string, body: string): void {
  const path = join(bin, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
}
const setRecords = (rows: object[]): void => {
  writeFileSync(records, JSON.stringify(rows));
};

let counter = 0;
/** A fresh repo `<scratch>/n/<name>` with one landed commit on bookmark `main`; returns its path. */
async function repo(config?: string): Promise<string> {
  const parent = join(scratch, `r${++counter}`);
  mkdirSync(parent);
  const path = join(parent, "proj");
  expect((await jj(["git", "init", path], parent)).code).toBe(0);
  writeFileSync(join(path, "a.txt"), "a\n");
  if (config !== undefined) writeFileSync(join(path, ".ws.toml"), config);
  await jj(["commit", "-m", "base"], path);
  expect(
    (await jj(["bookmark", "create", "main", "-r", "@-"], path)).code,
  ).toBe(0);
  return path;
}
const wsDir = (path: string, slug: string): string =>
  join(path, "..", "proj.ws", `ws_${slug}`);

beforeAll(() => {
  mkdirSync(bin, { recursive: true });
  mkdirSync(home, { recursive: true });
  shim("agx", `cat "${records}"`);
  shim("stat", `echo "$FAKE_FS"`);
  setRecords([]);
});
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const listing = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir).toSorted() : [];

describe("ws add", () => {
  test("uses sparse . even when the source workspace is narrowed", async () => {
    const path = await repo('ready = ["jj sparse list > sparse.out"]\n');
    await Bun.write(join(path, "artifact.txt"), "tracked artifact\n");
    expect((await jj(["commit", "-m", "artifact"], path)).code).toBe(0);
    expect(
      (
        await jj(
          ["sparse", "set", "--clear", "--add", "a.txt", "--add", ".ws.toml"],
          path,
        )
      ).code,
    ).toBe(0);
    const r = await ws(["add", "complete"], path);
    expect(r.code, r.err).toBe(0);
    expect(
      (await jj(["sparse", "list"], wsDir(path, "complete"))).out.trim(),
    ).toBe(".");
    expect(
      await Bun.file(join(wsDir(path, "complete"), "artifact.txt")).text(),
    ).toBe("tracked artifact\n");
    expect(
      await Bun.file(join(wsDir(path, "complete"), "sparse.out")).text(),
    ).toBe(".\n");
  });

  test("refreshes a stale source before adding another slug and running readiness", async () => {
    const path = await repo('ready = ["jj status > ready.out"]\n');
    expect((await ws(["add", "source"], path)).code).toBe(0);
    const dir = wsDir(path, "source");
    expect((await jj(["new", "root()"], path)).code).toBe(0);
    await Bun.write(join(path, "destination.txt"), "destination\n");
    await Bun.write(
      join(path, ".ws.toml"),
      'ready = ["jj status > ready.out"]\n',
    );
    expect((await jj(["rebase", "-s", "main", "-d", "@"], path)).code).toBe(0);
    const stale = await jj(["status"], dir);
    expect(stale.code).toBe(1);
    expect(stale.err).toContain("working copy is stale");
    const r = await ws(["add", "next"], dir);
    expect(r.code, r.err).toBe(0);
    expect((await jj(["status"], dir)).code).toBe(0);
    expect((await jj(["status"], wsDir(path, "next"))).code).toBe(0);
    expect(
      await Bun.file(join(wsDir(path, "next"), "ready.out")).exists(),
    ).toBe(true);
  });

  test("trusts mise.toml without a readiness declaration", async () => {
    const path = await repo();
    await Bun.write(
      join(path, "mise.toml"),
      '[env]\nWS_TRUST_FIXTURE = "ready"\n',
    );
    expect(
      (await jj(["commit", "-m", "mise without readiness"], path)).code,
    ).toBe(0);
    const r = await ws(["add", "demo"], path);
    expect(r.code, r.err).toBe(0);
    const config = join(wsDir(path, "demo"), "mise.toml");
    const shown = await run(["mise", "trust", "--show"], wsDir(path, "demo"));
    expect(shown.code).toBe(0);
    expect(shown.out).toContain(`${config}: trusted`);
    expect(r.err).toContain(`ws: ready: trusted ${config}`);
  });

  test.each(["mise.toml", ".mise.toml"])(
    "trusts %s before readiness with isolated mise state",
    async (config) => {
      const path = await repo('ready = ["mise env --json > ready.json"]\n');
      await Bun.write(
        join(path, config),
        '[env]\nWS_TRUST_FIXTURE = "ready"\n',
      );
      expect((await jj(["commit", "-m", "mise fixture"], path)).code).toBe(0);
      const r = await ws(["add", "demo"], path);
      expect(r.code, r.err).toBe(0);
      const dir = wsDir(path, "demo");
      expect(r.err).toContain(`ws: ready: trusted ${join(dir, config)}`);
      const shown = await run(["mise", "trust", "--show"], dir);
      expect(shown.code).toBe(0);
      expect(shown.out).toContain(`${join(dir, config)}: trusted`);
      const env = jsonOf(
        z.looseObject({ WS_TRUST_FIXTURE: z.literal("ready") }),
      ).safeParse(await Bun.file(join(dir, "ready.json")).text());
      expect(env.success).toBe(true);
    },
  );

  test("runs declared trust for an additional config before returning the workspace", async () => {
    const path = await repo('ready = ["mise trust -q nested/mise.toml"]\n');
    await Bun.write(
      join(path, "mise.toml"),
      '[env]\nWS_TRUST_FIXTURE = "root"\n',
    );
    await Bun.write(
      join(path, "nested/mise.toml"),
      '[env]\nWS_TRUST_NESTED = "nested"\n',
    );
    expect((await jj(["commit", "-m", "nested mise fixture"], path)).code).toBe(
      0,
    );
    const r = await ws(["add", "nested"], path);
    expect(r.code).toBe(0);
    const dir = wsDir(path, "nested");
    expect(r.err).toContain(`ws: ready: trusted ${join(dir, "mise.toml")}`);
    expect(r.err).toContain("ws: ready: mise trust -q nested/mise.toml");
    const shown = await run(["mise", "trust", "--show"], join(dir, "nested"));
    expect(shown.code).toBe(0);
    expect(shown.out).toContain(`${join(dir, "mise.toml")}: trusted`);
    expect(shown.out).toContain(`${join(dir, "nested/mise.toml")}: trusted`);
  });

  test("a failed mise trust is loud and rolls back before readiness", async () => {
    const path = await repo('ready = ["echo ran > ready.out"]\n');
    await Bun.write(
      join(path, "mise.toml"),
      '[env]\nWS_TRUST_FIXTURE = "ready"\n',
    );
    expect(
      (await jj(["commit", "-m", "mise failure fixture"], path)).code,
    ).toBe(0);
    // A regular file cannot hold mise's state directory, even when tests run as root.
    const blocked = join(scratch, "blocked-state");
    await Bun.write(blocked, "not a directory\n");
    const r = await ws(
      ["add", "blocked"],
      path,
      baseEnv({ MISE_STATE_DIR: blocked }),
    );
    expect(r.code).toBe(1);
    expect(r.err).toContain("mise trust");
    expect(r.err).toContain("the new workspace was removed");
    expect(r.err).not.toContain("ws: ready: echo ran");
    expect(
      await Bun.file(
        join(wsDir(path, "blocked"), ".jj/working_copy/type"),
      ).exists(),
    ).toBe(false);
    expect((await jj(["workspace", "list"], path)).out).not.toContain(
      "ws_blocked",
    );
  });

  test("creates the declared path, names the workspace after it, runs readiness", async () => {
    const path = await repo(
      'trunk = "main"\nready = ["pwd > ready.out", "echo done >> ready.out"]\n',
    );
    const r = await ws(["add", "alpha"], path);
    expect(r.code).toBe(0);
    const dir = wsDir(path, "alpha");
    expect(r.out.trim()).toBe(join(path, "..", "proj.ws", "ws_alpha"));
    expect(existsSync(join(dir, ".jj"))).toBe(true);
    expect(await Bun.file(join(dir, "ready.out")).text()).toContain("done");
    expect((await jj(["workspace", "list"], path)).out).toContain("ws_alpha");
  });

  test("writes no state file: only the workspace directory appears", async () => {
    const path = await repo();
    const before = listing(join(path, ".."));
    expect((await ws(["add", "s1"], path)).code).toBe(0);
    expect(listing(join(path, "..", "proj.ws"))).toEqual(["ws_s1"]);
    expect(
      listing(join(path, "..")).filter((n) => !before.includes(n)),
    ).toEqual(["proj.ws"]);
    expect(listing(home).filter((n) => n !== ".bun")).toEqual([]);
  });

  test("a failing readiness command is loud, non-zero, and leaves no workspace", async () => {
    const path = await repo('ready = ["echo boom >&2; exit 7"]\n');
    const r = await ws(["add", "bad"], path);
    expect(r.code).toBe(1);
    expect(r.err).toContain("exit 7");
    expect(existsSync(wsDir(path, "bad"))).toBe(false);
    expect((await jj(["workspace", "list"], path)).out).not.toContain("ws_bad");
  });

  test("fails before work on unmet preconditions", async () => {
    const path = await repo();
    expect((await ws(["add", "bad/slug"], path)).code).toBe(1);
    expect((await ws(["add", "x", "--rev", "nope_no_such"], path)).code).toBe(
      1,
    );
    expect(
      (await ws(["add", "x"], path, baseEnv({ FAKE_FS: "tmpfs" }))).err,
    ).toContain("RAM-backed");
    expect(existsSync(join(path, "..", "proj.ws"))).toBe(false);
    writeFileSync(join(path, ".ws.toml"), "ready = 3\n");
    expect((await ws(["add", "x"], path)).code).toBe(1);
    expect(existsSync(join(path, "..", "proj.ws"))).toBe(false);
    expect((await ws(["add", "x"], tmpdir())).code).toBe(1);
  });

  test("refuses an existing slug", async () => {
    const path = await repo();
    expect((await ws(["add", "dup"], path)).code).toBe(0);
    expect((await ws(["add", "dup"], path)).code).toBe(1);
  });
});

describe("ws refresh", () => {
  test("updates a rebased workspace without rerunning readiness or widening sparse", async () => {
    const path = await repo('ready = ["echo ready >> ready.out"]\n');
    expect((await ws(["add", "stale"], path)).code).toBe(0);
    const dir = wsDir(path, "stale");
    expect(
      (
        await jj(
          ["sparse", "set", "--clear", "--add", "a.txt", "--add", "ready.out"],
          dir,
        )
      ).code,
    ).toBe(0);
    expect((await jj(["new", "root()"], path)).code).toBe(0);
    await Bun.write(join(path, "destination.txt"), "destination\n");
    expect((await jj(["rebase", "-s", "main", "-d", "@"], path)).code).toBe(0);
    expect((await jj(["status"], dir)).err).toContain("working copy is stale");
    const r = await ws(["refresh", "stale"], path);
    expect(r.code, r.err).toBe(0);
    expect((await jj(["status"], dir)).code).toBe(0);
    expect((await jj(["sparse", "list"], dir)).out.trim()).toBe(
      "a.txt\nready.out",
    );
    expect(await Bun.file(join(dir, "ready.out")).text()).toBe("ready\n");
    expect((await ws(["refresh", "stale"], path)).code).toBe(0);
  });

  test("refuses missing and invalid slugs", async () => {
    const path = await repo();
    expect((await ws(["refresh", "missing"], path)).code).toBe(1);
    expect((await ws(["refresh", "bad/slug"], path)).code).toBe(1);
  });
});

describe("ws rm", () => {
  test("removes a landed workspace: forgotten and ripped", async () => {
    const path = await repo('trunk = "main"\n');
    await ws(["add", "clean"], path);
    const r = await ws(["rm", "clean"], path);
    expect(r.code).toBe(0);
    expect(existsSync(wsDir(path, "clean"))).toBe(false);
    expect((await jj(["workspace", "list"], path)).out).not.toContain(
      "ws_clean",
    );
  });

  test("refuses an unlanded commit and an uncommitted edit; nothing is lost", async () => {
    const path = await repo('trunk = "main"\n');
    await ws(["add", "dirty"], path);
    const dir = wsDir(path, "dirty");
    writeFileSync(join(dir, "work.txt"), "w\n");
    const edit = await ws(["rm", "dirty"], path);
    expect(edit.code).toBe(1);
    expect(edit.err).toContain("unlanded");
    expect(existsSync(join(dir, "work.txt"))).toBe(true);
    await jj(["commit", "-m", "work"], dir);
    const committed = await ws(["rm", "dirty"], path);
    expect(committed.code).toBe(1);
    expect(existsSync(join(dir, "work.txt"))).toBe(true);
    expect((await jj(["workspace", "list"], path)).out).toContain("ws_dirty");
  });

  test("refuses when the graveyard is RAM-backed", async () => {
    const path = await repo('trunk = "main"\n');
    await ws(["add", "ram"], path);
    const r = await ws(["rm", "ram"], path, baseEnv({ FAKE_FS: "ramfs" }));
    expect(r.code).toBe(1);
    expect(existsSync(wsDir(path, "ram"))).toBe(true);
  });
});

describe("ws gc", () => {
  test("reports narrowed sparse patterns even for an unrecorded workspace", async () => {
    const path = await repo('trunk = "main"\n');
    expect((await ws(["add", "narrow"], path)).code).toBe(0);
    const dir = wsDir(path, "narrow");
    expect(
      (await jj(["sparse", "set", "--clear", "--add", "a.txt"], dir)).code,
    ).toBe(0);
    setRecords([]);
    const r = await ws(["gc", "--dry-run"], path);
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain(`keep\t${dir}\t`);
    expect(r.out).toContain("sparse");
    expect(r.out).toContain("a.txt");
    expect((await jj(["sparse", "list"], dir)).out.trim()).toBe("a.txt");
  });

  const rec = (path: string, slug: string, over: object) => ({
    id: `run-${slug}`,
    state: "ended",
    cwd: wsDir(path, slug),
    workspace: wsDir(path, slug),
    continues: null,
    ...over,
  });

  test("collects exactly terminal lineages with nothing unlanded; keeps live, continuing, unlanded", async () => {
    const path = await repo('trunk = "main"\n');
    for (const s of ["done", "live", "cont", "dirty", "orph"])
      await ws(["add", s], path);
    writeFileSync(join(wsDir(path, "dirty"), "w.txt"), "w\n");
    setRecords([
      rec(path, "done", {}),
      rec(path, "live", { state: "running" }),
      rec(path, "cont", { id: "run-cont-1" }),
      {
        ...rec(path, "cont", {
          id: "run-cont-2",
          state: "running",
          continues: "run-cont-1",
        }),
        cwd: "/elsewhere",
        workspace: "/elsewhere",
      },
      rec(path, "dirty", {}),
      rec(path, "orph", { state: "orphaned" }),
    ]);
    const dry = await ws(["gc", "--dry-run"], path);
    expect(dry.code).toBe(0);
    const verdict = Object.fromEntries(
      dry.out
        .trim()
        .split("\n")
        .map((l) => l.split("\t"))
        .map(([v, d]) => [d?.split("/").pop() ?? "", v ?? ""] as const),
    );
    expect(verdict).toEqual({
      ws_done: "would-collect",
      ws_live: "keep",
      ws_cont: "keep",
      ws_dirty: "keep",
      ws_orph: "would-collect",
    });
    for (const s of ["done", "live", "cont", "dirty", "orph"])
      expect(existsSync(wsDir(path, s))).toBe(true);
    const real = await ws(["gc"], path);
    expect(real.code).toBe(0);
    expect(existsSync(wsDir(path, "done"))).toBe(false);
    expect(existsSync(wsDir(path, "orph"))).toBe(false);
    for (const s of ["live", "cont", "dirty"])
      expect(existsSync(wsDir(path, s))).toBe(true);
    expect(existsSync(join(wsDir(path, "dirty"), "w.txt"))).toBe(true);
    expect(listing(join(path, "..", "proj.ws"))).toEqual([
      "ws_cont",
      "ws_dirty",
      "ws_live",
    ]);
  });

  test("an unlanded run-end commit keeps a workspace whose working copy now looks clean", async () => {
    const path = await repo('trunk = "main"\n');
    await ws(["add", "ended"], path);
    const dir = wsDir(path, "ended");
    writeFileSync(join(dir, "w.txt"), "w\n");
    await jj(["commit", "-m", "run work"], dir);
    const end = (
      await jj(["log", "--no-graph", "-r", "@-", "-T", "commit_id"], dir)
    ).out.trim();
    await jj(["new", "main"], dir);
    setRecords([rec(path, "ended", { end_commit: end })]);
    const r = await ws(["gc"], path);
    expect(r.code).toBe(0);
    expect(r.out).toContain("keep");
    expect(existsSync(dir)).toBe(true);
  });

  test("unrecorded workspaces are reported, collected only with --include-unrecorded and no diff", async () => {
    const path = await repo('trunk = "main"\n');
    await ws(["add", "clean"], path);
    await ws(["add", "diff"], path);
    writeFileSync(join(wsDir(path, "diff"), "w.txt"), "w\n");
    setRecords([]);
    const dry = await ws(["gc", "--dry-run"], path);
    expect(dry.out).toContain("unrecorded");
    expect(dry.out).not.toContain("would-collect");
    const plain = await ws(["gc"], path);
    expect(plain.code).toBe(0);
    expect(existsSync(wsDir(path, "clean"))).toBe(true);
    const wide = await ws(["gc", "--include-unrecorded"], path);
    expect(wide.code).toBe(0);
    expect(existsSync(wsDir(path, "clean"))).toBe(false);
    expect(existsSync(wsDir(path, "diff"))).toBe(true);
  });

  test("a legacy sibling directory is reported as unrecorded", async () => {
    const path = await repo('trunk = "main"\n');
    const legacy = join(path, "..", "proj-ws-old");
    expect(
      (await jj(["workspace", "add", "--name", "old", legacy], path)).code,
    ).toBe(0);
    const dry = await ws(["gc", "--dry-run"], path);
    expect(dry.out).toContain(`keep\t${legacy}\tunrecorded`);
    expect((await ws(["gc", "--include-unrecorded"], path)).code).toBe(0);
    expect(existsSync(legacy)).toBe(false);
  });

  test("refuses, even as a dry run, when the graveyard is RAM-backed or agx fails", async () => {
    const path = await repo('trunk = "main"\n');
    const ram = await ws(
      ["gc", "--dry-run"],
      path,
      baseEnv({ FAKE_FS: "tmpfs" }),
    );
    expect(ram.code).toBe(1);
    expect(ram.err).toContain("RAM-backed");
    shim("agx", "echo broken >&2; exit 3");
    const broken = await ws(["gc", "--dry-run"], path);
    expect(broken.code).toBe(1);
    shim("agx", `cat "${records}"`);
  });
});
