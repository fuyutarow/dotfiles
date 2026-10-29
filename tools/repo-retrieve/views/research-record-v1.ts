// Machine consumer: one JSON measurement on stdout; failures on stderr, exit 2.
import { constants } from "node:fs";
import {
  mkdir,
  open,
  opendir,
  readdir,
  realpath,
  stat,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { cli } from "cleye";
import { err, ok, ResultAsync, type Result } from "neverthrow";
import { attempt, errorMessage } from "@dotfiles/shared/src/attempt.ts";
import { z } from "@dotfiles/shared/src/zod.ts";
import { plainHelp } from "@dotfiles/shared/src/cli.ts";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const formatSchema = z.object({
  physical_format_version: z.literal(1),
  manifest_format: z.literal(1),
  object_hash: z.literal("sha256-canonical-bytes"),
});
const manifestSchema = z.object({
  format: z.literal(1),
  fragment_id: hashSchema,
  objects: z.array(hashSchema),
  introduced: z.array(hashSchema),
  replay_sha256: hashSchema,
});
const objectSchema = z.looseObject({
  id: hashSchema,
  kind: z.string().regex(/^[a-z][a-z0-9_-]*$/u),
  schema_version: z.literal(1),
  text: z.string().optional(),
});

function contains(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return (
    rel === "" ||
    (!rel.startsWith(`..${sep}`) && rel !== ".." && !rel.startsWith(sep))
  );
}

// Resolve even a not-yet-created output through its closest existing ancestor.
async function resolvedDestination(
  path: string,
): Promise<Result<string, string>> {
  const found = await attempt(() => realpath(path));
  if (found.ok) return ok(found.value);
  const code = z.object({ code: z.literal("ENOENT") }).safeParse(found.error);
  if (!code.success) return err(errorMessage(found.error));
  const parent = await resolvedDestination(dirname(path));
  return parent.map((value) =>
    join(value, path.slice(dirname(path).length + 1)),
  );
}

async function readToml<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<Result<T, string>> {
  const parsed = await attempt(async () =>
    Bun.TOML.parse(await Bun.file(path).text()),
  );
  if (!parsed.ok) return err(path + ": " + errorMessage(parsed.error));
  const checked = schema.safeParse(parsed.value);
  return checked.success
    ? ok(checked.data)
    : err(path + ": " + checked.error.message);
}

function render(record: z.infer<typeof objectSchema>, source: string): string {
  const fields = ["mode", "status", "closing_condition"]
    .filter((key) => record[key] !== undefined)
    .map(
      (key) =>
        `${key}: ${typeof record[key] === "string" ? record[key] : JSON.stringify(record[key])}`,
    );
  return `# ${record.kind} ${record.id}\n${fields.join("\n")}\nsource: ${source}\nfragment: ${basename(dirname(dirname(source)))}\n\n${record.text ?? ""}\n`;
}

async function exportInner(options: {
  store: string;
  out: string;
  kinds?: string[];
  shards?: number;
}) {
  const store = await realpath(resolve(options.store));
  const destination = await resolvedDestination(resolve(options.out));
  if (destination.isErr()) return err(destination.error);
  const out = destination.value;
  if (contains(store, out) || contains(out, store))
    return err("--out must be outside and disjoint from --store");
  const format = await readToml(join(store, "FORMAT"), formatSchema);
  if (format.isErr()) return err(format.error);
  const kinds = new Set(options.kinds ?? ["statement"]);
  const shards = options.shards ?? 1;
  if (!Number.isInteger(shards) || shards < 1 || shards > 16)
    return err("--shards must be an integer from 1 to 16");
  if (
    kinds.size === 0 ||
    [...kinds].some((kind) => !/^[a-z][a-z0-9_-]*$/u.test(kind))
  )
    return err("--kinds must be comma-separated object kinds");
  await mkdir(out, { recursive: true });
  const directories = Array.from({ length: shards }, (_, index) =>
    shardDirectory(out, index, shards),
  );
  for (const directory of directories) {
    await mkdir(directory, { recursive: true });
    if ((await realpath(directory)) !== directory)
      return err(`Symlink output directory: ${directory}`);
  }
  const counts: Record<string, number> = {};
  let fragments = 0;
  let objects = 0;
  let selected = 0;
  let sourceBytes = 0;
  let outputBytes = 0;
  let unchanged = 0;
  // Only one fragment's manifest/filenames and one object's payload are resident.
  const fragmentNames = (await readdir(join(store, "fragments"))).toSorted();
  for (const fragment of fragmentNames) {
    if (!hashSchema.safeParse(fragment).success)
      return err(`Invalid fragment: ${fragment}`);
    const fragmentPath = join(store, "fragments", fragment);
    if ((await realpath(fragmentPath)) !== fragmentPath)
      return err(`Symlink fragment: ${fragmentPath}`);
    const checked = await readToml(
      join(fragmentPath, "MANIFEST"),
      manifestSchema,
    );
    if (checked.isErr()) return err(checked.error);
    const manifest = checked.value;
    if (manifest.fragment_id !== fragment)
      return err(`MANIFEST fragment mismatch: ${fragmentPath}`);
    const declared = new Set(manifest.objects);
    const introduced = new Set(manifest.introduced);
    if ([...introduced].some((hash) => !declared.has(hash)))
      return err(`Undeclared introduced object in ${fragmentPath}`);
    fragments++;
    const objectDir = join(fragmentPath, "objects");
    if ((await realpath(objectDir)) !== objectDir)
      return err(`Symlink objects directory: ${objectDir}`);
    const processed = await processObjects(
      objectDir,
      declared,
      out,
      kinds,
      shards,
    );
    if (processed.isErr()) return err(processed.error);
    const batch = processed.value;
    objects += batch.objects;
    selected += batch.selected;
    sourceBytes += batch.sourceBytes;
    outputBytes += batch.outputBytes;
    unchanged += batch.unchanged;
    for (const [kind, count] of Object.entries(batch.counts))
      counts[kind] = (counts[kind] ?? 0) + count;
  }
  // Count physical output files separately from selected source occurrences.
  const inventory = await Promise.all(
    directories.map((directory) => countOutput(directory)),
  );
  const files = inventory.reduce((sum, item) => sum + item.files, 0);
  const bytes = inventory.reduce((sum, item) => sum + item.bytes, 0);
  return ok({
    store,
    out,
    kinds: [...kinds].toSorted(),
    fragments,
    objects,
    counts,
    sourceBytes,
    selected,
    outputBytes,
    unchanged,
    files,
    bytes,
    shards,
    directories,
  });
}

export function shardDirectory(
  out: string,
  index: number,
  shards: number,
): string {
  return shards === 1
    ? out
    : join(out, `shard-${String(index + 1).padStart(2, "0")}`);
}

export function shardIndex(hash: string, shards: number): number {
  return Math.floor((Number.parseInt(hash.charAt(0), 16) * shards) / 16);
}

async function countOutput(out: string) {
  let files = 0;
  let bytes = 0;
  for await (const entry of await opendir(out)) {
    if (
      /^[a-f0-9]{64}-[a-z][a-z0-9_-]*\.md$/u.test(entry.name) &&
      entry.isFile()
    ) {
      files++;
      bytes += (await stat(join(out, entry.name))).size;
    }
  }
  return { files, bytes };
}

function recordCounts(): Record<string, number> {
  return {};
}

async function processObjects(
  objectDir: string,
  declared: Set<string>,
  out: string,
  kinds: Set<string>,
  shards: number,
) {
  const batch = {
    objects: 0,
    selected: 0,
    sourceBytes: 0,
    outputBytes: 0,
    unchanged: 0,
    counts: recordCounts(),
  };
  for (const hash of (await readdir(objectDir)).toSorted()) {
    const loaded = await readObject(join(objectDir, hash), hash, declared);
    if (loaded.isErr()) return err(loaded.error);
    if (loaded.value.type === "payload") {
      batch.objects++;
      batch.counts["payload"] = (batch.counts["payload"] ?? 0) + 1;
      batch.sourceBytes += loaded.value.bytes;
      continue;
    }
    const { raw, record, path } = loaded.value;
    batch.objects++;
    batch.counts[record.kind] = (batch.counts[record.kind] ?? 0) + 1;
    batch.sourceBytes += Buffer.byteLength(raw);
    const written = await writeObject(
      record,
      path,
      shardDirectory(out, shardIndex(record.id, shards), shards),
      kinds,
    );
    if (written.isErr()) return err(written.error);
    batch.selected += written.value.selected;
    batch.outputBytes += written.value.bytes;
    batch.unchanged += written.value.unchanged;
  }
  return ok(batch);
}

async function readObject(path: string, hash: string, declared: Set<string>) {
  if (!hashSchema.safeParse(hash).success || !declared.has(hash))
    return err(`Invalid or undeclared object: ${path}`);
  if ((await realpath(path)) !== path) return err(`Symlink object: ${path}`);
  const digest = new Bun.CryptoHasher("sha256");
  const input = Bun.file(path);
  for await (const chunk of input.stream()) digest.update(chunk);
  if (digest.digest("hex") === hash)
    return ok({ type: "payload" as const, bytes: input.size });
  const raw = await Bun.file(path).text();
  const parsed = await attempt(() => Bun.TOML.parse(raw));
  if (!parsed.ok) return err(path + ": " + errorMessage(parsed.error));
  const checked = objectSchema.safeParse(parsed.value);
  if (!checked.success) return err(path + ": " + checked.error.message);
  const record = checked.data;
  if (record.id !== hash) return err(`Object id mismatch: ${path}`);
  const canonical = raw.replace(/^id = "[a-f0-9]{64}"\n/mu, "");
  if (new Bun.CryptoHasher("sha256").update(canonical).digest("hex") !== hash)
    return err(`Canonical hash mismatch: ${path}`);
  return ok({ type: "record" as const, raw, record, path });
}

async function writeObject(
  record: z.infer<typeof objectSchema>,
  path: string,
  out: string,
  kinds: Set<string>,
) {
  if (!kinds.has(record.kind))
    return ok({ selected: 0, bytes: 0, unchanged: 0 });
  if (record.kind === "statement" && record.text === undefined)
    return err(`Statement missing text: ${path}`);
  const markdown = render(record, path);
  const target = join(out, `${record.id}-${record.kind}.md`);
  const file = await open(
    target,
    constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW,
    0o644,
  );
  const written = await attempt(async () => {
    const info = await file.stat();
    if (!info.isFile() || info.nlink !== 1) return null;
    const previous = await file.readFile("utf8");
    if (previous === markdown) return 1;
    await file.truncate(0);
    await file.write(markdown, 0, "utf8");
    return 0;
  });
  await file.close();
  if (!written.ok) return err(errorMessage(written.error));
  if (written.value === null)
    return err(`Output must be a regular file with one link: ${target}`);
  return ok({
    selected: 1,
    bytes: Buffer.byteLength(markdown),
    unchanged: written.value,
  });
}

export function exportView(options: Parameters<typeof exportInner>[0]) {
  return ResultAsync.fromPromise(
    Promise.resolve().then(() => exportInner(options)),
    errorMessage,
  ).andThen((result) => result);
}

function rejectPrototypeFlag(type: string, flag: string): boolean {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("Unknown flag: --__proto__\n");
    process.exit(2);
  }
  return false;
}

async function main() {
  const args = cli({
    name: "research-record-v1",
    parameters: [],
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    help: {
      description:
        "Export a derived Markdown view of a read-only v1 store. Use a dedicated output directory; old files are never deleted.",
      render: plainHelp,
    },
    flags: {
      store: { type: String },
      out: { type: String },
      kinds: { type: String, default: "statement" },
      shards: {
        type: Number,
        default: 1,
        description:
          "Partition all selected objects into 1–16 leading-hash groups",
      },
    },
  });
  if (
    args._.length > 0 ||
    args.flags.store === undefined ||
    args.flags.out === undefined
  )
    return err(
      "Required: --store <root> --out <directory> [--kinds statement,...]",
    );
  const result = await exportView({
    store: args.flags.store,
    out: args.flags.out,
    kinds: args.flags.kinds.split(","),
    shards: args.flags.shards,
  });
  if (result.isErr()) return result;
  process.stdout.write(`${JSON.stringify(result.value)}\n`);
  return ok(undefined);
}

if (import.meta.main) {
  const called = await attempt(main);
  const result = called.ok ? called.value : err(errorMessage(called.error));
  if (result.isErr()) {
    process.stderr.write(`FATAL: ${result.error}\n`);
    process.exitCode = 2;
  }
}
