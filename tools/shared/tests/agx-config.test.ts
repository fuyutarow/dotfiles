import { afterEach, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgxConfigError, resolveAgxConfig } from "../src/agx-config.ts";

const roots: string[] = [];
const originalXdg = process.env.XDG_CONFIG_HOME;
afterEach(async () => {
  if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalXdg;
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture(policy?: string) {
  const parent = await mkdtemp(join(tmpdir(), "agx-config-"));
  roots.push(parent);
  process.env.XDG_CONFIG_HOME = join(parent, "config");
  const localDirectory = join(process.env.XDG_CONFIG_HOME, "agx/repos");
  await mkdir(localDirectory, { recursive: true });
  const local = join(localDirectory, "repo.toml");
  const root = join(parent, "repo");
  await mkdir(root);
  const jj = async (args: string[]) => {
    const child = Bun.spawn(["jj", ...args], {
      cwd: root,
      env: {
        ...process.env,
        JJ_CONFIG: "",
        JJ_USER: "Fixture",
        JJ_EMAIL: "fixture@example.invalid",
      },
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
    "bookmarks(main)",
  ]);
  if (policy !== undefined) await writeFile(join(root, "agx.toml"), policy);
  await writeFile(join(root, "base"), "base\n");
  await jj(["commit", "-m", "Base policy"]);
  await jj(["bookmark", "create", "main", "-r", "@-"]);
  const writeLocal = (text: string) =>
    writeFile(local, `root = ${JSON.stringify(root)}\n${text}`);
  return { parent, root, jj, local, localDirectory, writeLocal };
}

const home = async (root: string) => {
  const result = await resolveAgxConfig(root);
  expect(result.ok, result.ok ? "" : String(result.error)).toBe(true);
  return result.ok ? result.value.tickets : undefined;
};
test("defaults without files and schema-only policy", async () => {
  for (const policy of [undefined, "schema = 1\n"]) {
    const f = await fixture(policy);
    expect(await home(f.root)).toBe(join(f.root, ".agents/tickets"));
    const result = await resolveAgxConfig(f.root);
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value).toMatchObject({
        ready: [],
        keep: [],
        verifyAlways: [],
      });
  }
});
test("verify.always replaces by key from L1 to L2, including an empty override", async () => {
  const f = await fixture(
    'schema = 1\n[verify]\nalways = ["first", "second"]\n',
  );
  const commands = async () => {
    const result = await resolveAgxConfig(f.root);
    expect(result.ok).toBe(true);
    return result.ok ? result.value.verifyAlways : undefined;
  };
  expect(await commands()).toEqual(["first", "second"]);
  await f.writeLocal('schema = 1\n[verify]\nalways = ["local"]\n');
  expect(await commands()).toEqual(["local"]);
  await f.writeLocal("schema = 1\n[verify]\n");
  expect(await commands()).toEqual(["first", "second"]);
  await f.writeLocal("schema = 1\n[verify]\nalways = []\n");
  expect(await commands()).toEqual([]);
});
test("L2 can declare verify.always without L1", async () => {
  const f = await fixture();
  await f.writeLocal('schema = 1\n[verify]\nalways = ["local"]\n');
  const result = await resolveAgxConfig(f.root);
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.value.verifyAlways).toEqual(["local"]);
});
test.each([
  'verify = "wrong"',
  "[verify]\nunknown = []",
  '[verify]\nalways = "wrong"',
  "[verify]\nalways = [1]",
  '[verify]\nalways = [""]',
  '[verify]\nalways = ["   "]',
])("rejects invalid verify config at both layers: %s", async (table) => {
  for (const layer of ["L1", "L2"]) {
    const f = await fixture(
      layer === "L1" ? `schema = 1\n${table}\n` : undefined,
    );
    await f.writeLocal(
      `schema = 1\n${layer === "L2" ? table : '[verify]\nalways = ["valid override"]'}\n`,
    );
    const result = await resolveAgxConfig(f.root);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(AgxConfigError);
      expect(String(result.error)).toContain(
        layer === "L1" ? "agx.toml" : "repo.toml",
      );
    }
  }
});
test("workspace keys replace independently from L1 to L2 and preserve keep entries", async () => {
  const f = await fixture('schema = 1\n[ws]\nready = ["l1 one", "l1 two"]\n');
  let result = await resolveAgxConfig(f.root);
  expect(result.ok).toBe(true);
  if (result.ok)
    expect(result.value).toMatchObject({
      ready: ["l1 one", "l1 two"],
      keep: [],
    });

  await f.writeLocal(
    'schema = 1\n[ws]\nready = ["l2"]\nkeep = ["relative path", "/absolute/path"]\n',
  );
  result = await resolveAgxConfig(f.root);
  expect(result.ok).toBe(true);
  if (result.ok)
    expect(result.value).toMatchObject({
      ready: ["l2"],
      keep: ["relative path", "/absolute/path"],
    });

  await f.writeLocal('schema = 1\n[ws]\nkeep = ["still kept"]\n');
  result = await resolveAgxConfig(f.root);
  expect(result.ok).toBe(true);
  if (result.ok)
    expect(result.value).toMatchObject({
      ready: ["l1 one", "l1 two"],
      keep: ["still kept"],
    });
});
test("rejects keep in L1 with the file and its L2 location", async () => {
  const f = await fixture('schema = 1\n[ws]\nkeep = ["workspace"]\n');
  const result = await resolveAgxConfig(f.root);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBeInstanceOf(AgxConfigError);
    expect(String(result.error)).toContain(join(f.root, "agx.toml"));
    expect(String(result.error)).toContain(
      "keep belongs in $XDG_CONFIG_HOME/agx/repos/<name>.toml",
    );
  }
});
test("only trunk policy is authoritative, including committed nontrunk edits", async () => {
  const f = await fixture(
    'schema = 1\ntickets = "committed"\n[ws]\nready = ["later"]\n',
  );
  await writeFile(join(f.root, "agx.toml"), 'schema = 1\ntickets = "dirty"\n');
  const heads = await readdir(join(f.root, ".jj/repo/op_heads"));
  const bytes = await readFile(join(f.root, "agx.toml"), "utf8");
  expect(await home(f.root)).toBe(join(f.root, "committed"));
  expect(await readdir(join(f.root, ".jj/repo/op_heads"))).toEqual(heads);
  expect(await readFile(join(f.root, "agx.toml"), "utf8")).toBe(bytes);
  await f.jj(["commit", "-m", "Nontrunk policy"]);
  expect(await home(f.root)).toBe(join(f.root, "committed"));
});
test("XDG L2 replaces per key and is selected by main checkout root", async () => {
  const f = await fixture('schema = 1\ntickets = "policy"\n');
  await writeFile(
    join(f.root, "repo.toml"),
    "invalid repository-local file must be ignored",
  );
  const secondary = join(f.parent, "secondary");
  await f.jj(["workspace", "add", "--name", "secondary", secondary]);
  const local = join(f.parent, "local-tickets");
  await f.writeLocal(`schema = 1\ntickets = ${JSON.stringify(local)}\n`);
  await writeFile(
    join(secondary, "repo.toml"),
    'schema = 1\ntickets = "wrong"\n',
  );
  expect(await home(f.root)).toBe(local);
  expect(await home(secondary)).toBe(local);
  await f.writeLocal("schema = 1\n[ws]\nkeep = []\n");
  expect(await home(secondary)).toBe(join(f.root, "policy"));
  await f.writeLocal('schema = 1\ntickets = "relative-local"\n');
  expect(await home(secondary)).toBe(join(f.root, "relative-local"));
});
test("old workspace bases cannot supply policy or the retired-file refusal", async () => {
  const f = await fixture('schema = 1\ntickets = "trunk-tickets"\n');
  await writeFile(join(f.root, ".agx.toml"), "legacy\n");
  await writeFile(
    join(f.root, "agx.toml"),
    'schema = 1\ntickets = "old-tickets"\n',
  );
  await f.jj(["commit", "-m", "Old workspace policy"]);
  const secondary = join(f.parent, "secondary");
  await f.jj([
    "workspace",
    "add",
    "--name",
    "secondary",
    "-r",
    "@-",
    secondary,
  ]);
  await f.jj(["new", "main"]);
  const heads = await readdir(join(f.root, ".jj/repo/op_heads"));
  expect(await home(secondary)).toBe(join(f.root, "trunk-tickets"));
  const local = join(f.parent, "local-tickets");
  await f.writeLocal(`schema = 1\ntickets = ${JSON.stringify(local)}\n`);
  expect(await home(secondary)).toBe(local);
  expect(await readdir(join(f.root, ".jj/repo/op_heads"))).toEqual(heads);
});

