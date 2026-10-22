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
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";
import { mkdir, chmod, unlink, lstat, symlink } from "node:fs/promises";
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
  AGX_STATE_DIR: join(home, "state/agx"),
  AGX_NEXT_STATE_DIR: "",
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
const pathExists = (dir: string): Promise<boolean> =>
  lstat(dir).then(
    () => true,
    () => false,
  );

describe("WS-CONFIG-ONE-SOURCE-1023", () => {
  for (const source of [
    "untracked-only",
    "committed-only",
    "working-over-committed",
  ]) {
    test(`${source}: add, rm, gc and doctor share readiness, trunk and keep policy`, async () => {
      const policy =
        'trunk = "main"\nready = ["printf chosen-ready"]\nkeep = ["ws_safe"]\n';
      const committed = source === "committed-only" ? policy : undefined;
      const path = await repo(
        source === "working-over-committed"
          ? 'trunk = "missing-trunk"\nready = ["printf wrong-ready"]\nkeep = ["ws_other"]\n'
          : committed,
      );
      if (source === "untracked-only")
        await Bun.write(join(path, ".gitignore"), "/.ws.toml\n");
      if (source === "committed-only") await unlink(join(path, ".ws.toml"));
      else await Bun.write(join(path, ".ws.toml"), policy);

      const added = await ws(["add", "safe"], path);
      expect(added.code, added.err).toBe(0);
      expect(added.out).toContain("chosen-ready");
      expect(added.out).not.toContain("wrong-ready");
      if (source === "untracked-only") {
        const tracked = await jj(["file", "list"], path);
        expect(tracked.code, tracked.err).toBe(0);
        expect(tracked.out).not.toContain(".ws.toml");
      }
      if (source === "committed-only")
        expect(existsSync(join(path, ".ws.toml"))).toBe(false);
      const safe = wsDir(path, "safe");
      // Doctor discovers checkout gitdir files; advertise the secondary fixture.
      await Bun.write(join(safe, ".git"), `gitdir: ${join(path, ".git")}\n`);
      // A secondary checkout's file is never the policy source, even when invoked there.
      await Bun.write(
        join(safe, ".ws.toml"),
        'trunk = "wrong-checkout"\nkeep = []\n',
      );
      const refused = await ws(["rm", "safe"], safe);
      expect(refused.code, refused.err).toBe(1);
      expect(refused.err).toContain("is kept by .ws.toml");
      const dry = await ws(["gc", "--dry-run", "--include-unrecorded"], safe);
      expect(dry.code, dry.err).toBe(0);
      expect(dry.out).toContain(`${safe}\tws\tkept\t`);

      const inventory = `import { doctorInventory } from ${JSON.stringify(join(import.meta.dir, "../src/workspace.ts"))}; console.log(JSON.stringify(await doctorInventory()));`;
      const doctor = await run(
        ["bun", "-e", inventory],
        safe,
        baseEnv({
          AGX_REPOS_ROOT: join(path, "..", "proj.ws"),
        }),
      );
      expect(doctor.code, doctor.err).toBe(0);
      expect(doctor.out).toContain('"ok":true');
      expect(doctor.out).toContain('"name":"ws_safe"');
      expect(doctor.out).toContain('"verdict":"kept"');

      // Include an eligible candidate so real GC also exercises its locked config refresh.
      const spare = await ws(["add", "spare"], path);
      expect(spare.code, spare.err).toBe(0);
      expect(spare.out).toContain("chosen-ready");
      const collected = await ws(["gc", "--include-unrecorded"], safe);
      expect(collected.code, collected.err).toBe(0);
      expect(collected.out).toContain(`${safe}\tws\tkept\t`);
      expect(collected.out).toContain(
        `${wsDir(path, "spare")}\tws\tcollected\t`,
      );
      expect(existsSync(safe)).toBe(true);
      expect(existsSync(wsDir(path, "spare"))).toBe(false);
    });
  }

  test("invalid working policy fails closed instead of using committed policy", async () => {
    const path = await repo('trunk = "main"\n');
    expect((await ws(["add", "safe"], path)).code).toBe(0);
    await Bun.write(
      join(wsDir(path, "safe"), ".git"),
      `gitdir: ${join(path, ".git")}\n`,
    );
    await Bun.write(join(path, ".ws.toml"), 'keep = "invalid"\n');
    for (const args of [
      ["add", "other"],
      ["rm", "safe"],
      ["gc", "--include-unrecorded"],
    ]) {
      const result = await ws(args, path);
      expect(result.code, result.err).toBe(1);
      expect(result.err).toContain(".ws.toml");
    }
    const doctor = await ws(
      ["doctor"],
      path,
      baseEnv({ AGX_REPOS_ROOT: join(path, "..", "proj.ws") }),
    );
    expect(doctor.code, doctor.err).toBe(1);
    expect(doctor.err).toContain(".ws.toml");
    expect(existsSync(wsDir(path, "safe"))).toBe(true);
  });
});

