import { expect, test } from "bun:test";
import { link, mkdir, mkdtemp, readdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportView, shardIndex } from "../views/research-record-v1.ts";

// Synthesized TOML follows the inspected real FORMAT, MANIFEST and object encoding.
const format =
  'physical_format_version = 1\nmanifest_format = 1\nobject_hash = "sha256-canonical-bytes"\n';
const fragment = "a".repeat(64);
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "rr-v1-view-"));
  const store = join(root, "store");
  const out = join(root, "view");
  const dir = join(store, "fragments", fragment);
  await mkdir(join(dir, "objects"), { recursive: true });
  await Bun.write(join(store, "FORMAT"), format);
  const objects = [
    'closing_condition = "A proof closes this claim."\nkind = "statement"\nmode = "deduction"\nschema_version = 1\nstatus = "open"\ntext = "STATUS=open; 日本語\\n[source: notes/proof.md] ``` preserved"\nuses = []\n',
    'kind = "citation"\nline = 2\npath = "notes/proof.md"\nrepository = "/synthetic"\nschema_version = 1\n',
    'kind = "run"\nschema_version = 1\n\n[[inputs]]\nkind = "literal"\nname = "input"\n',
  ];
  const hashes = objects.map((raw) =>
    new Bun.CryptoHasher("sha256").update(raw).digest("hex"),
  );
  for (const [i, raw] of objects.entries())
    await Bun.write(
      join(dir, "objects", hashes[i] ?? ""),
      `id = "${hashes[i]}"\n${raw}`,
    );
  const payload = new Uint8Array([0, 255, 10, 123, 125]);
  const payloadHash = new Bun.CryptoHasher("sha256")
    .update(payload)
    .digest("hex");
  hashes.push(payloadHash);
  await Bun.write(join(dir, "objects", payloadHash), payload);
  const manifest = `format = 1\nfragment_id = "${fragment}"\nobjects = ${JSON.stringify(hashes)}\nintroduced = ${JSON.stringify(hashes)}\nreplay_sha256 = "${"b".repeat(64)}"\n`;
  await Bun.write(join(dir, "MANIFEST"), manifest);
  return { root, store, out, dir, hashes, manifest };
}

test("verbatim text, all fields, stable bytes and untouched source", async () => {
  const f = await fixture();
  const before = await Bun.file(join(f.dir, "MANIFEST")).text();
  const first = await exportView(f);
  expect(first.isOk()).toBe(true);
  if (first.isErr()) return;
  expect(first.value.counts).toEqual({
    statement: 1,
    citation: 1,
    run: 1,
    payload: 1,
  });
  expect(first.value.files).toBe(1);
  const path = join(f.out, `${f.hashes[0]}-statement.md`);
  const bytes = await Bun.file(path).text();
  expect(bytes).toContain(
    "STATUS=open; 日本語\n[source: notes/proof.md] ``` preserved",
  );
  expect(bytes).toContain("mode: deduction");
  expect(bytes).toContain("status: open");
  expect(bytes).toContain("closing_condition: A proof closes this claim.");
  expect(bytes).toContain(`fragment: ${fragment}`);
  expect(bytes).not.toContain("schema_version");
  expect(bytes).toContain(join(f.dir, "objects", f.hashes[0] ?? ""));
  const second = await exportView(f);
  expect(second.isOk()).toBe(true);
  if (second.isOk()) expect(second.value.unchanged).toBe(1);
  expect(await Bun.file(path).text()).toBe(bytes);
  expect(await Bun.file(join(f.dir, "MANIFEST")).text()).toBe(before);
  expect((await readdir(f.store)).toSorted()).toEqual(["FORMAT", "fragments"]);
});

test("kind selection counts top-level objects, not nested input kinds", async () => {
  const f = await fixture();
  const result = await exportView({ ...f, kinds: ["citation", "run"] });
  expect(result.isOk()).toBe(true);
  if (result.isOk()) expect(result.value.files).toBe(2);
});