test.each(["working", "trunk", "recorded-workspace", "secondary"])(
  "only trunk supplies retired-file refusal: %s",
  async (where) => {
    const f = await fixture();
    let path = join(f.root, ".agx.toml");
    let root = f.root;
    if (where === "secondary") {
      root = join(f.parent, "secondary");
      await f.jj(["workspace", "add", "--name", "secondary", root]);
      path = join(root, ".agx.toml");
    }
    await writeFile(path, "invalid legacy content\n");
    if (where === "trunk" || where === "recorded-workspace") {
      await f.jj(["commit", "-m", "Legacy file"]);
      if (where === "trunk")
        await f.jj(["bookmark", "set", "main", "-r", "@-"]);
      await unlink(path);
    }
    const result = await resolveAgxConfig(root);
    expect(result.ok).toBe(where !== "trunk");
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(AgxConfigError);
      expect(String(result.error)).toContain(
        `${f.root}/.agx.toml is retired; rename it: mv .agx.toml agx.toml (machine-local absolute paths go in $XDG_CONFIG_HOME/agx/repos/<name>.toml (default ~/.config/agx/repos/<name>.toml) with root = ${JSON.stringify(f.root)})`,
      );
    }
  },
);
test.each([
  ['tickets = "no-schema"\n', "schema"],
  ["schema = 2\n", "schema"],
  ["schema = 1\nunknown = true\n", "unknown"],
  ['schema = 1\ntickets = "/absolute"\n', "agx/repos/"],
  ['schema = 1\ntickets = "C:\\\\tickets"\n', "agx/repos/"],
  ['schema = 1\ntickets = "~/tickets"\n', "agx/repos/"],
  ['schema = 1\ntickets = ""\n', "tickets"],
  ['schema = 1\nws = "wrong"\n', "ws"],
  ["schema = 1\n[ws]\nunknown = true\n", "unknown"],
  ['schema = 1\n[ws]\nready = [""]\n', "ready"],
  ['schema = 1\n[ws]\nready = ["   "]\n', "ready"],
  ["schema = 1\nschema = 1\n", "TOML"],
])("rejects invalid L1: %s", async (policy, message) => {
  const f = await fixture(policy);
  // L2 must not hide invalid L1.
  await f.writeLocal('schema = 1\ntickets = "override"\n');
  const result = await resolveAgxConfig(f.root);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBeInstanceOf(AgxConfigError);
    expect(String(result.error)).toContain(message);
    expect(String(result.error)).not.toContain("\n");
  }
});
test.each([
  ['tickets = "local"\n', "repo.toml"],
  ["schema = 1\nunknown = true\n", "repo.toml"],
  ["schema = 1\n[ws]\nunknown = true\n", "unknown"],
  ['schema = 1\n[ws]\nkeep = [""]\n', "keep"],
])("rejects invalid L2: %s", async (local, message) => {
  const f = await fixture();
  await f.writeLocal(local);
  const result = await resolveAgxConfig(f.root);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(String(result.error)).toContain(message);
});