describe("agx ws adopt", () => {
  test("WS-ADOPT-2: strips layout prefixes, preserves run suffixes and re-homes adopted changes", async () => {
    const path = await repo('trunk = "main"\n');
    for (const [old, slug] of [
      ["proj-arm-foo_bar", "foo-bar"],
      ["proj-ws-run_name-deadbeef", "run-name-deadbeef"],
      ["dotfiles-arm-impl_learner", "impl-learner"],
      ["proj.ws/ws_proj-arm-foo", "foo"],
    ]) {
      const dir = join(path, "..", old ?? "");
      await mkdir(join(dir, ".."), { recursive: true });
      expect(
        (await jj(["workspace", "add", "--name", `old-${slug}`, dir], path))
          .code,
      ).toBe(0);
      await Bun.write(join(dir, "work.txt"), `${old}\n`);
      const before = await jj(
        ["log", "--no-graph", "-r", "@", "-T", "change_id"],
        dir,
      );
      const moved = await ws(["adopt", dir], path);
      expect(moved.code, moved.err + moved.out).toBe(0);
      const target = wsDir(path, slug ?? "");
      expect(
        (await jj(["log", "--no-graph", "-r", "@", "-T", "change_id"], target))
          .out,
      ).toBe(before.out);
      expect(await Bun.file(join(target, "work.txt")).text()).toBe(`${old}\n`);
      expect(await pathExists(dir)).toBe(false);
    }
  });

  test("WS-ADOPT-2: fix-names plans and moves only prefixed adopted workspaces", async () => {
    const path = await repo('trunk = "main"\n');
    for (const slug of ["proj-arm-one", "proj-arm-two-deadbeef", "retained"])
      expect((await ws(["add", slug], path)).code).toBe(0);
    const old = wsDir(path, "proj-arm-one");
    const before = await jj(
      ["log", "--no-graph", "-r", "@", "-T", "change_id"],
      old,
    );
    const dry = await ws(
      ["adopt", "--fix-names", "--repo", path, "--dry-run"],
      path,
    );
    expect(dry.code, dry.err).toBe(0);
    expect(dry.out.split("\n").filter(Boolean)).toHaveLength(2);
    expect(dry.out).toContain(`${old}\t${wsDir(path, "one")}\twould-adopt`);
    const moved = await ws(["adopt", "--fix-names", "--repo", path], path);
    expect(moved.code, moved.err + moved.out).toBe(0);
    expect(
      (
        await jj(
          ["log", "--no-graph", "-r", "@", "-T", "change_id"],
          wsDir(path, "one"),
        )
      ).out,
    ).toBe(before.out);
    expect(await pathExists(wsDir(path, "two-deadbeef"))).toBe(true);
    expect(await pathExists(wsDir(path, "retained"))).toBe(true);
    expect(await pathExists(old)).toBe(false);
    for (const args of [
      ["--fix-names"],
      ["--fix-names", "--all", "--repo", path],
      ["--fix-names", "--repo", path, old],
      ["--fix-names", "--repo", path, "--slug", "x"],
    ])
      expect((await ws(["adopt", ...args], path)).code).toBe(1);
  });

  test("WS-ADOPT-2: every failure after add removes registration and directory, retaining source", async () => {
    const realJj = Bun.which("jj");
    expect(realJj).not.toBeNull();
    for (const stage of ["add", "edit", "status", "diff", "forget", "bury"]) {
      const path = await repo('trunk = "main"\n');
      const dir = join(path, "..", "proj-arm-failure");
      expect(
        (await jj(["workspace", "add", "--name", "legacy", dir], path)).code,
      ).toBe(0);
      await Bun.write(join(dir, "work.txt"), "retain source\n");
      const before = await jj(
        ["log", "--no-graph", "-r", "@", "-T", "change_id"],
        dir,
      );
      const registered = await jj(
        ["--ignore-working-copy", "workspace", "list"],
        path,
      );
      const tree = listing(join(path, ".."));
      const wrapper = join(scratch, `fail-${stage}`);
      await mkdir(wrapper);
      await Bun.write(
        join(wrapper, "jj"),
        `#!/usr/bin/env bun
const args = process.argv.slice(2);
const stage = ${JSON.stringify(stage)};
const target = ${JSON.stringify(wsDir(path, "failure"))};
const fail = (stage === "edit" || stage === "status" || stage === "diff") && process.cwd() === target && args.includes(stage)
  || stage === "forget" && args.includes("forget") && args.includes("legacy");
if (fail) { process.stderr.write("injected Entry too large\\n"); process.exit(1); }
const child = Bun.spawn([${JSON.stringify(realJj)}, ...args], {stdout:"inherit",stderr:"inherit"});
const code = await child.exited;
process.exitCode = stage === "add" && args.includes("add") && code === 0 ? 1 : code;
`,
      );
      await chmod(join(wrapper, "jj"), 0o755);
      if (stage === "bury") {
        await Bun.write(
          join(wrapper, "rip"),
          "#!/bin/sh\necho 'injected burial failure' >&2\nexit 1\n",
        );
        await chmod(join(wrapper, "rip"), 0o755);
      }
      const failed = await ws(
        ["adopt", dir],
        path,
        baseEnv({ PATH: `${wrapper}:${bin}:${process.env.PATH}` }),
      );
      expect(failed.code, failed.out + failed.err).toBe(1);
      expect(failed.out).toContain("new workspace removed");
      expect(
        (await jj(["--ignore-working-copy", "workspace", "list"], path)).out,
      ).toBe(registered.out);
      expect(listing(join(path, ".."))).toEqual(tree);
      expect(await pathExists(wsDir(path, "failure"))).toBe(false);
      expect(
        (await jj(["log", "--no-graph", "-r", "@", "-T", "change_id"], dir))
          .out,
      ).toBe(before.out);
      expect(await Bun.file(join(dir, "work.txt")).text()).toBe(
        "retain source\n",
      );
    }
  });

  test("dry-run inventories forgotten and plain orphan directories without adopting them", async () => {
    const path = await repo('trunk = "main"\n');
    const parent = join(path, "..");
    const equal = join(parent, "proj-arm-equal");
    const changed = join(parent, "proj-arm-changed");
    const plain = join(parent, "proj-arm-plain");
    const nested = join(parent, "proj-ws", "orphan");
    const crossNamed = join(parent, "dotfiles-arm-impl_learner");
    for (const [name, dir] of [
      ["equal", equal],
      ["changed", changed],
      ["cross-named", crossNamed],
    ] as const) {
      expect(
        (
          await jj(
            ["workspace", "add", "--name", name, "-r", "main", dir],
            path,
          )
        ).code,
      ).toBe(0);
      expect((await jj(["workspace", "forget", name], path)).code).toBe(0);
    }
    await Bun.write(join(changed, "a.txt"), new Uint8Array([0, 255, 128]));
    await mkdir(plain);
    await mkdir(nested, { recursive: true });
    await Bun.write(join(plain, "leftover.txt"), "owner decision\n");
    const op = () =>
      jj(
        [
          "--ignore-working-copy",
          "op",
          "log",
          "--no-graph",
          "-n",
          "1",
          "-T",
          "id",
        ],
        path,
      );
    const before = await op();
    const dry = await ws(["adopt", "--all", "--repo", path, "--dry-run"], path);
    expect(dry.code, dry.err).toBe(0);
    expect(dry.out.split("\n").filter(Boolean)).toHaveLength(5);
    expect(dry.out).toContain(
      `${crossNamed}\t${wsDir(path, "impl-learner")}\torphan:`,
    );
    expect(dry.out).toContain(
      `${equal}\t${wsDir(path, "equal")}\torphan: files differ from main: no`,
    );
    expect(dry.out).toContain(
      `${changed}\t${wsDir(path, "changed")}\torphan: files differ from main: yes: bytes differ at a.txt`,
    );
    expect(dry.out).toContain(`${plain}\t${wsDir(path, "plain")}\torphan:`);
    expect(dry.out).toContain(`${nested}\t${wsDir(path, "orphan")}\torphan:`);
    expect((await op()).out).toBe(before.out);
    expect((await ws(["adopt", equal], path)).code).toBe(1);
    const actual = await ws(["adopt", "--all", "--repo", path], path);
    expect(actual.code, actual.err).toBe(0);
    expect(actual.out).toBe("");
    expect(await Bun.file(join(equal, "a.txt")).text()).toBe("a\n");
    expect(await Bun.file(join(plain, "leftover.txt")).text()).toBe(
      "owner decision\n",
    );
  });

  test("WS-ADOPT: unlanded and nested workspaces move intact; kept and live ones are refused", async () => {
    const path = await repo('trunk = "main"\nkeep = ["../Legacy_Kept"]\n');
    const parent = join(path, "..");
    const old = [
      "Legacy_Unlanded",
      "Legacy_Kept",
      "Legacy_Live",
      "plain/Nested_Work",
    ];
    await mkdir(join(parent, "plain"));
    const changes: string[] = [];
    for (const [i, name] of old.entries()) {
      const dir = join(parent, name);
      expect(
        (await jj(["workspace", "add", "--name", `legacy-${i}`, dir], path))
          .code,
      ).toBe(0);
      await Bun.write(join(dir, "unlanded.txt"), `${name}\n`);
      const change = await jj(
        ["log", "--no-graph", "-r", "@", "-T", "change_id"],
        dir,
      );
      expect(change.code, change.err).toBe(0);
      changes.push(change.out);
    }
    const live = join(parent, "Legacy_Live", "inside");
    await mkdir(live);
    const child = Bun.spawn(["sleep", "30"], {
      cwd: live,
      stdout: "ignore",
      stderr: "ignore",
      timeout: 35_000,
    });
    await Bun.sleep(100);
    const dry = await ws(["adopt", "--all", "--repo", path, "--dry-run"], path);
    const moved = await ws(["adopt", "--all", "--repo", path], path);
    child.kill();
    await child.exited;
    expect(dry.code, dry.err).toBe(0);
    expect(dry.out.split("\n").filter(Boolean)).toHaveLength(4);
    expect(dry.out).toContain("would-adopt");
    expect(dry.out).toContain('kept by .ws.toml keep: "../Legacy_Kept"');
    expect(dry.out).toContain("processes are working inside");
    expect(moved.code).toBe(1);
    expect(moved.out).toContain("processes are working inside");
    expect(moved.out).toContain("kept by .ws.toml");
    const registered = await jj(["workspace", "list"], path);
    for (const [i, slug] of [
      [0, "legacy-unlanded"],
      [3, "nested-work"],
    ] as const) {
      const target = wsDir(path, slug);
      expect(registered.out).toContain(`ws_${slug}`);
      expect((await jj(["status"], target)).code).toBe(0);
      expect(
        (
          await jj(["workspace", "root", "--name", `ws_${slug}`], path)
        ).out.trim(),
      ).toBe(target);
      expect(
        (await jj(["log", "--no-graph", "-r", "@", "-T", "change_id"], target))
          .out,
      ).toBe(changes[i] ?? "missing change id");
      expect(await Bun.file(join(target, "unlanded.txt")).text()).toBe(
        `${old[i]}\n`,
      );
      expect(
        await Bun.file(join(parent, old[i] ?? "", ".jj", "repo")).exists(),
      ).toBe(false);
    }
    for (const name of ["Legacy_Kept", "Legacy_Live"])
      expect((await jj(["status"], join(parent, name))).code).toBe(0);
    const kept = await ws(
      [
        "adopt",
        join(parent, "Legacy_Kept"),
        "--include-kept",
        "--slug",
        "Chosen_Name",
      ],
      path,
    );
    expect(kept.code, kept.err).toBe(0);
    expect(kept.out).toContain(
      'update .ws.toml keep "../Legacy_Kept" to "../proj.ws/ws_chosen-name"',
    );
    expect((await jj(["status"], wsDir(path, "chosen-name"))).code).toBe(0);
  });

  test("dry run leaves files and operation unchanged; refuses collisions and invalid selection", async () => {
    const path = await repo();
    const dir = join(path, "..", "Legacy");
    expect(
      (await jj(["workspace", "add", "--name", "legacy", dir], path)).code,
    ).toBe(0);
    const op = () =>
      jj(
        [
          "--ignore-working-copy",
          "op",
          "log",
          "--no-graph",
          "-n",
          "1",
          "-T",
          "id",
        ],
        path,
      );
    const before = await op();
    const pointer = await Bun.file(join(dir, ".jj", "repo")).text();
    const dry = await ws(["adopt", dir, "--dry-run"], path);
    expect(dry.code, dry.err).toBe(0);
    expect(dry.out).toContain(`${dir}\t${wsDir(path, "legacy")}\twould-adopt`);
    expect((await op()).out).toBe(before.out);
    expect(await Bun.file(join(dir, ".jj", "repo")).text()).toBe(pointer);
    await mkdir(wsDir(path, "legacy"), { recursive: true });
    await Bun.write(join(wsDir(path, "legacy"), "sentinel"), "retain");
    const conflict = await ws(["adopt", dir], path);
    expect(conflict.code).toBe(1);
    expect(conflict.out).toContain("target already exists");
    expect(await Bun.file(join(wsDir(path, "legacy"), "sentinel")).text()).toBe(
      "retain",
    );
    expect((await jj(["status"], dir)).code).toBe(0);
    for (const args of [
      ["adopt"],
      ["adopt", "--all"],
      ["adopt", "--all", "--repo", path, dir],
      ["adopt", path],
      ["adopt", "--all", "--repo", path, "--slug", "x"],
    ])
      expect((await ws(args, path)).code).toBe(1);
  });
});

