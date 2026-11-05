// A source root may delegate semantic retrieval to immutable, independently indexed copies,
// declared by an explicit `[shards]` table in its .cocoindex_code/rr.toml (never discovered).
// Buffer every result: one missing/stale shard must never produce a partial PASS/NO_MATCH.
import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { err, ok, type Result } from "neverthrow";
import { z, jsonOf } from "@dotfiles/shared/src/zod.ts";
import { attempt, errorMessage } from "@dotfiles/shared/src/attempt.ts";
import { computeIndexPlan, ShardsDeclarationSchema } from "./index-plan.ts";
import { requireExecutable, runChildCaptured } from "./child.ts";
import { MAPPING_ENV, resolveDbDir } from "./ccc-db-dir.ts";

const digest = (bytes: string | ArrayBuffer) =>
  new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
const Absolute = z.string().refine(isAbsolute, "expected an absolute path");
const Relative = z
  .string()
  .refine(
    (path) =>
      !isAbsolute(path) &&
      path
        .split("/")
        .every(
          (part) =>
            part !== "" &&
            part !== "." &&
            part !== ".." &&
            !part.includes("\\"),
        ),
    "expected a canonical relative path",
  );
const Declared = z.looseObject({ shards: ShardsDeclarationSchema.optional() });
const Manifest = z.object({
  schema: z.literal(1),
  source_root: Absolute,
  scope_sha256: Hash,
  files: z.number().int().positive(),
  shards: z.array(z.object({ project: Absolute })).min(2),
  inventory: z.array(
    z.object({
      path: Relative,
      sha256: Hash,
      shard: z.number().int().positive(),
    }),
  ),
});
export type ShardManifest = z.infer<typeof Manifest>;
type Env = Record<string, string | undefined>;
type Capture = {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
};

/** The manifest's own invariants: unique paths/projects and every shard non-empty. */
function checkManifestShape(
  manifest: ShardManifest,
): Result<ShardManifest, Error> {
  const paths = new Set(manifest.inventory.map((entry) => entry.path));
  const projects = new Set(manifest.shards.map((shard) => shard.project));
  if (
    manifest.inventory.length !== manifest.files ||
    paths.size !== manifest.files ||
    projects.size !== manifest.shards.length
  )
    return err(
      new Error(
        "shard manifest has duplicate paths/projects or incomplete coverage",
      ),
    );
  const used = new Set(manifest.inventory.map((entry) => entry.shard));
  if (
    used.size !== manifest.shards.length ||
    [...used].some((index) => index > manifest.shards.length)
  )
    return err(
      new Error("shard manifest has invalid or empty shard assignments"),
    );
  return ok(manifest);
}

/** `null` when the root declares no `[shards]`; an error when the declaration cannot be trusted. */
export async function loadShardManifest(
  project: string,
): Promise<Result<ShardManifest | null, Error>> {
  const file = Bun.file(join(project, ".cocoindex_code", "rr.toml"));
  if (!(await file.exists())) return ok(null);
  const toml = await attempt(async () => Bun.TOML.parse(await file.text()));
  if (!toml.ok)
    return err(new Error(`invalid rr.toml: ${errorMessage(toml.error)}`));
  const declared = Declared.safeParse(toml.value);
  if (!declared.success)
    return err(
      new Error(`invalid rr.toml [shards]: ${declared.error.message}`),
    );
  const config = declared.data.shards;
  if (config === undefined) return ok(null);
  const text = await attempt(() => Bun.file(config.manifest).text());
  if (!text.ok)
    return err(
      new Error(`shard manifest unreadable: ${errorMessage(text.error)}`),
    );
  if (digest(text.value) !== config.sha256)
    return err(new Error("shard manifest hash mismatch"));
  const parsed = jsonOf(Manifest).safeParse(text.value);
  if (!parsed.success)
    return err(new Error(`invalid shard manifest: ${parsed.error.message}`));
  const real = await attempt(() => realpath(project));
  if (!real.ok || real.value !== parsed.data.source_root)
    return err(new Error("shard source_root mismatch"));
  return checkManifestShape(parsed.data);
}

// The one declaration of the index DB root, relative to $HOME (shared with zsh/zshenv, the
// daemon launcher and disk-reclaim). tools/<name>/ may not import another tool, so read it here.
export const DB_ROOT_DECLARATION = resolve(
  import.meta.dir,
  "../../../cocoindex/db-root",
);

