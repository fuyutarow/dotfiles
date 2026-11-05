import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "bun:test";
import {
  collectShardResults,
  loadShardManifest,
  requireIndexedShards,
  shardEnv,
  verifyShardFiles,
} from "../src/shards.ts";

const hash = (text: string) =>
  new Bun.CryptoHasher("sha256").update(text).digest("hex");
const MAPPING = "COCOINDEX_CODE_DB_PATH_MAPPING";
const idle = { stdout: "", stderr: "", exitCode: 0, timedOut: false };

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "rr-shards-")));
  const source = join(root, "source");
  const shards = [join(root, "one"), join(root, "two")].map((project) => ({
    project,
  }));
  for (const path of [source, ...shards.map((shard) => shard.project)])
    await mkdir(path);
  await mkdir(join(source, ".cocoindex_code"));
  for (const [index, shard] of shards.entries()) {
    const path = `note-${index}.md`;
    await Bun.write(join(source, path), path);
    await Bun.write(join(shard.project, path), path);
  }
  const manifest = {
    schema: 1,
    source_root: source,
    scope_sha256: hash("fixture"),
    files: 2,
    shards,
    inventory: shards.map((_, index) => ({
      path: `note-${index}.md`,
      sha256: hash(`note-${index}.md`),
      shard: index + 1,
    })),
  };
  const text = JSON.stringify(manifest);
  const manifestPath = join(root, "manifest.json");
  await Bun.write(manifestPath, text);
  const config = join(source, ".cocoindex_code", "rr.toml");
  const declare = (sha256: string) =>
    Bun.write(
      config,
      `[index]\nmax_est_chunks = 50000\n\n[shards]\nmanifest = ${JSON.stringify(manifestPath)}\nsha256 = "${sha256}"\n`,
    );
  await declare(hash(text));
  const loaded = (await loadShardManifest(source))._unsafeUnwrap();
  if (loaded === null) return expect.unreachable("fixture failed to load");
  return {
    source,
    loaded,
    manifestPath,
    config,
    declare,
    text,
    copies: shards.map((shard) => shard.project),
  };
}

const noteScope = ["note-0.md", "note-1.md"];
const message = (result: { isErr(): boolean; _unsafeUnwrapErr(): Error }) =>
  result.isErr() ? result._unsafeUnwrapErr().message : "";

test("accepts the full source scope with identical source and copies", async () => {
  const { loaded } = await fixture();
  expect((await verifyShardFiles(loaded, noteScope)).isOk()).toBe(true);
});

test("an added source note is refused as stale coverage", async () => {
  const { loaded } = await fixture();
  expect(
    message(await verifyShardFiles(loaded, [...noteScope, "new.md"])),
  ).toContain("coverage is stale");
});

test("an edited source note is refused even though its copy is untouched", async () => {
  const { loaded, source } = await fixture();
  await Bun.write(join(source, "note-0.md"), "edited");
  expect(message(await verifyShardFiles(loaded, noteScope))).toContain(
    "content is stale",
  );
});

test("a changed derived copy is refused even when the source has not changed", async () => {
  const { loaded, copies } = await fixture();
  await Bun.write(join(copies[1] ?? "", "note-1.md"), "corrupted");
  expect(message(await verifyShardFiles(loaded, noteScope))).toContain(
    "content is stale",
  );
});

test("a missing derived copy is refused", async () => {
  const { loaded, copies } = await fixture();
  await rm(join(copies[0] ?? "", "note-0.md"));
  expect(message(await verifyShardFiles(loaded, noteScope))).toContain(
    "content is stale",
  );
});

test("a manifest edited after it was pinned is refused", async () => {
  const { source, manifestPath } = await fixture();
  await Bun.write(manifestPath, "{}");
  expect(message(await loadShardManifest(source))).toContain(
    "manifest hash mismatch",
  );
});

test("a root is sharded only by an explicit [shards] declaration in rr.toml", async () => {
  const { source, config, manifestPath, text } = await fixture();
  // A manifest sitting beside the root must not be discovered without a declaration.
  await Bun.write(config, "[index]\nmax_est_chunks = 50000\n");
  expect((await loadShardManifest(source))._unsafeUnwrap()).toBeNull();
  await rm(config);
  expect((await loadShardManifest(source))._unsafeUnwrap()).toBeNull();
  // A relative manifest, an unknown key, or a non-hash digest is refused, not ignored.
  for (const body of [
    `[shards]\nmanifest = "manifest.json"\nsha256 = "${hash(text)}"\n`,
    `[shards]\nmanifest = ${JSON.stringify(manifestPath)}\nsha256 = "${hash(text)}"\nextra = 1\n`,
    `[shards]\nmanifest = ${JSON.stringify(manifestPath)}\nsha256 = "nope"\n`,
  ]) {
    await Bun.write(config, body);
    expect(message(await loadShardManifest(source))).toContain(
      "invalid rr.toml [shards]",
    );
  }
});

test("a declaration pinned to another manifest digest is refused", async () => {
  const { source, declare } = await fixture();
  await declare(hash("another manifest"));
  expect(message(await loadShardManifest(source))).toContain(
    "manifest hash mismatch",
  );
});

test("a declaration for another source root is refused", async () => {
  const { source, manifestPath, text } = await fixture();
  const other = join(source, "..", "other");
  await mkdir(join(other, ".cocoindex_code"), { recursive: true });
  await Bun.write(
    join(other, ".cocoindex_code", "rr.toml"),
    `[shards]\nmanifest = ${JSON.stringify(manifestPath)}\nsha256 = "${hash(text)}"\n`,
  );
  expect(message(await loadShardManifest(other))).toContain(
    "source_root mismatch",
  );
});