test("shards retain every selected object once, with stable bytes", async () => {
  const f = await fixture();
  const kinds = ["statement", "citation", "run"];
  const first = await exportView({ ...f, kinds, shards: 3 });
  expect(first.isOk()).toBe(true);
  if (first.isErr()) return;
  expect(first.value.files).toBe(3);
  expect(first.value.directories).toHaveLength(3);
  const directories = first.value.directories;
  const names = (
    await Promise.all(directories.map((dir) => readdir(dir)))
  ).flat();
  expect(new Set(names).size).toBe(3);
  const second = await exportView({ ...f, kinds, shards: 3 });
  expect(second.isOk()).toBe(true);
  if (second.isOk()) expect(second.value.unchanged).toBe(3);
  expect(shardIndex("0", 3)).toBe(0);
  expect(shardIndex("5", 3)).toBe(0);
  expect(shardIndex("6", 3)).toBe(1);
  expect(shardIndex("a", 3)).toBe(1);
  expect(shardIndex("b", 3)).toBe(2);
  expect(shardIndex("f", 3)).toBe(2);
  expect((await exportView({ ...f, shards: 0 })).isErr()).toBe(true);
});

test("refuses incompatible FORMAT, corrupted hash and missing manifest membership", async () => {
  const f = await fixture();
  await Bun.write(
    join(f.store, "FORMAT"),
    format.replace("version = 1", "version = 2"),
  );
  expect((await exportView(f)).isErr()).toBe(true);
  await Bun.write(join(f.store, "FORMAT"), format);
  const object = join(f.dir, "objects", f.hashes[0] ?? "");
  await Bun.write(
    object,
    (await Bun.file(object).text()).replace("deduction", "observation"),
  );
  expect((await exportView(f)).isErr()).toBe(true);
  await Bun.write(
    join(f.dir, "MANIFEST"),
    f.manifest.replace(JSON.stringify(f.hashes), "[]"),
  );
  expect((await exportView(f)).isErr()).toBe(true);
});

test("refuses output inside store, symlink aliases, and output file symlinks", async () => {
  const f = await fixture();
  expect((await exportView({ ...f, out: join(f.store, "view") })).isErr()).toBe(
    true,
  );
  await symlink(f.store, join(f.root, "alias"));
  expect(
    (await exportView({ ...f, out: join(f.root, "alias", "view") })).isErr(),
  ).toBe(true);
  await mkdir(f.out);
  await symlink(
    join(f.store, "FORMAT"),
    join(f.out, `${f.hashes[0]}-statement.md`),
  );
  expect((await exportView(f)).isErr()).toBe(true);
  expect(await Bun.file(join(f.store, "FORMAT")).text()).toBe(format);
});

test("refuses an output hardlink into the read-only store", async () => {
  const f = await fixture();
  await mkdir(f.out);
  await link(
    join(f.store, "FORMAT"),
    join(f.out, `${f.hashes[0]}-statement.md`),
  );
  expect((await exportView(f)).isErr()).toBe(true);
  expect(await Bun.file(join(f.store, "FORMAT")).text()).toBe(format);
});

test("CLI works from another cwd and refuses bad arguments", async () => {
  const f = await fixture();
  const script = join(import.meta.dir, "../views/research-record-v1.ts");
  async function run(args: string[]) {
    const child = Bun.spawn([process.execPath, script, ...args], {
      cwd: f.root,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10000,
    });
    const [exit, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { exit, stdout, stderr };
  }
  expect((await run(["--store", f.store, "--out", f.out])).exit).toBe(0);
  expect((await run(["--help"])).exit).toBe(0);
  expect((await run(["--no-such-flag"])).exit).toBe(1);
  expect((await run(["--__proto__"])).exit).toBe(2);
  expect((await run(["extra", "--store", f.store, "--out", f.out])).exit).toBe(
    2,
  );
  expect((await run([])).exit).toBe(2);
});