/** The daemon's COCOINDEX_CODE_DB_PATH_MAPPING, derived from the declaration (`$HOME=$HOME/<root>`). */
export async function declaredMapping(
  home: string,
  declaration: string,
): Promise<Result<string, Error>> {
  const read = await attempt(() => readFile(declaration, "utf8"));
  if (!read.ok)
    return err(new Error(`${declaration}: ${errorMessage(read.error)}`));
  const root = read.value.trim();
  if (root === "" || isAbsolute(root) || root.split("/").includes(".."))
    return err(
      new Error(`${declaration}: expected a non-empty path relative to $HOME`),
    );
  return ok(`${home}=${join(home, root)}`);
}

/** Do two mapping values put this project's DB in one directory? (Mapping targets are symlink-resolved.) */
async function sameDbDir(project: string, a: Env, b: Env): Promise<boolean> {
  const [first, second] = await Promise.all([
    resolveDbDir(project, a),
    resolveDbDir(project, b),
  ]);
  return first.isOk() && second.isOk() && first.value === second.value;
}

/**
 * The environment shard searches run in. A missing mapping variable is derived from the one
 * declaration; a process value that locates the shard DBs elsewhere is refused, never preferred.
 */
export async function shardEnv(
  shards: ShardManifest,
  env: Env = process.env,
  declaration: string = DB_ROOT_DECLARATION,
): Promise<Result<Env, Error>> {
  const declared = await declaredMapping(env["HOME"] ?? homedir(), declaration);
  if (declared.isErr()) return err(declared.error);
  const withDeclared = { ...env, [MAPPING_ENV]: declared.value };
  const actual = env[MAPPING_ENV];
  if (actual === undefined || actual === "" || actual === declared.value)
    return ok(withDeclared);
  if (await sameDbDir(shards.shards[0]?.project ?? "", env, withDeclared))
    return ok(env);
  return err(
    new Error(
      `${MAPPING_ENV}=${actual} locates shard DBs differently from ${declaration} (${declared.value})`,
    ),
  );
}

/** Every shard must already carry its index watermark; a search never starts indexing. */
export async function requireIndexedShards(
  shards: ShardManifest,
  env: Env,
): Promise<Result<void, Error>> {
  for (const [index, shard] of shards.shards.entries()) {
    const dir = await resolveDbDir(shard.project, env);
    if (dir.isErr()) return err(dir.error);
    if (!(await Bun.file(join(dir.value, "INDEXED_AT")).exists()))
      return err(
        new Error(
          `shard ${index + 1}/${shards.shards.length} is not indexed: no INDEXED_AT in ${dir.value}; this search starts no indexing`,
        ),
      );
  }
  return ok();
}

async function checkCanonicalCopy(
  path: string,
  sha256: string,
): Promise<Result<void, Error>> {
  const content = await attempt(async () => ({
    real: await realpath(path),
    hash: digest(await Bun.file(path).arrayBuffer()),
  }));
  if (
    !content.ok ||
    content.value.real !== path ||
    content.value.hash !== sha256
  )
    return err(new Error(`shard content is stale or noncanonical: ${path}`));
  return ok();
}

/** Source scope must equal the manifest inventory, and the source and every copy must hash-match. */
export async function verifyShardFiles(
  manifest: ShardManifest,
  sourcePaths: string[],
): Promise<Result<void, Error>> {
  const expected = new Set(manifest.inventory.map((entry) => entry.path));
  if (
    sourcePaths.length !== expected.size ||
    sourcePaths.some((path) => !expected.has(path))
  )
    return err(
      new Error(
        "shard coverage is stale: source scope changed; regenerate and index the view",
      ),
    );
  const targets: { path: string; sha256: string }[] = [];
  for (const entry of manifest.inventory) {
    const shard = manifest.shards[entry.shard - 1];
    if (shard === undefined) return err(new Error("missing shard assignment"));
    targets.push(
      { path: join(manifest.source_root, entry.path), sha256: entry.sha256 },
      { path: join(shard.project, entry.path), sha256: entry.sha256 },
    );
  }
  for (const target of targets) {
    const checked = await checkCanonicalCopy(target.path, target.sha256);
    if (checked.isErr()) return checked;
  }
  return ok();
}