describe("agx ws add", () => {
  test("JSON output stays machine readable through install chatter and reuse", async () => {
    const chatter =
      "30 packages installed …\n/home/fuyu/dotfiles.ws/ws_fleet-line-real'\n";
    const command = `printf '%s' '${chatter.replaceAll("'", "'\\''")}'`;
    const path = await repo(`ready = [${JSON.stringify(command)}]\n`);
    const created = await ws(["add", "fleet-line-real", "--json"], path);
    expect(created.code, created.err).toBe(0);
    expect(created.out).toBe(
      `${JSON.stringify({ workspace: wsDir(path, "fleet-line-real") })}\n`,
    );
    expect(created.err).toContain(chatter);
    const reused = await ws(
      ["add", "fleet-line-real", "--reuse", "--json"],
      path,
    );
    expect(reused.code, reused.err).toBe(0);
    expect(reused.out).toBe(created.out);
    expect(reused.err).not.toContain(chatter);
  });

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

  test("add leaves verdict publication to explicit gc outside the repository and workspace directory", async () => {
    const path = await repo('trunk = "main"\n');
    const state = join(scratch, "explicit-verdict-state");
    const env = baseEnv({ AGX_NEXT_STATE_DIR: state });
    const verdictPath = join(state, "workspace-verdicts.json");
    const before = listing(join(path, ".."));
    const added = await ws(["add", "s1"], path, env);
    expect(added.code, added.err).toBe(0);
    expect(listing(join(path, "..", "proj.ws"))).toEqual(["ws_s1"]);
    expect(
      listing(join(path, "..")).filter((n) => !before.includes(n)),
    ).toEqual(["proj.ws"]);
    expect(await Bun.file(verdictPath).exists()).toBe(false);
    const observed = await ws(["gc", "--dry-run"], path, env);
    expect(observed.code, observed.err).toBe(0);
    expect(await Bun.file(verdictPath).exists()).toBe(true);
    const observation = jsonOf(
      z.object({ fleetComplete: z.boolean() }),
    ).safeParse(await Bun.file(verdictPath).text());
    expect(observation).toMatchObject({
      success: true,
      data: { fleetComplete: false },
    });
  });

  test("WS-ADD-HANG: mise exits with retained pipes, then add returns the readiness status", async () => {
    const path = await repo(`ready = ["exit 7"]\n`);
    await Bun.write(join(path, "mise.toml"), "# fixture\n");
    expect((await jj(["commit", "-m", "mise fixture"], path)).code).toBe(0);
    const pidFile = join(scratch, "retained-pipe.pid");
    shim("mise", `sleep 30 & echo $! > "${pidFile}"; exit 0`);
    const started = performance.now();
    const r = await ws(["add", "retained-pipe"], path);
    process.kill(Number(await Bun.file(pidFile).text()), "SIGKILL");
    await unlink(join(bin, "mise"));
    expect(r.code, r.err).toBe(7);
    expect(r.err).toContain("readiness command failed (exit 7): exit 7");
    expect(performance.now() - started).toBeLessThan(5_000);
    expect(existsSync(wsDir(path, "retained-pipe"))).toBe(false);
  });

  test("a failing readiness command is loud, non-zero, and leaves no workspace", async () => {
    const path = await repo('ready = ["echo boom >&2; exit 7"]\n');
    const r = await ws(["add", "bad"], path);
    expect(r.code).toBe(7);
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
    const reused = await ws(["add", "dup", "--reuse"], path);
    expect(reused.code, reused.err).toBe(0);
    expect(reused.out.trim()).toBe(wsDir(path, "dup"));
  });

  test("new workspace slugs use hyphens; legacy names remain refreshable", async () => {
    const path = await repo();
    for (const slug of ["arena_g3", "Arena-G3"]) {
      const refused = await ws(["add", slug], path);
      expect(refused.code).toBe(1);
      expect(refused.err).toContain("agx ws add arena-g3");
      expect(await Bun.file(join(wsDir(path, slug), ".jj/repo")).exists()).toBe(
        false,
      );
    }
    const accepted = await ws(["add", "arena-g3"], path);
    expect(accepted.code, accepted.err).toBe(0);
    expect(accepted.out).toContain("ws_arena-g3");
    const legacy = wsDir(path, "old_name");
    expect(
      (await jj(["workspace", "add", "--name", "ws_old_name", legacy], path))
        .code,
    ).toBe(0);
    expect((await ws(["refresh", "old_name"], path)).code).toBe(0);
    expect((await jj(["workspace", "list"], path)).out).toContain(
      "ws_old_name",
    );
  });
});