test("L2 works without L1, ignores other roots, and rejects duplicate claims", async () => {
  const f = await fixture();
  await writeFile(
    join(f.localDirectory, "other.toml"),
    `schema = 1\nroot = ${JSON.stringify(join(f.parent, "other"))}\ntickets = "/other"\n`,
  );
  expect(await home(f.root)).toBe(join(f.root, ".agents/tickets"));
  await f.writeLocal('schema = 1\ntickets = "selected"\n');
  expect(await home(f.root)).toBe(join(f.root, "selected"));
  await writeFile(
    join(f.localDirectory, "duplicate.toml"),
    await readFile(f.local, "utf8"),
  );
  const result = await resolveAgxConfig(f.root);
  expect(result.ok).toBe(false);
  if (!result.ok)
    expect(String(result.error)).toContain("two files claim root");
});

test.each(["", 'root = "relative"\n'])(
  "L2 requires absolute root: %s",
  async (root) => {
    const f = await fixture();
    await writeFile(f.local, `schema = 1\n${root}tickets = "selected"\n`);
    const result = await resolveAgxConfig(f.root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(String(result.error)).toContain("root");
  },
);

test("config read waits beyond the former 5000ms limit for a queued jj read", async () => {
  const f = await fixture('schema = 1\ntickets = "committed"\n');
  const jj = Bun.which("jj");
  expect(jj).not.toBeNull();
  if (jj === null) return;
  const bin = join(f.parent, "bin");
  await mkdir(bin);
  const shim = join(bin, "jj");
  await writeFile(
    shim,
    `#!/usr/bin/env bun
const args = Bun.argv.slice(2);
if (args.includes("workspace")) await Bun.sleep(5100);
const child = Bun.spawn([${JSON.stringify(jj)}, ...args], { stdout: "inherit", stderr: "inherit" });
process.exit(await child.exited);
`,
    { mode: 0o755 },
  );
  const originalPath = process.env.PATH;
  process.env.PATH = `${bin}:${originalPath}`;
  const selectedHome = await home(f.root).finally(() => {
    process.env.PATH = originalPath;
  });
  expect(selectedHome).toBe(join(f.root, "committed"));
}, 20_000);

test("silent config command failure includes command, cwd and child exit", async () => {
  const f = await fixture();
  const bin = join(f.parent, "bin");
  await mkdir(bin);
  await writeFile(join(bin, "jj"), "#!/bin/sh\nexit 9\n", { mode: 0o755 });
  const originalPath = process.env.PATH;
  process.env.PATH = `${bin}:${originalPath}`;
  const result = await resolveAgxConfig(f.root).finally(() => {
    process.env.PATH = originalPath;
  });
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(String(result.error)).toContain(
      '"workspace","root","--name","default"',
    );
    expect(String(result.error)).toContain(f.root);
    expect(String(result.error)).toContain("exited 9: no stderr");
  }
});

test("config read expiry carries its named operational timeout", async () => {
  const { readCommand, InspectionTimeout } =
    await import("../src/agx-config.ts");
  const f = await fixture();
  const argv = [process.execPath, "-e", "await Bun.sleep(5000)"];
  const result = await readCommand(argv, f.root, 20);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBeInstanceOf(InspectionTimeout);
    expect(String(result.error)).toContain("CONFIG_READ_TIMEOUT_MS=20ms");
    expect(String(result.error)).toContain(JSON.stringify(argv));
    expect(String(result.error)).toContain(`cwd=${f.root}`);
  }
});
