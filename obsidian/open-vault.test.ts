import { afterEach, expect, test } from "bun:test";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../agents/hooks/zod.ts";

const homes: string[] = [];
afterEach(async () => {
  for (const home of homes.splice(0))
    await rm(home, { recursive: true, force: true });
});
async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}
const ObjectJson = jsonOf(z.record(z.string(), z.unknown()));
async function object(path: string): Promise<Record<string, unknown>> {
  const parsed = ObjectJson.safeParse(await readFile(path, "utf8"));
  return parsed.success ? parsed.data : {};
}

function record(value: unknown): Record<string, unknown> {
  const parsed = z.record(z.string(), z.unknown()).safeParse(value);
  return parsed.success ? parsed.data : {};
}

async function fixture() {
  const home = await realpath(
    await mkdtemp(join(tmpdir(), "obs-force-vault-")),
  );
  homes.push(home);
  const registry = join(
    home,
    "Library/Application Support/obsidian/obsidian.json",
  );
  const target = join(home, "new vault #日本語");
  const bin = join(home, "bin");
  for (const dir of [
    target,
    bin,
    join(home, "old"),
    join(home, "other"),
    join(home, "Library/Application Support/obsidian"),
  ])
    await mkdir(dir, { recursive: true });
  const original = {
    vaults: {
      aaaaaaaaaaaaaaaa: {
        path: join(home, "old"),
        ts: 1,
        open: true,
        extra: "keep",
      },
      bbbbbbbbbbbbbbbb: { path: join(home, "other"), ts: 2 },
    },
    cli: false,
    unrelated: { keep: true },
  };
  await writeFile(registry, JSON.stringify(original));
  await writeFile(join(home, "app.json"), '{"readableLineLength":false}');
  await writeFile(
    join(home, "plugins.json"),
    '{"doc-view":{"local":"local-plugins/doc-view"}}',
  );
  for (const name of ["pgrep", "osascript", "open", "kill", "killall"]) {
    await writeFile(
      join(bin, name),
      `#!${process.execPath}
import { existsSync, appendFileSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
const home = process.env.HOME;
const name = ${JSON.stringify(name)};
const args = process.argv.slice(2);
appendFileSync(home+"/events", JSON.stringify([name,...args])+"\\n");
if(name === "pgrep") process.exit(existsSync(home+"/running") ? 0 : 1);
if(name === "osascript") {
  if(existsSync(home+"/refuse")) process.exit(1);
  if(existsSync(home+"/flush")) {
    const path = home+"/Library/Application Support/obsidian/obsidian.json";
    const data = JSON.parse(readFileSync(path,"utf8"));
    data.vaults.cccccccccccccccc = {path:home+"/other",ts:3,open:true};
    writeFileSync(path,JSON.stringify(data));
    writeFileSync(home+"/saved-note.md","pending note saved by graceful quit");
  }
  if(!existsSync(home+"/stuck")) unlinkSync(home+"/running");
}
if(name === "open") {
  if(args[0] === "-a") writeFileSync(home+"/running", "1");
  if(args[0]?.startsWith("obsidian://")) writeFileSync(home+"/opened",args[0]);
}
if(name === "kill" || name === "killall") process.exit(99);
`,
      { mode: 0o755 },
    );
  }
  const env = {
    ...process.env,
    HOME: home,
    DOTFILES: join(import.meta.dir, ".."),
    PATH: `${bin}:${process.env.PATH}`,
    OBSIDIAN_APP_SOURCE: join(home, "app.json"),
    OBSIDIAN_PLUGINS_SOURCE: join(home, "plugins.json"),
    SSH_CONNECTION: "",
    SSH_TTY: "",
    OBS_DRY_RUN: "0",
  };
  const run = async (
    args: string[] = [target],
    overrides: Record<string, string> = {},
    wrapper = false,
  ) => {
    const cmd = wrapper
      ? [
          "zsh",
          "-f",
          "-c",
          'source "$DOTFILES/zsh/mac.zsh"; obs "$@"',
          "obs",
          ...args,
        ]
      : [process.execPath, join(import.meta.dir, "open-vault.ts"), ...args];
    const child = Bun.spawn(cmd, {
      env: { ...env, ...overrides },
      cwd: target,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    });
    const [exit, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { exit, stdout, stderr };
  };
  const events = async () =>
    (await exists(join(home, "events")))
      ? readFile(join(home, "events"), "utf8")
      : "";
  return { home, target, registry, original, run, events };
}

test("wrapper registers, gracefully saves, retains flushed entries in order, applies only the new vault and opens by ID", async () => {
  const f = await fixture();
  await writeFile(join(f.home, "running"), "1");
  await writeFile(join(f.home, "flush"), "1");
  const result = await f.run([f.target], {}, true);
  expect(result).toMatchObject({ exit: 0, stderr: "" });
  const reg = await object(f.registry);
  expect(reg).toMatchObject(f.original);
  const vaults = record(reg.vaults);
  const ids = Object.keys(vaults);
  expect(ids.slice(0, 3)).toEqual([
    "aaaaaaaaaaaaaaaa",
    "bbbbbbbbbbbbbbbb",
    "cccccccccccccccc",
  ]);
  expect(ids).toHaveLength(4);
  const id = ids[3] ?? "";
  expect(id).toMatch(/^[a-f0-9]{16}$/u);
  expect(vaults[id]).toMatchObject({ path: f.target });
  expect(await readFile(join(f.home, "opened"), "utf8")).toBe(
    `obsidian://open?vault=${id}`,
  );
  expect(await readFile(join(f.home, "saved-note.md"), "utf8")).toContain(
    "pending note saved",
  );
  expect(await object(join(f.target, ".obsidian/app.json"))).toEqual({
    readableLineLength: false,
  });
  expect(
    await exists(join(f.target, ".obsidian/plugins/doc-view/main.js")),
  ).toBe(true);
  expect(await exists(join(f.home, "old/.obsidian"))).toBe(false);
  expect(await f.events()).toContain('quit app \\"Obsidian\\"');
  expect(await f.events()).not.toContain('["kill');
  const events = await f.events();
  expect(events.indexOf('["osascript"')).toBeLessThan(
    events.indexOf('["open","-a"'),
  );
  expect(
    await readdir(join(f.home, "Library/Application Support/obsidian")),
  ).toEqual(["obsidian.json"]);
  expect((await f.run([f.target], {}, true)).exit).toBe(0);
  expect(Object.keys(record((await object(f.registry)).vaults))).toHaveLength(
    4,
  );
});

test("not running: creates missing registry without quitting", async () => {
  const f = await fixture();
  await rm(f.registry);
  expect((await f.run()).exit).toBe(0);
  expect(Object.keys(record((await object(f.registry)).vaults))).toHaveLength(
    1,
  );
  expect(await f.events()).not.toContain("osascript");
});

test("dry-run including default cwd changes nothing and runs no app commands", async () => {
  const f = await fixture();
  const before = await readFile(f.registry, "utf8");
  const result = await f.run([], { OBS_DRY_RUN: "1" }, true);
  expect(result.exit).toBe(0);
  expect(result.stdout).toContain(`register ${f.target}`);
  expect(await readFile(f.registry, "utf8")).toBe(before);
  expect(await exists(join(f.target, ".obsidian"))).toBe(false);
  expect(await f.events()).toBe("");
});

test("registered nested vaults and symlinks keep longest match and encoded path", async () => {
  const f = await fixture();
  const nested = join(f.home, "old/nested");
  const child = join(nested, "child #日本語");
  await mkdir(child, { recursive: true });
  const link = join(f.home, "alias");
  await symlink(child, link);
  await writeFile(
    f.registry,
    JSON.stringify({
      vaults: { outer: { path: join(f.home, "old") }, inner: { path: nested } },
    }),
  );
  const before = await readFile(f.registry, "utf8");
  expect(
    (await f.run([nested], { OBS_DRY_RUN: "1" }, true)).stdout.trim(),
  ).toBe("obsidian://open?vault=inner");
  expect((await f.run([link], { OBS_DRY_RUN: "1" }, true)).stdout.trim()).toBe(
    `obsidian://open?path=${encodeURIComponent(child)}`,
  );
  expect(await readFile(f.registry, "utf8")).toBe(before);
  expect(await f.events()).toBe("");
});

test("quit refusal leaves registry and notes untouched and never launches or kills", async () => {
  const f = await fixture();
  await writeFile(join(f.home, "running"), "1");
  await writeFile(join(f.home, "refuse"), "1");
  await writeFile(
    join(f.target, "note.md"),
    "unsaved fixture remains with app",
  );
  const before = await readFile(f.registry, "utf8");
  const result = await f.run();
  expect(result.exit).toBe(2);
  expect(result.stderr).toContain("refused graceful quit");
  expect(await readFile(f.registry, "utf8")).toBe(before);
  expect(await exists(join(f.home, "running"))).toBe(true);
  expect(await readFile(join(f.target, "note.md"), "utf8")).toBe(
    "unsaved fixture remains with app",
  );
  expect(await f.events()).not.toContain('["open"');
  expect(await f.events()).not.toContain('["kill');
});

test("malformed registry is never replaced", async () => {
  const f = await fixture();
  await writeFile(f.registry, "{broken");
  expect((await f.run()).exit).toBe(2);
  expect(await readFile(f.registry, "utf8")).toBe("{broken");
  expect(await f.events()).toBe("");
});

test("SSH, files, extra arguments, unknown flags and prototype flags refuse before mutation", async () => {
  const f = await fixture();
  const before = await readFile(f.registry, "utf8");
  for (const args of [
    [f.registry],
    [f.target, f.target],
    ["--unknown"],
    ["--__proto__", "x"],
  ])
    expect((await f.run(args)).exit).not.toBe(0);
  expect(
    (await f.run([f.target], { SSH_CONNECTION: "remote" }, true)).exit,
  ).toBe(1);
  expect((await f.run([f.target], { SSH_TTY: "remote" })).exit).toBe(2);
  expect((await f.run(["--help"])).exit).toBe(0);
  expect(await readFile(f.registry, "utf8")).toBe(before);
  expect(await f.events()).toBe("");
});

test("settings failure reports repair command while still opening registered vault", async () => {
  const f = await fixture();
  await writeFile(join(f.home, "plugins.json"), "broken");
  const result = await f.run();
  expect(result.exit).toBe(0);
  expect(result.stderr).toContain("WARN: house settings incomplete");
  expect(result.stderr).toContain("--vault");
  expect(await exists(join(f.home, "opened"))).toBe(true);
});

test("concurrent registrations serialize and preserve both new entries", async () => {
  const f = await fixture();
  const other = join(f.home, "another new vault");
  await mkdir(other);
  const results = await Promise.all([f.run(), f.run([other])]);
  expect(results.map((result) => result.exit)).toEqual([0, 0]);
  const reg = await object(f.registry);
  expect(reg).toMatchObject(f.original);
  const paths = Object.values(record(reg.vaults)).map((value) => {
    const parsed = z.object({ path: z.string() }).safeParse(value);
    return parsed.success ? parsed.data.path : undefined;
  });
  expect(paths).toHaveLength(4);
  expect(paths).toContain(f.target);
  expect(paths).toContain(other);
});

test("a stalled graceful quit times out without touching registry or terminating Obsidian", async () => {
  const f = await fixture();
  await writeFile(join(f.home, "running"), "1");
  await writeFile(join(f.home, "stuck"), "1");
  const before = await readFile(f.registry, "utf8");
  const result = await f.run();
  expect(result.exit).toBe(2);
  expect(result.stderr).toContain("did not quit within 20 seconds");
  expect(await readFile(f.registry, "utf8")).toBe(before);
  expect(await exists(join(f.home, "running"))).toBe(true);
  expect(await f.events()).not.toContain('["kill');
  expect(await f.events()).not.toContain('["open"');
}, 30_000);