export async function collectShardResults(
  manifest: ShardManifest,
  search: (project: string) => Promise<Capture>,
): Promise<Capture> {
  const output: string[] = [];
  const diagnostics: string[] = [];
  let found = false;
  for (const [index, shard] of manifest.shards.entries()) {
    const result = await search(shard.project);
    // The copy path is an implementation detail; name the source root and the shard ordinal.
    diagnostics.push(
      result.stderr.replaceAll(
        shard.project,
        `${manifest.source_root} [shard ${index + 1}/${manifest.shards.length}]`,
      ),
    );
    if (result.timedOut || ![0, 1].includes(result.exitCode))
      return { ...result, stdout: "", stderr: diagnostics.join("") };
    found ||= result.exitCode === 0;
    // Do not expose child PASS markers. The only PASS belongs to the complete union.
    output.push(
      result.stdout
        .split("\n")
        .filter((line) => !line.startsWith("RESULT:"))
        .join("\n")
        .replaceAll(`${shard.project}/`, `${manifest.source_root}/`),
    );
  }
  return {
    stdout: output.join("\n"),
    stderr: diagnostics.join(""),
    exitCode: found ? 0 : 1,
    timedOut: false,
  };
}

async function scopePaths(
  project: string,
  ccc: string,
): Promise<Result<string[], Error>> {
  // Use the backend's actual matcher, including additions/removals and changed settings.
  // Source admission violations do not prevent read-only enumeration of its full scope.
  const scope = await computeIndexPlan(project, ccc);
  return scope.map((plan) => plan.files.map((entry) => entry.path));
}

async function verifyScope(
  manifest: ShardManifest,
  project: string,
  ccc: string,
): Promise<Result<void, Error>> {
  const paths = await scopePaths(project, ccc);
  if (paths.isErr()) return err(paths.error);
  return verifyShardFiles(manifest, paths.value);
}

function insideRoot(
  project: string,
  path: string | undefined,
): Result<string | undefined, Error> {
  if (path === undefined || !isAbsolute(path)) return ok(path);
  const inner = relative(project, path);
  if (inner === ".." || inner.startsWith("../"))
    return err(new Error("shard --path must be inside source root"));
  return ok(inner);
}

/** `ok(null)`: the root declares no shards, so the caller searches it directly. */
export async function searchShards(options: {
  project: string;
  route: "concept" | "battery";
  queries: string[];
  path: string | undefined;
  limit: number;
  timeoutMs: number;
  json: boolean;
}): Promise<Result<Capture | null, Error>> {
  const real = await attempt(() => realpath(resolve(options.project)));
  if (!real.ok) return ok(null);
  const project = real.value;
  const loaded = await loadShardManifest(project);
  if (loaded.isErr()) return err(loaded.error);
  const manifest = loaded.value;
  if (manifest === null) return ok(null);
  if (options.json)
    return err(
      new Error("sharded semantic retrieval does not support --json yet"),
    );
  const ccc = requireExecutable("ccc");
  if (ccc.isErr()) return err(ccc.error);
  const env = await shardEnv(manifest);
  if (env.isErr()) return err(env.error);
  const indexed = await requireIndexedShards(manifest, env.value);
  if (indexed.isErr()) return err(indexed.error);
  const before = await verifyScope(manifest, project, ccc.value);
  if (before.isErr()) return err(before.error);
  const path = insideRoot(project, options.path);
  if (path.isErr()) return err(path.error);
  const deadline = Temporal.Now.instant().epochMilliseconds + options.timeoutMs;
  const result = await collectShardResults(manifest, async (shard) => {
    const remaining = deadline - Temporal.Now.instant().epochMilliseconds;
    if (remaining <= 0)
      return {
        stdout: "",
        stderr: "RESULT: TIMEOUT during shard search\n",
        exitCode: 124,
        timedOut: true,
      };
    const args = [
      process.execPath,
      join(import.meta.dir, "repo-retrieve.ts"),
      options.route,
      "--project",
      shard,
      "--limit",
      String(options.limit),
      "--timeout-ms",
      String(remaining),
    ];
    for (const query of options.queries) args.push("--query", query);
    if (path.value !== undefined) args.push("--path", path.value);
    return runChildCaptured(args, remaining, false, shard, false, env.value);
  });
  if (![0, 1].includes(result.exitCode) || result.timedOut) return ok(result);
  // Source or copied files may have changed while the daemon answered.
  const after = await verifyScope(manifest, project, ccc.value);
  if (after.isErr()) return err(after.error);
  const label = result.exitCode === 0 ? "PASS" : "NO_MATCH";
  result.stdout += `\nRESULT: ${label} route=${options.route} engine=ccc shards=${manifest.shards.length} source=${project} files=${manifest.files} scope=${manifest.scope_sha256} limit_per_shard=${options.limit}; union of independently ranked shard results\n`;
  return ok(result);
}