test("a later shard failure suppresses earlier hits and PASS", async () => {
  const { loaded } = await fixture();
  let called = 0;
  const result = await collectShardResults(loaded, () => {
    called += 1;
    return Promise.resolve(
      called === 1
        ? { ...idle, stdout: "a real hit\nRESULT: PASS\n" }
        : { ...idle, stderr: "NO_INDEX", exitCode: 3 },
    );
  });
  expect(called).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.exitCode).toBe(3);
});

test("union includes both shards, maps paths, hides copy paths, and removes child verdicts", async () => {
  const { loaded, copies } = await fixture();
  const result = await collectShardResults(loaded, (project) =>
    Promise.resolve({
      ...idle,
      stdout: `${project}/note.md\nRESULT: PASS\n`,
      stderr: `ROUTE: concept project=${project}\n`,
    }),
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(`${loaded.source_root}/note.md`);
  expect(result.stdout).not.toContain("RESULT: PASS");
  for (const copy of copies) {
    expect(result.stdout).not.toContain(copy);
    expect(result.stderr).not.toContain(copy);
  }
  expect(result.stderr).toContain(`${loaded.source_root} [shard 2/2]`);
});

test("NO_MATCH requires every shard, whereas timeout cannot be NO_MATCH", async () => {
  const { loaded } = await fixture();
  const missed = await collectShardResults(loaded, () =>
    Promise.resolve({ ...idle, exitCode: 1 }),
  );
  expect(missed.exitCode).toBe(1);
  const timedOut = await collectShardResults(loaded, () =>
    Promise.resolve({
      ...idle,
      stdout: "partial",
      exitCode: 124,
      timedOut: true,
    }),
  );
  expect(timedOut.exitCode).toBe(124);
  expect(timedOut.stdout).toBe("");
});

test("a shard without an index watermark is refused before any search starts", async () => {
  const { loaded } = await fixture();
  const db = join(loaded.source_root, "..", "db");
  const env = { [MAPPING]: `${loaded.source_root}/..=${db}` };
  expect(message(await requireIndexedShards(loaded, env))).toContain(
    "is not indexed",
  );
  // Only the first shard certified: the second still refuses the whole search.
  const first = join(db, "one");
  await mkdir(first, { recursive: true });
  await Bun.write(join(first, "INDEXED_AT"), "x");
  expect(message(await requireIndexedShards(loaded, env))).toContain(
    "shard 2/2 is not indexed",
  );
  const second = join(db, "two");
  await mkdir(second, { recursive: true });
  await Bun.write(join(second, "INDEXED_AT"), "x");
  expect((await requireIndexedShards(loaded, env)).isOk()).toBe(true);
});

// A stand-in for cocoindex/db-root: one line, relative to $HOME.
async function declaration(root: string) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "rr-dbroot-")));
  const file = join(dir, "db-root");
  await Bun.write(file, `${root}\n`);
  return { dir, file };
}

test("a missing mapping variable is derived from the one db-root declaration", async () => {
  const { loaded } = await fixture();
  const { dir, file } = await declaration("state/db");
  const env = (await shardEnv(loaded, { HOME: dir }, file))._unsafeUnwrap();
  expect(env[MAPPING]).toBe(`${dir}=${dir}/state/db`);
  // An empty variable counts as missing; a value equal to the derived one is kept.
  expect(
    (
      await shardEnv(loaded, { HOME: dir, [MAPPING]: "" }, file)
    )._unsafeUnwrap()[MAPPING],
  ).toBe(`${dir}=${dir}/state/db`);
  expect(
    (
      await shardEnv(
        loaded,
        { HOME: dir, [MAPPING]: `${dir}=${dir}/state/db` },
        file,
      )
    )._unsafeUnwrap()[MAPPING],
  ).toBe(`${dir}=${dir}/state/db`);
});

test("a process mapping that resolves elsewhere is refused, never preferred", async () => {
  const { loaded } = await fixture();
  const { file } = await declaration("state/db");
  const home = join(loaded.source_root, "..");
  const stale = {
    HOME: home,
    [MAPPING]: `${home}=${home}/.cache/cocoindex-code/db`,
  };
  expect(message(await shardEnv(loaded, stale, file))).toContain(
    "locates shard DBs differently",
  );
});

test("a process mapping that reaches the same directory through a symlink is accepted", async () => {
  const { loaded } = await fixture();
  const { file } = await declaration("state/db");
  const home = join(loaded.source_root, "..");
  await mkdir(join(home, "state"));
  await mkdir(join(home, "elsewhere"));
  await Bun.$`ln -s ${join(home, "elsewhere")} ${join(home, "state", "db")}`.quiet();
  const env = { HOME: home, [MAPPING]: `${home}=${home}/elsewhere` };
  expect((await shardEnv(loaded, env, file))._unsafeUnwrap()).toBe(env);
});

test("an unreadable or unsafe db-root declaration is refused", async () => {
  const { loaded } = await fixture();
  const { dir } = await declaration("state/db");
  expect(
    message(await shardEnv(loaded, { HOME: dir }, join(dir, "missing"))),
  ).toContain("missing");
  for (const bad of ["", "/abs/db", "../up/db"]) {
    const { file } = await declaration(bad);
    expect(message(await shardEnv(loaded, { HOME: dir }, file))).toContain(
      "expected a non-empty path relative to $HOME",
    );
  }
});