describe("agx ws refresh", () => {
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

describe("agx ws rm", () => {
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

describe("agx ws gc", () => {
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
    expect(r.out).toContain(`${dir}\tws\tkeep\t`);
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
    judgment: { decision: "reject" },
    ...over,
  });

  test("collects exactly terminal lineages with nothing unlanded; keeps live, continuing, unlanded", async () => {
    const path = await repo('trunk = "main"\n');
    for (const s of ["done", "live", "cont", "dirty", "orph"])
      await ws(["add", s], path);
    writeFileSync(join(wsDir(path, "dirty"), "w.txt"), "w\n");
    // Dry-run classification reads saved jj state; explicitly snapshot this fixture's work.
    expect((await jj(["status"], wsDir(path, "dirty"))).code).toBe(0);
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
        .map(([d, , v]) => [d?.split("/").pop() ?? "", v ?? ""] as const),
    );
    expect(verdict).toEqual({
      ws_done: "empty",
      ws_live: "keep",
      ws_cont: "keep",
      ws_dirty: "unlanded",
      ws_orph: "empty",
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
    expect(r.out).toContain("unlanded");
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

  test("legacy workspaces require --legacy even with --include-unrecorded", async () => {
    const path = await repo('trunk = "main"\n');
    const legacy = join(path, "..", "proj-ws-old");
    expect(
      (await jj(["workspace", "add", "--name", "old", legacy], path)).code,
    ).toBe(0);
    const dry = await ws(["gc", "--dry-run"], path);
    expect(dry.out).toContain(`${legacy}\tlegacy\tempty\t`);
    expect((await ws(["gc", "--include-unrecorded"], path)).code).toBe(0);
    expect(existsSync(legacy)).toBe(true);
    expect((await ws(["gc", "--legacy"], path)).code).toBe(0);
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

describe("WS-GC-JJ-LIST", () => {
  test("enumerates six registered layouts, repairs stale, protects keep, forgets before rip", async () => {
    const path = await repo('trunk = "main"\nkeep = ["precious"]\n');
    setRecords([]);
    expect((await ws(["add", "modern"], path)).code).toBe(0);
    const dirs = {
      modern: wsDir(path, "modern"),
      empty: join(scratch, "legacy-empty"),
      landed: join(scratch, "arbitrary-layout", "landed"),
      unlanded: join(scratch, "Workspace", "proj-arm-work"),
      stale: join(scratch, "proj-arm-agx-stale"),
      precious: join(scratch, "owner-must-keep"),
    };
    await mkdir(join(scratch, "arbitrary-layout"), { recursive: true });
    await mkdir(join(scratch, "Workspace"), { recursive: true });
    for (const name of [
      "empty",
      "landed",
      "unlanded",
      "stale",
      "precious",
    ] as const) {
      const added = await jj(
        ["workspace", "add", "--name", name, "-r", "main", dirs[name]],
        path,
      );
      expect(added.code, added.err).toBe(0);
    }
    // A squash-style landing: the same diff on a different commit, without ancestry.
    await Bun.write(join(dirs.landed, "landed.txt"), "landed work\n");
    expect((await jj(["status"], dirs.landed)).code).toBe(0);
    await Bun.write(join(path, "landed.txt"), "landed work\n");
    expect((await jj(["commit", "-m", "squash landing"], path)).code).toBe(0);
    expect((await jj(["bookmark", "set", "main", "-r", "@-"], path)).code).toBe(
      0,
    );
    await Bun.write(join(dirs.unlanded, "unlanded.txt"), "must survive\n");
    await Bun.write(join(dirs.stale, "stale.txt"), "stale work\n");
    expect((await jj(["status"], dirs.stale)).code).toBe(0);
    expect((await jj(["status"], dirs.unlanded)).code).toBe(0);
    expect(
      (await jj(["restore", "--from", "unlanded@", "--to", "stale@"], path))
        .code,
    ).toBe(0);
    expect((await jj(["status"], dirs.stale)).err).toContain(
      "working copy is stale",
    );
    const outsider = await repo('trunk = "main"\n');
    expect((await ws(["add", "outside"], outsider)).code).toBe(0);
    const outsideBefore = (await jj(["workspace", "list"], outsider)).out;
    const dry = await ws(["gc", "--dry-run", "--legacy"], path);
    expect(dry.code, dry.err).toBe(0);
    const rows = dry.out
      .trim()
      .split("\n")
      .map((line) => line.split("\t"));
    expect(rows).toHaveLength(6);
    const machine = await ws(["gc", "--dry-run", "--legacy", "--json"], path);
    expect(machine.code, machine.err).toBe(0);
    expect(
      jsonOf(
        z.object({
          counts: z.object({
            total: z.number(),
            unlanded: z.number(),
            collectable: z.number(),
            legacy: z.number(),
          }),
          complete: z.boolean(),
        }),
      ).safeParse(machine.out),
    ).toMatchObject({
      success: true,
      data: {
        counts: { total: 6, unlanded: 2, collectable: 3, legacy: 5 },
        complete: true,
      },
    });
    expect(
      Object.fromEntries(
        rows.map(([dir, kind, verdict]) => [dir, [kind, verdict]]),
      ),
    ).toEqual({
      [dirs.modern]: ["ws", "empty"],
      [dirs.empty]: ["legacy", "empty"],
      [dirs.landed]: ["legacy", "landed"],
      [dirs.unlanded]: ["legacy", "unlanded"],
      [dirs.stale]: ["legacy", "unlanded"],
      [dirs.precious]: ["legacy", "kept"],
    });
    // Inventory is read-only and must leave repair to an explicit mutation.
    expect((await jj(["status"], dirs.stale)).err).toContain(
      "working copy is stale",
    );
    expect((await jj(["workspace", "update-stale"], dirs.stale)).code).toBe(0);
    for (const dir of Object.values(dirs))
      expect(await Bun.file(join(dir, "a.txt")).exists()).toBe(true);
    const plain = await ws(["gc"], path);
    expect(plain.code, plain.err).toBe(0);
    expect(await Bun.file(join(dirs.empty, "a.txt")).exists()).toBe(true);

    // A real executable shim refuses burial unless jj has already forgotten that path.
    const tracedBin = join(scratch, "traced-bin");
    await mkdir(tracedBin);
    const trace = join(scratch, "rip-trace");
    const rip = Bun.which("rip");
    expect(rip).not.toBeNull();
    const wrapper = join(tracedBin, "rip");
    await Bun.write(
      wrapper,
      `#!/usr/bin/env bun
const p = Bun.spawn(["jj", "-R", ${JSON.stringify(path)}, "--ignore-working-copy", "workspace", "list", "-T", 'root ++ "\\n"'], {stdout:"pipe",stderr:"pipe"});
const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
if (code !== 0 || out.split("\\n").includes(process.argv[2])) { process.stderr.write(err || "workspace still registered"); process.exit(9); }
const old = Bun.file(${JSON.stringify(trace)}); await Bun.write(old, ((await old.exists()) ? await old.text() : "") + process.argv[2] + "\\n");
const child = Bun.spawn([${JSON.stringify(rip)}, ...process.argv.slice(2)], {stdout:"inherit",stderr:"inherit"}); process.exit(await child.exited);
`,
    );
    await chmod(wrapper, 0o755);
    const collected = await ws(
      ["gc", "--legacy"],
      path,
      baseEnv({ PATH: `${tracedBin}:${bin}:${process.env.PATH}` }),
    );
    expect(collected.code, collected.err).toBe(0);
    expect(
      (await Bun.file(trace).text()).trim().split("\n").toSorted(),
    ).toEqual([dirs.empty, dirs.landed].toSorted());
    const registered = (
      await jj(["workspace", "list", "-T", 'name ++ "\\n"'], path)
    ).out
      .trim()
      .split("\n");
    expect(registered).toEqual([
      "default",
      "precious",
      "stale",
      "unlanded",
      "ws_modern",
    ]);
    for (const name of ["empty", "landed"] as const)
      expect(await Bun.file(join(dirs[name], "a.txt")).exists()).toBe(false);
    for (const name of ["modern", "unlanded", "stale", "precious"] as const)
      expect(await Bun.file(join(dirs[name], "a.txt")).exists()).toBe(true);
    expect(collected.out).toContain(`${dirs.unlanded}\tlegacy\tunlanded\t`);
    expect(await Bun.file(join(dirs.unlanded, "unlanded.txt")).text()).toBe(
      "must survive\n",
    );
    expect((await jj(["workspace", "list"], outsider)).out).toBe(outsideBefore);
    expect(
      await Bun.file(join(wsDir(outsider, "outside"), "a.txt")).exists(),
    ).toBe(true);
  });

  test("uses jj trunk(), keeps root-only repos unclassified, and reads working keep paths", async () => {
    const path = await repo('keep = ["../proj.ws/ws_safe"]\n');
    const configured = await jj(
      ["config", "set", "--repo", 'revset-aliases."trunk()"', "main"],
      path,
    );
    expect(configured.code, configured.err).toBe(0);
    expect((await ws(["add", "safe"], path)).code).toBe(0);
    expect((await ws(["add", "ancestor"], path)).code).toBe(0);
    await Bun.write(join(path, ".ws.toml"), 'keep = ["ws_ancestor"]\n');
    const dry = await ws(
      ["gc", "--dry-run", "--include-unrecorded", "--legacy"],
      path,
    );
    expect(dry.code, dry.err).toBe(0);
    expect(dry.out).toContain(`${wsDir(path, "safe")}\tws\tempty\t`);
    expect(dry.out).toContain(`${wsDir(path, "ancestor")}\tws\tkept\t`);
    expect((await ws(["rm", "ancestor"], path)).code).toBe(1);
    expect(
      (
        await jj(
          ["config", "set", "--repo", 'revset-aliases."trunk()"', "root()"],
          path,
        )
      ).code,
    ).toBe(0);
    const noTrunk = await ws(["gc", "--include-unrecorded", "--legacy"], path);
    expect(noTrunk.code, noTrunk.err).toBe(0);
    expect(noTrunk.out).toContain("no trunk");
    expect(
      await Bun.file(join(wsDir(path, "ancestor"), "a.txt")).exists(),
    ).toBe(true);
  });
});

const recFor = (dir: string) => ({
  id: dir,
  state: "ended",
  cwd: dir,
  workspace: dir,
  continues: null,
  judgment: { decision: "reject" },
});

describe("gc integration branches", () => {
  test("WS-GC-IMMUTABLE: collects without abandoning an immutable workspace commit", async () => {
    const path = await repo('trunk = "main"\n');
    expect((await ws(["add", "immutable-abandoned"], path)).code).toBe(0);
    const dir = wsDir(path, "immutable-abandoned");
    expect((await jj(["edit", "main"], dir)).code).toBe(0);
    const tip = (
      await jj(["log", "--no-graph", "-r", "@", "-T", "commit_id"], dir)
    ).out.trim();
    expect(
      (
        await jj(
          [
            "config",
            "set",
            "--repo",
            'revset-aliases."immutable_heads()"',
            `builtin_immutable_heads() | ${tip}`,
          ],
          path,
        )
      ).code,
    ).toBe(0);
    const state = join(scratch, "immutable-state");
    const realBin = join(scratch, "immutable-bin");
    await mkdir(state);
    await mkdir(realBin);
    await symlink(
      join(import.meta.dir, "../../agx-worker/src/next/cli.ts"),
      join(realBin, "agx-worker"),
    );
    const wrapper = join(realBin, "agx");
    await Bun.write(
      wrapper,
      `#!/usr/bin/env bun\nconst p=Bun.spawn([process.execPath,${JSON.stringify(join(import.meta.dir, "../../agx/src/agx.ts"))},...process.argv.slice(2)],{stdin:"ignore",stdout:"inherit",stderr:"inherit"});process.exitCode=await p.exited;\n`,
    );
    await chmod(wrapper, 0o755);
    const env = baseEnv({
      AGX_NEXT_STATE_DIR: state,
      PATH: `${realBin}:${bin}:${process.env.PATH}`,
    });
    const old = Temporal.Now.instant().subtract({ hours: 48 }).toString();
    const id = "immutable-abandoned-first";
    await Bun.write(
      join(state, "records.jsonl"),
      `${[
        {
          kind: "started",
          id,
          at: old,
          ticket: id,
          writes: [],
          cwd: path,
          workspace: dir,
          row: "fixture",
          dispatcher_session: null,
          vendor_session: null,
          pid: process.pid,
        },
        {
          kind: "ended",
          id,
          at: old,
          exit: 1,
          outcome: "verify-failed",
          report_path: null,
          vendor_session: null,
          verify: [],
        },
        { kind: "judged", id, at: old, decision: "reject", note: "fixture" },
      ]
        .map((event) => JSON.stringify(event))
        .join("\n")}\n`,
    );
    const collected = await ws(["gc", "--abandoned"], path, env);
    expect(collected.code, collected.err).toBe(0);
    expect(collected.out).toContain(`${dir}\tws\tcollected\t`);
    expect(collected.out).toContain("immutable commit retained");
    expect(await Bun.file(join(dir, "a.txt")).exists()).toBe(false);
    expect((await jj(["workspace", "list"], path)).out).not.toContain(
      "ws_immutable-abandoned",
    );
    expect(
      (
        await jj(
          ["log", "--no-graph", "-r", "all()", "-T", 'commit_id ++ "\\n"'],
          path,
        )
      ).out,
    ).toContain(tip);
  });

  test("WS-GC-UNACCEPTED: abandonment requires rejection; flags never override unjudged runs", async () => {
    const path = await repo('trunk = "main"\nkeep = ["ws_kept"]\n');
    const slugs = [
      "abandoned",
      "accepted",
      "running",
      "unknown",
      "kept",
      "recent",
      "undated",
    ];
    for (const slug of slugs) {
      expect((await ws(["add", slug], path)).code).toBe(0);
      await Bun.write(join(wsDir(path, slug), "attempt.txt"), `${slug}\n`);
      expect((await jj(["status"], wsDir(path, slug))).code).toBe(0);
    }
    const state = join(scratch, "unaccepted-state");
    const realBin = join(scratch, "unaccepted-bin");
    await mkdir(state);
    await mkdir(realBin);
    await symlink(
      join(import.meta.dir, "../../agx-worker/src/next/cli.ts"),
      join(realBin, "agx-worker"),
    );
    const wrapper = join(realBin, "agx");
    await Bun.write(
      wrapper,
      `#!/usr/bin/env bun\nconst p=Bun.spawn([process.execPath,${JSON.stringify(join(import.meta.dir, "../../agx/src/agx.ts"))},...process.argv.slice(2)],{stdin:"ignore",stdout:"inherit",stderr:"inherit"});process.exitCode=await p.exited;\n`,
    );
    await chmod(wrapper, 0o755);
    const env = baseEnv({
      AGX_NEXT_STATE_DIR: state,
      PATH: `${realBin}:${bin}:${process.env.PATH}`,
    });
    const old = Temporal.Now.instant().subtract({ hours: 48 }).toString();
    const recent = Temporal.Now.instant().subtract({ hours: 1 }).toString();
    const events: object[] = [];
    const record = (
      slug: string,
      suffix: string,
      outcome?: string,
      endedAt = old,
      accept = false,
    ) => {
      const id = `${slug}-${suffix}`;
      events.push({
        kind: "started",
        id,
        at: old,
        ticket: id,
        writes: [],
        cwd: path,
        workspace: wsDir(path, slug),
        continues: suffix === "second" ? `${slug}-first` : null,
        row: "fixture",
        dispatcher_session: null,
        vendor_session: null,
        pid: process.pid,
      });
      if (outcome !== undefined)
        events.push({
          kind: "ended",
          id,
          at: endedAt,
          exit: 1,
          outcome,
          report_path: null,
          vendor_session: null,
          verify: [],
        });
      if (accept)
        events.push({
          kind: "judged",
          id,
          at: old,
          decision: "accept",
          note: "fixture",
        });
    };
    record("abandoned", "first", "verify-failed");
    record("abandoned", "second", "malformed");
    events.push({
      kind: "judged",
      id: "abandoned-second",
      at: old,
      decision: "reject",
      note: "fixture",
    });
    record("accepted", "first", "ok", old, true);
    record("accepted", "second", "refused");
    record("running", "first", "timeout");
    record("running", "second");
    record("kept", "first", "lost");
    record("recent", "first", "refused");
    record("recent", "second", "timeout", recent);
    // A dead pid yields derived loss with no ended timestamp, which cannot prove age.
    events.push({
      kind: "started",
      id: "undated-first",
      at: old,
      ticket: "undated",
      writes: [],
      cwd: path,
      workspace: wsDir(path, "undated"),
      row: "fixture",
      dispatcher_session: null,
      vendor_session: null,
      pid: 2147483647,
    });
    await Bun.write(
      join(state, "records.jsonl"),
      `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
    );
    const abandoned = wsDir(path, "abandoned");
    const tip = (
      await jj(["log", "--no-graph", "-r", "@", "-T", "commit_id"], abandoned)
    ).out.trim();
    const dry = await ws(["gc", "--dry-run", "--abandoned"], path, env);
    expect(dry.code, dry.err).toBe(0);
    expect(dry.out).toContain(`${abandoned}\tws\tabandoned\t`);
    expect(dry.out).toContain(
      "abandoned-first (verify-failed), abandoned-second (malformed)",
    );
    const plain = await ws(
      ["gc", "--legacy", "--include-unrecorded"],
      path,
      env,
    );
    expect(plain.code, plain.err).toBe(0);
    expect(plain.out).toContain("pass --abandoned");
    expect(await Bun.file(join(abandoned, "attempt.txt")).exists()).toBe(true);
    const collected = await ws(["gc", "--abandoned"], path, env);
    expect(collected.code, collected.err).toBe(0);
    expect(collected.out).toContain(`${abandoned}\tws\tcollected\t`);
    expect(await Bun.file(join(abandoned, "attempt.txt")).exists()).toBe(false);
    const registered = (await jj(["workspace", "list"], path)).out;
    expect(registered).not.toContain("ws_abandoned");
    expect(
      (
        await jj(
          ["log", "--no-graph", "-r", "all()", "-T", 'commit_id ++ "\\n"'],
          path,
        )
      ).out,
    ).not.toContain(tip);
    for (const slug of slugs.filter((candidate) => candidate !== "abandoned")) {
      expect(
        await Bun.file(join(wsDir(path, slug), "attempt.txt")).exists(),
      ).toBe(true);
      expect(registered).toContain(`ws_${slug}`);
    }
    expect(collected.out).toContain(`${wsDir(path, "kept")}\tws\tkept\t`);
  });

  test("WS-GC-LANDED-CONTENT: rebased copy is collected; one differing path survives", async () => {
    const path = await repo('trunk = "main"\n');
    for (const slug of ["rebased-copy", "partial-copy"])
      expect((await ws(["add", slug], path)).code).toBe(0);
    const landed = wsDir(path, "rebased-copy");
    const partial = wsDir(path, "partial-copy");
    for (const dir of [landed, partial]) {
      await Bun.write(join(dir, "a.txt"), "changed\n");
      await Bun.write(join(dir, "second.txt"), "new\n");
      await unlink(join(dir, ".ws.toml"));
    }
    await Bun.write(join(partial, "second.txt"), "outstanding\n");
    await Bun.write(join(path, "a.txt"), "changed\n");
    await Bun.write(join(path, "second.txt"), "new\n");
    // Keep the committed config so trunk remains explicit, but delete another tracked file below.
    expect(
      (await jj(["commit", "-m", "independent landing copy"], path)).code,
    ).toBe(0);
    expect((await jj(["bookmark", "set", "main", "-r", "@-"], path)).code).toBe(
      0,
    );
    // The workspace deletion has not landed yet: both must initially survive.
    for (const dir of [landed, partial])
      expect((await jj(["status"], dir)).code).toBe(0);
    setRecords([recFor(landed), recFor(partial)]);
    const before = await ws(["gc", "--dry-run"], path);
    expect(before.out).toContain(`${landed}\tws\tunlanded\t`);
    await unlink(join(path, ".ws.toml"));
    expect((await jj(["commit", "-m", "land deletion"], path)).code).toBe(0);
    expect((await jj(["bookmark", "set", "main", "-r", "@-"], path)).code).toBe(
      0,
    );
    // Neither working nor committed config exists; supply trunk through jj's default alias.
    expect(
      (
        await jj(
          ["config", "set", "--repo", 'revset-aliases."trunk()"', "main"],
          path,
        )
      ).code,
    ).toBe(0);
    const env = baseEnv();
    const dry = await ws(["gc", "--dry-run"], path, env);
    expect(dry.code, dry.err).toBe(0);
    expect(dry.out).toContain(`${landed}\tws\tlanded\t`);
    expect(dry.out).toContain("differs in 1 of 3 paths: second.txt");
    const collected = await ws(["gc"], path, env);
    expect(collected.code, collected.err).toBe(0);
    expect(await Bun.file(join(landed, "a.txt")).exists()).toBe(false);
    expect(await Bun.file(join(partial, "second.txt")).text()).toBe(
      "outstanding\n",
    );
  });

  test("release consumes notes and version metadata; later trunk edits preserve landing evidence", async () => {
    const path = await repo('trunk = "main"\n');
    await Bun.write(
      join(path, "tools/example/package.json"),
      '{"name":"example","version":"0.1.0"}\n',
    );
    await Bun.write(
      join(path, "tools/example/CHANGELOG.md"),
      "# Changelog\n\n## 0.1.0\n\n- Initial\n",
    );
    expect((await jj(["commit", "-m", "tool base"], path)).code).toBe(0);
    expect((await jj(["bookmark", "set", "main", "-r", "@-"], path)).code).toBe(
      0,
    );
    expect((await ws(["add", "release-copy"], path)).code).toBe(0);
    const dir = wsDir(path, "release-copy");
    const note = "tools/example/.changes/released.md";
    await Bun.write(
      join(dir, note),
      "---\nbump: patch\n---\n\nReleased feature\n",
    );
    await Bun.write(join(dir, "feature.txt"), "released work\n");
    // Worker edits to release metadata must survive release normalization.
    await Bun.write(
      join(dir, "tools/example/package.json"),
      '{"name":"renamed","version":"0.1.0"}\n',
    );
    await Bun.write(
      join(dir, "tools/example/CHANGELOG.md"),
      "# Changelog\n\n## 0.1.0\n\n- Initial, corrected\n",
    );
    await Bun.write(join(path, "feature.txt"), "released work\n");
    await Bun.write(
      join(path, "tools/example/package.json"),
      '{"name":"renamed","version":"0.1.1"}\n',
    );
    await Bun.write(
      join(path, "tools/example/CHANGELOG.md"),
      "# Changelog\n\n## 0.1.1\n\n- Released feature\n\n## 0.1.0\n\n- Initial, corrected\n",
    );
    expect(
      (await jj(["commit", "-m", "squashed release copy"], path)).code,
    ).toBe(0);
    expect((await jj(["bookmark", "set", "main", "-r", "@-"], path)).code).toBe(
      0,
    );
    await Bun.write(
      join(path, "feature.txt"),
      "released work, subsequently improved\n",
    );
    expect((await jj(["commit", "-m", "later trunk edit"], path)).code).toBe(0);
    expect((await jj(["bookmark", "set", "main", "-r", "@-"], path)).code).toBe(
      0,
    );
    setRecords([recFor(dir)]);
    expect((await jj(["status"], dir)).code).toBe(0);
    const dry = await ws(["gc", "--dry-run"], path);
    expect(dry.code, dry.err).toBe(0);
    expect(dry.out).toContain(`${dir}\tws\tlanded\t`);
    expect(dry.out).toContain(`land-consumed changesets: ${note}`);
    expect(dry.out).toContain("matched release snapshot:");
    await Bun.write(join(dir, "feature.txt"), "unreleased work\n");
    const partial = await ws(["gc"], path);
    expect(partial.code, partial.err).toBe(0);
    expect(partial.out).toContain("differs in 1 of 4 paths: feature.txt");
    expect(await Bun.file(join(dir, "feature.txt")).exists()).toBe(true);
    await Bun.write(join(dir, "feature.txt"), "released work\n");
    await Bun.write(
      join(dir, note),
      "---\nbump: patch\n---\n\nNever released\n",
    );
    const missing = await ws(["gc"], path);
    expect(missing.out).toContain(`${dir}\tws\tunlanded\t`);
    expect(await Bun.file(join(dir, note)).exists()).toBe(true);
  });

  test("land-temp is collected only with --legacy and while land's lock is free", async () => {
    const path = await repo('trunk = "main"\n');
    const state = join(home, "state/agx/land", `fixture-${counter}`);
    const dir = join(state, "workspace");
    await mkdir(state, { recursive: true });
    expect(
      (
        await jj(
          ["workspace", "add", "--name", "lander", "-r", "main", dir],
          path,
        )
      ).code,
    ).toBe(0);
    await Bun.write(join(dir, "temporary.txt"), "land staging residue\n");
    setRecords([]);
    const dry = await ws(["gc", "--dry-run", "--legacy"], path);
    expect(dry.code, dry.err).toBe(0);
    expect(dry.out).toContain(`${dir}\tlegacy\tland-temp\t`);
    expect((await ws(["gc"], path)).code).toBe(0);
    expect(await Bun.file(join(dir, "a.txt")).exists()).toBe(true);
    await Bun.write(
      join(state, "land.lock/owner.json"),
      JSON.stringify({
        pid: process.pid,
        host: hostname(),
        what: "land",
        since: Temporal.Now.instant().toString(),
      }),
    );
    const held = await ws(["gc", "--legacy"], path);
    expect(held.code, held.err).toBe(0);
    expect(held.out).toContain("land lock is held");
    expect(await Bun.file(join(dir, "a.txt")).exists()).toBe(true);
    await Bun.write(
      join(state, "land.lock/owner.json"),
      JSON.stringify({
        pid: 2147483647,
        host: hostname(),
        what: "land",
        since: Temporal.Now.instant().toString(),
      }),
    );
    const collected = await ws(["gc", "--legacy"], path);
    expect(collected.code, collected.err).toBe(0);
    expect(await Bun.file(join(dir, "a.txt")).exists()).toBe(false);
    expect((await jj(["workspace", "list"], path)).out).not.toContain("lander");
  });

  test("contains a squash diff even with independent trunk edits in the same file", async () => {
    const path = await repo('trunk = "main"\n');
    await Bun.write(join(path, "a.txt"), "a\nb\nc\nd\ne\nf\ng\n");
    expect((await jj(["commit", "-m", "multiline base"], path)).code).toBe(0);
    expect((await jj(["bookmark", "set", "main", "-r", "@-"], path)).code).toBe(
      0,
    );
    const dir = join(scratch, "contained-diff");
    expect(
      (
        await jj(
          ["workspace", "add", "--name", "contained", "-r", "main", dir],
          path,
        )
      ).code,
    ).toBe(0);
    await Bun.write(join(dir, "a.txt"), "a\nB\nc\nd\ne\nf\ng\n");
    await Bun.write(join(dir, "shared-new.txt"), "same new file\n");
    expect((await jj(["status"], dir)).code).toBe(0);
    await Bun.write(join(path, "a.txt"), "a\nB\nc\nd\ne\nf\nG\n");
    await Bun.write(join(path, "shared-new.txt"), "same new file\n");
    await Bun.write(join(path, "unrelated.txt"), "other integrated work\n");
    expect(
      (await jj(["commit", "-m", "integrated plus other work"], path)).code,
    ).toBe(0);
    expect((await jj(["bookmark", "set", "main", "-r", "@-"], path)).code).toBe(
      0,
    );
    setRecords([]);
    const dry = await ws(["gc", "--dry-run", "--legacy"], path);
    expect(dry.code, dry.err).toBe(0);
    expect(dry.out).toContain(`${dir}\tlegacy\tlanded\t`);
    // An additional outstanding edit must prevent deletion even after a partial landing.
    await Bun.write(join(dir, "a.txt"), "a\nB\nc\nD\ne\nf\ng\n");
    const partial = await ws(["gc", "--legacy"], path);
    expect(partial.code, partial.err).toBe(0);
    expect(partial.out).toContain(`${dir}\tlegacy\tunlanded\t`);
    expect(await Bun.file(join(dir, "a.txt")).exists()).toBe(true);
  });

  test("all visits registry consumers, pending entries and dotfiles once, inside an isolated registry", async () => {
    const dotfiles = await repo('trunk = "main"\n');
    const consumer = await repo('trunk = "main"\n');
    const pending = await repo('trunk = "main"\n');
    for (const path of [dotfiles, consumer, pending])
      expect((await ws(["add", "all"], path)).code).toBe(0);
    await Bun.write(
      join(dotfiles, "presets/consumers.toml"),
      `[[consumers]]\nroot = ${JSON.stringify(consumer)}\n[[consumers]]\nroot = ${JSON.stringify(wsDir(consumer, "all"))}\n[[pending]]\nroot = ${JSON.stringify(pending)}\n`,
    );
    const module = join(import.meta.dir, "../src/workspace.ts");
    const result = await run(
      [
        "bun",
        "--eval",
        `import {gcAll} from ${JSON.stringify(module)};const r=await gcAll({dryRun:true,includeUnrecorded:true,legacy:true},${JSON.stringify(dotfiles)});process.stdout.write(JSON.stringify(r));`,
      ],
      dotfiles,
    );
    expect(result.code, result.err).toBe(0);
    const parsed = jsonOf(
      z.object({
        ok: z.literal(true),
        value: z.object({
          lines: z.array(z.string()),
          failed: z.array(z.string()),
        }),
      }),
    ).safeParse(result.out);
    expect(parsed.success, result.out).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.value.failed).toEqual([]);
    expect(parsed.data.value.lines).toHaveLength(3);
    const counts = jsonOf(
      z.object({
        value: z.object({
          counts: z.object({
            total: z.number(),
            unlanded: z.number(),
            collectable: z.number(),
            legacy: z.number(),
          }),
        }),
      }),
    ).safeParse(result.out);
    expect(counts).toMatchObject({
      success: true,
      data: {
        value: { counts: { total: 3, unlanded: 0, collectable: 3, legacy: 0 } },
      },
    });
    for (const path of [dotfiles, consumer, pending]) {
      expect(
        parsed.data.value.lines.some((line) =>
          line.startsWith(`${wsDir(path, "all")}\tws\tempty\t`),
        ),
      ).toBe(true);
      expect(await Bun.file(join(wsDir(path, "all"), "a.txt")).exists()).toBe(
        true,
      );
    }
    const conflict = await ws(["gc", "--all", "--repo", dotfiles], dotfiles);
    expect(conflict.code).toBe(1);
    expect(conflict.err).toContain("cannot be combined");
    const help = await ws(["gc", "--help"], dotfiles);
    expect(help.code).toBe(0);
    expect(help.out).toContain("only creator");
  });
});

// These cases reproduce the incident with an empty saved diff and exercise real CLI effects.
describe("SEP-WS-FORGET-UNJUDGED-1023", () => {
  for (const caller of ["gc", "rm", "adopt"] as const) {
    for (const state of [
      "unjudged",
      "accepted-pending",
      "accepted-landed",
      "rejected",
      "running",
    ] as const) {
      test(`${caller}: ${state} run gates forget and directory removal`, async () => {
        const path = await repo('trunk = "main"\n');
        setRecords([]);
        expect((await ws(["add", "guarded"], path)).code).toBe(0);
        const dir = wsDir(path, "guarded");
        const main = (
          await jj(["log", "--no-graph", "-r", "main", "-T", "commit_id"], path)
        ).out.trim();
        let commit = main;
        if (state === "accepted-pending") {
          // Recorded run work remains unlanded even when the current checkout is clean.
          await Bun.write(join(dir, "pending.txt"), "unlanded\n");
          commit = (
            await jj(["log", "--no-graph", "-r", "@", "-T", "commit_id"], dir)
          ).out.trim();
          expect((await jj(["new", "main"], dir)).code).toBe(0);
        }
        let decision: string | undefined;
        if (state.startsWith("accepted")) decision = "accept";
        if (state === "rejected") decision = "reject";
        setRecords([
          {
            id: "latest",
            started_at: "2026-10-23T01:00:00Z",
            state: state === "running" ? "running" : "ended",
            ended_at: "2020-01-01T00:00:00Z",
            outcome: "ok",
            workspace: dir,
            judgment: decision === undefined ? null : { decision },
            end_commit: commit,
          },
        ]);
        const allowed = state === "accepted-landed" || state === "rejected";
        let args = ["rm", "guarded"];
        if (caller === "adopt") args = ["adopt", dir, "--slug", "moved"];
        if (caller === "gc")
          args = ["gc", "--abandoned", "--legacy", "--include-unrecorded"];
        const result = await ws(args, path);
        expect(result.code, result.out + result.err).toBe(
          allowed || caller === "gc" ? 0 : 1,
        );
        expect(existsSync(dir), result.out + result.err).toBe(!allowed);
        const names = (
          await jj(["--ignore-working-copy", "workspace", "list"], path)
        ).out;
        expect(names.includes("ws_guarded:")).toBe(!allowed);
        let reason = "not reachable";
        if (state === "unjudged") reason = "unjudged";
        if (state === "running") reason = "live or continuing";
        if (!allowed) expect(result.out + result.err).toContain(reason);
        setRecords([]);
      });
    }
  }

  test("latest run wins regardless of inventory order; cwd and continuation links retain work", async () => {
    const path = await repo('trunk = "main"\n');
    setRecords([]);
    expect((await ws(["add", "latest"], path)).code).toBe(0);
    const dir = wsDir(path, "latest");
    const old = {
      id: "old",
      state: "ended",
      workspace: dir,
      judgment: { decision: "reject" },
      started_at: "2026-10-22T00:00:00Z",
    };
    const fresh = {
      id: "new",
      state: "ended",
      cwd: join(dir, "nested"),
      judgment: null,
      started_at: "2026-10-23T00:00:00Z",
    };
    for (const rows of [
      [old, fresh],
      [fresh, old],
    ]) {
      setRecords(rows);
      const result = await ws(["gc", "--abandoned"], path);
      expect(result.out).toContain("run new is unjudged");
      expect(existsSync(dir)).toBe(true);
    }
    setRecords([old, { ...fresh, cwd: "/elsewhere", continues: "old" }]);
    expect((await ws(["rm", "latest"], path)).err).toContain(
      "run new is unjudged",
    );
    setRecords([fresh, { ...old, started_at: "2026-10-24T00:00:00Z" }]);
    expect((await ws(["rm", "latest"], path)).code).toBe(0);
    setRecords([]);
  });

  test("failed readiness retains a workspace if readiness published an unjudged run", async () => {
    const command = `printf '%s' '[{"id":"during-ready","state":"ended","workspace":"PLACEHOLDER","judgment":null}]' > ${JSON.stringify(records)}; exit 9`;
    const path = await repo('trunk = "main"\n');
    const dir = wsDir(path, "rollback");
    await Bun.write(
      join(path, ".ws.toml"),
      `trunk = "main"\nready = [${JSON.stringify(command.replace("PLACEHOLDER", dir))}]\n`,
    );
    setRecords([]);
    const result = await ws(["add", "rollback"], path);
    expect(result.code).not.toBe(0);
    expect(result.err).toContain("unjudged");
    expect(existsSync(dir)).toBe(true);
    expect(
      (await jj(["--ignore-working-copy", "workspace", "list"], path)).out,
    ).toContain("ws_rollback");
    setRecords([]);
  });

  test("accepted inventory without end_commit requires actual ancestry, not equal content", async () => {
    const path = await repo('trunk = "main"\n');
    setRecords([]);
    expect((await ws(["add", "ancestry"], path)).code).toBe(0);
    const dir = wsDir(path, "ancestry");
    setRecords([
      {
        id: "accepted",
        state: "ended",
        workspace: dir,
        judgment: { decision: "accept" },
      },
    ]);
    const refused = await ws(["rm", "ancestry"], path);
    expect(refused.err).toContain("not reachable");
    expect(existsSync(dir)).toBe(true);
    expect((await jj(["edit", "main"], dir)).code).toBe(0);
    const removed = await ws(["rm", "ancestry"], path);
    expect(removed.code, removed.err).toBe(0);
    expect(existsSync(dir)).toBe(false);
    setRecords([]);
  });
});

test("SEP-WS-FORGET-UNJUDGED-1023: adoption rollback retains a newly recorded target", async () => {
  const path = await repo('trunk = "main"\n');
  const source = join(path, "..", "legacy-rollback");
  setRecords([]);
  expect(
    (await jj(["workspace", "add", "--name", "legacy", source], path)).code,
  ).toBe(0);
  const target = wsDir(path, "rollback-target");
  const wrapper = join(scratch, "rollback-run-bin");
  await mkdir(wrapper);
  const realJj = Bun.which("jj");
  expect(realJj).not.toBeNull();
  await Bun.write(
    join(wrapper, "jj"),
    `#!/usr/bin/env bun
const args=process.argv.slice(2);
if (process.cwd() === ${JSON.stringify(target)} && args.includes("edit")) {
  await Bun.write(${JSON.stringify(records)}, JSON.stringify([{id:"during-adoption",state:"ended",workspace:${JSON.stringify(target)},judgment:null}]));
  process.exit(1);
}
const p=Bun.spawn([${JSON.stringify(realJj)},...args],{stdin:"ignore",stdout:"inherit",stderr:"inherit",timeout:20000});
process.exitCode=await p.exited;
`,
  );
  await chmod(join(wrapper, "jj"), 0o755);
  const result = await ws(
    ["adopt", source, "--slug", "rollback-target"],
    path,
    baseEnv({ PATH: `${wrapper}:${bin}:${process.env.PATH}` }),
  );
  expect(result.code).toBe(1);
  expect(result.out + result.err).toContain("unjudged");
  expect(existsSync(source)).toBe(true);
  expect(existsSync(target)).toBe(true);
  const names = (await jj(["--ignore-working-copy", "workspace", "list"], path))
    .out;
  expect(names).toContain("legacy:");
  expect(names).toContain("ws_rollback-target:");
  setRecords([]);
});
