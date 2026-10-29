import { cli } from "cleye";
import type { Dirent } from "node:fs";
import {
  access,
  cp,
  lstat,
  mkdir,
  readdir,
  realpath,
  rename,
  rm,
  unlink,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { err, ok, type Result } from "neverthrow";
import { jsonOf, z } from "../agents/hooks/zod.ts";

// Bring EVERY registered Obsidian vault in line with this directory (single source):
//   app.json     — keys merged into each vault's .obsidian/app.json
//   plugins.json — community plugins installed into .obsidian/plugins/<id>/ and enabled in
//                  .obsidian/community-plugins.json, pinned by release tag AND sha256 per file;
//                  declared settings merged into each plugin's data.json. Local plugins are
//                  pinned by this repository commit.
// Run via `mise run mac:obsidian` (wired into `mise run mac:init`). Consumer: human, verdict lines.
// `--vault <dir>` applies only to that directory and initializes .obsidian/ when writing.
//
// WHY MERGE, NOT SYMLINK. Obsidian rewrites .obsidian/*.json whenever a setting is touched in its
// UI, and the vaults live on Google Drive — a symlink would be replaced by a real file on the first
// save (and Drive does not sync symlinks faithfully). So this owns only what it declares: other
// app.json keys and other enabled plugins stay as Obsidian wrote them.
//
// PINNED-OR-ABSENT. A plugin is executable code run inside Obsidian, so a release asset whose
// sha256 differs from plugins.json is FATAL, never installed. Bumping a plugin = new version and
// new hashes in plugins.json, in one reviewed change.
// Plugin settings are written against that pinned version's defaults. For example, Code View's
// `extensions` is one string containing its full default list plus additions. Bumping `version`
// requires re-deriving `settings` from the new release's DEFAULT_SETTINGS in the same review.
// OBSIDIAN_APP_SOURCE and OBSIDIAN_PLUGINS_SOURCE may override the source JSON paths for isolated
// runs; by default they point to this directory's app.json and plugins.json.
//
// NOT REACHABLE FROM FILES: Obsidian's "Restricted mode" (Settings → Community plugins) lives in
// the app's own storage, not in the vault. Until it is turned off once per vault, installed
// plugins stay inert. Obsidian may also hold old values in memory: reload it after applying.
//
// Exit: 0 all vaults already matched or were updated / 1 --check found drift / 2 FATAL.

const APP_SOURCE =
  process.env["OBSIDIAN_APP_SOURCE"] ?? join(import.meta.dir, "app.json");
const PLUGINS_SOURCE =
  process.env["OBSIDIAN_PLUGINS_SOURCE"] ??
  join(import.meta.dir, "plugins.json");
const REGISTRY = join(
  process.env["HOME"] ?? "",
  "Library/Application Support/obsidian/obsidian.json",
);
const FETCH_MS = 30_000;

function isPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): boolean {
  if (type === "unknown-flag" && flag === "__proto__") {
    return true;
  }
  return false;
}

const RecordSchema = z.record(z.string(), z.unknown());
const VaultSchema = z.object({ path: z.string() });
const ReleasePluginSchema = z.object({
  repo: z.string(),
  version: z.string(),
  sha256: z.record(z.string(), z.string()),
  settings: RecordSchema.optional(),
});
const LocalPluginSchema = z.object({
  local: z.string(),
  settings: RecordSchema.optional(),
});
const PluginSchema = z.union([ReleasePluginSchema, LocalPluginSchema]);
type Plugin = z.output<typeof PluginSchema>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// A JSON syntax error keeps its parser text; any other mismatch is "not a <what>".
function jsonFailure(path: string, what: string, error: z.ZodError): Error {
  const syntax = error.issues.find(
    (i) => i.code === "invalid_format" && i.format === "json",
  );
  return new Error(`${path}: ${syntax?.message ?? `not a ${what}`}`);
}

async function readJsonObject(
  path: string,
): Promise<Result<Record<string, unknown>, string>> {
  const record = jsonOf(RecordSchema).safeParse(await Bun.file(path).text());
  if (!record.success)
    return err(jsonFailure(path, "JSON object", record.error).message);
  return ok(record.data);
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

// Replace JSON files as one sibling rename so readers never observe a partial write.
async function atomicWrite(
  path: string,
  contents: string | Uint8Array,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${crypto.randomUUID()}.tmp`;
  await using _cleanup = {
    async [Symbol.asyncDispose]() {
      if (await exists(temp)) await unlink(temp);
    },
  };
  await Bun.write(temp, contents);
  await rename(temp, path);
}

async function asPlugin(
  id: string,
  v: unknown,
): Promise<Result<Plugin, string>> {
  const plugin = PluginSchema.safeParse(v);
  if (!plugin.success)
    return err(
      `plugins.json: ${id}: needs local or repo, version, sha256{file: hash}`,
    );
  const localPlugin = LocalPluginSchema.safeParse(plugin.data);
  if (localPlugin.success) {
    const base = await realpath(import.meta.dir);
    const source = resolve(base, localPlugin.data.local);
    const declaredRel = relative(base, source);
    if (
      isAbsolute(declaredRel) ||
      declaredRel === ".." ||
      declaredRel.startsWith(`..${sep}`)
    )
      return err(`plugins.json: ${id}: local path must stay inside obsidian/`);
    if (!(await exists(source)) || !(await lstat(source)).isDirectory())
      return err(
        `plugins.json: ${id}: local plugin directory not found: ${localPlugin.data.local}`,
      );
    const actualRel = relative(base, await realpath(source));
    if (
      isAbsolute(actualRel) ||
      actualRel === ".." ||
      actualRel.startsWith(`..${sep}`)
    )
      return err(`plugins.json: ${id}: local path must stay inside obsidian/`);
  }
  return ok(plugin.data);
}

async function vaultPaths(): Promise<Result<string[], string>> {
  if (!(await exists(REGISTRY))) return ok([]);
  const reg = await readJsonObject(REGISTRY);
  if (reg.isErr()) return err(reg.error);
  const vaultsRecord = RecordSchema.safeParse(reg.value["vaults"]);
  const vaults: Record<string, unknown> = vaultsRecord.success
    ? vaultsRecord.data
    : {};
  return ok(
    Object.values(vaults).flatMap((v) => {
      const vault = VaultSchema.safeParse(v);
      return vault.success ? [vault.data.path] : [];
    }),
  );
}

function sha256(bytes: Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
}

async function fileHash(path: string): Promise<string | null> {
  if (!(await exists(path))) return null;
  return sha256(await Bun.file(path).bytes());
}

// One download per asset per run, verified before any vault sees it.
const assetCache = new Map<string, Uint8Array>();

async function asset(
  p: z.output<typeof ReleasePluginSchema>,
  file: string,
): Promise<Result<Uint8Array, string>> {
  const url = `https://github.com/${p.repo}/releases/download/${p.version}/${file}`;
  const hit = assetCache.get(url);
  if (hit !== undefined) return ok(hit);
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_MS) });
  if (!res.ok) return err(`${url}: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const got = sha256(bytes);
  if (got !== p.sha256[file]) {
    return err(
      `${url}: sha256 ${got} != pinned ${p.sha256[file]} — refusing to install`,
    );
  }
  assetCache.set(url, bytes);
  return ok(bytes);
}

// Each Fix names what drifted and how to repair it; --check only prints the names.
type Fix = { what: string; apply: () => Promise<Result<void, string>> };

async function appFixes(
  dir: string,
  want: Record<string, unknown>,
): Promise<Result<Fix[], string>> {
  const target = join(dir, "app.json");
  const haveResult = (await exists(target))
    ? await readJsonObject(target)
    : ok<Record<string, unknown>>({});
  if (haveResult.isErr()) return err(haveResult.error);
  const have = haveResult.value;
  const changed = Object.keys(want).filter(
    (k) => JSON.stringify(have[k]) !== JSON.stringify(want[k]),
  );
  if (changed.length === 0) return ok([]);
  return ok([
    {
      what: `app.json(${changed.join(",")})`,
      apply: async () => {
        await atomicWrite(
          target,
          `${JSON.stringify({ ...have, ...want }, null, 2)}\n`,
        );
        return ok(undefined);
      },
    },
  ]);
}

async function pluginFixes(
  dir: string,
  id: string,
  p: Plugin,
): Promise<Result<Fix[], string>> {
  const pdir = join(dir, "plugins", id);
  const localPluginResult = LocalPluginSchema.safeParse(p);
  if (localPluginResult.success) {
    const localPlugin = localPluginResult.data;
    const source = resolve(import.meta.dir, localPlugin.local);
    const filesResult = await collectLocalEntries(source);
    if (filesResult.isErr()) return err(filesResult.error);
    const files = filesResult.value;
    const destinationResult = (await exists(pdir))
      ? await collectLocalEntries(pdir, true)
      : ok<string[]>([]);
    if (destinationResult.isErr()) return err(destinationResult.error);
    const changed = await changedLocalFiles(source, pdir, files);
    changed.push(
      ...destinationResult.value.filter(
        (file) => !files.includes(file) && file !== "data.json",
      ),
    );
    if (changed.length === 0) return ok([]);
    return ok([
      {
        what: `${id}(local:${changed.join(",")})`,
        apply: () => Promise.resolve(replaceLocalPlugin(source, pdir, files)),
      },
    ]);
  }
  const releasePlugin = ReleasePluginSchema.safeParse(p);
  if (!releasePlugin.success)
    return err(
      `plugins.json: ${id}: needs local or repo, version, sha256{file: hash}`,
    );
  const fixes: Fix[] = [];
  for (const [file, hash] of Object.entries(releasePlugin.data.sha256)) {
    if ((await fileHash(join(pdir, file))) === hash) continue;
    fixes.push({
      what: `${id}@${releasePlugin.data.version}/${file}`,
      apply: async () => {
        // Verify first: a refused asset must leave no plugin dir behind.
        const bytes = await asset(releasePlugin.data, file);
        if (bytes.isErr()) return err(bytes.error);
        await mkdir(pdir, { recursive: true });
        await atomicWrite(join(pdir, file), bytes.value);
        return ok(undefined);
      },
    });
  }
  return ok(fixes);
}

async function collectLocalEntries(
  current: string,
  includeSpecial = false,
  prefix = "",
  files: string[] = [],
): Promise<Result<string[], string>> {
  const entries = await Promise.try(() =>
    readdir(current, { withFileTypes: true }),
  ).then(
    (value) => ok(value),
    (error: unknown) => err(errorMessage(error)),
  );
  if (entries.isErr()) return err(entries.error);
  for (const entry of entries.value) {
    const rel = join(prefix, entry.name);
    const path = join(current, entry.name);
    const collected = await collectLocalEntry(
      entry,
      path,
      rel,
      includeSpecial,
      files,
    );
    if (collected.isErr()) return collected;
  }
  return ok(files);
}

async function collectLocalEntry(
  entry: Dirent,
  path: string,
  relativePath: string,
  includeSpecial: boolean,
  files: string[],
): Promise<Result<string[], string>> {
  if (entry.isDirectory())
    return collectLocalEntries(path, includeSpecial, relativePath, files);
  if (entry.isFile() || includeSpecial) {
    files.push(relativePath);
    return ok(files);
  }
  return err(`unsupported local plugin entry: ${path}`);
}

async function changedLocalFiles(
  source: string,
  pdir: string,
  files: string[],
): Promise<string[]> {
  const changed: string[] = [];
  for (const file of files) {
    const from = join(source, file);
    const to = join(pdir, file);
    if (
      !(await exists(to)) ||
      !(await lstat(to)).isFile() ||
      sha256(await Bun.file(from).bytes()) !==
        sha256(await Bun.file(to).bytes())
    )
      changed.push(file);
  }
  return changed;
}

async function replaceLocalPlugin(
  source: string,
  pdir: string,
  files: string[],
): Promise<Result<void, string>> {
  const parent = dirname(pdir);
  const stage = `${pdir}.${crypto.randomUUID()}.stage`;
  const backup = `${pdir}.${crypto.randomUUID()}.backup`;
  await mkdir(parent, { recursive: true });
  const prepared = await Promise.try(async () => {
    await cp(source, stage, { recursive: true, errorOnExist: true });
    const dataFile = join(pdir, "data.json");
    if (
      (await exists(dataFile)) &&
      (await lstat(dataFile)).isFile() &&
      !files.includes("data.json")
    )
      await cp(dataFile, join(stage, "data.json"));
    if (await exists(pdir)) await rename(pdir, backup);
  }).then(
    (value) => ok(value),
    (error: unknown) => err(errorMessage(error)),
  );
  if (prepared.isErr()) {
    if (await exists(stage)) await rm(stage, { recursive: true, force: true });
    return err(prepared.error);
  }
  const installed = await Promise.try(() => rename(stage, pdir)).then(
    (value) => ok(value),
    (error: unknown) => err(errorMessage(error)),
  );
  if (installed.isErr()) {
    const restored = (await exists(backup))
      ? await Promise.try(() => rename(backup, pdir)).then(
          (value) => ok(value),
          (error: unknown) => err(errorMessage(error)),
        )
      : ok(undefined);
    if (await exists(stage)) await rm(stage, { recursive: true, force: true });
    return restored.isErr() ? err(restored.error) : err(installed.error);
  }
  const removed = await Promise.try(async () => {
    if (await exists(backup))
      await rm(backup, { recursive: true, force: true });
  }).then(
    (value) => ok(value),
    (error: unknown) => err(errorMessage(error)),
  );
  if (removed.isErr()) {
    if (await exists(stage)) await rm(stage, { recursive: true, force: true });
    return err(removed.error);
  }
  return ok(undefined);
}

function mergeDeclared(
  have: Record<string, unknown>,
  want: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...have };
  for (const [key, value] of Object.entries(want)) {
    const wantObject = RecordSchema.safeParse(value);
    const haveObject = RecordSchema.safeParse(have[key]);
    merged[key] =
      wantObject.success && haveObject.success
        ? mergeDeclared(haveObject.data, wantObject.data)
        : value;
  }
  return merged;
}

async function pluginSettingsFixes(
  dir: string,
  id: string,
  want: Record<string, unknown> | undefined,
): Promise<Result<Fix[], string>> {
  if (want === undefined) return ok([]);
  const target = join(dir, "plugins", id, "data.json");
  const haveResult = (await exists(target))
    ? await readJsonObject(target)
    : ok<Record<string, unknown>>({});
  if (haveResult.isErr()) return err(haveResult.error);
  const have = haveResult.value;
  const merged = mergeDeclared(have, want);
  const changed = Object.keys(want).filter(
    (k) => JSON.stringify(have[k]) !== JSON.stringify(merged[k]),
  );
  if (changed.length === 0) return ok([]);
  return ok([
    {
      what: `${id}/data.json(${changed.join(",")})`,
      apply: async () => {
        await atomicWrite(target, `${JSON.stringify(merged, null, 2)}\n`);
        return ok(undefined);
      },
    },
  ]);
}

async function enableFix(
  dir: string,
  ids: string[],
): Promise<Result<Fix[], string>> {
  const target = join(dir, "community-plugins.json");
  const text = (await exists(target)) ? await Bun.file(target).text() : "[]";
  const list = jsonOf(z.array(z.unknown())).safeParse(text);
  if (!list.success)
    return err(jsonFailure(target, "JSON array", list.error).message);
  const current = list.data;
  const missing = ids.filter((id) => !current.includes(id));
  if (missing.length === 0) return ok([]);
  return ok([
    {
      what: `enable(${missing.join(",")})`,
      apply: async () => {
        await atomicWrite(
          target,
          `${JSON.stringify([...current, ...missing], null, 2)}\n`,
        );
        return ok(undefined);
      },
    },
  ]);
}

async function applyFixes(fixes: Fix[]): Promise<Result<void, string>> {
  for (const fix of fixes) {
    const result = await fix.apply();
    if (result.isErr()) return result;
  }
  return ok(undefined);
}

async function main(): Promise<Result<void, string>> {
  let prototypeFlag = false;
  const rejectPrototypeFlag = (
    type: "known-flag" | "unknown-flag" | "argument",
    flag: string,
  ): void => {
    prototypeFlag = isPrototypeFlag(type, flag) || prototypeFlag;
  };
  const parsed = cli(
    {
      name: "apply.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description:
          "Merge obsidian/app.json and install obsidian/plugins.json into every registered Obsidian vault.",
      },
      flags: {
        vault: {
          type: String,
          description:
            "apply only to this vault directory (create .obsidian if needed)",
        },
        check: {
          type: Boolean,
          default: false,
          description: "report drift only; write nothing (exit 1 on drift)",
        },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (prototypeFlag) return err("Unknown option '--__proto__'");
  if (parsed._.length > 0)
    return err(`unexpected argument: ${parsed._.join(" ")}`);

  const wantAppResult = await readJsonObject(APP_SOURCE);
  if (wantAppResult.isErr()) return err(wantAppResult.error);
  const pluginsResult = await readJsonObject(PLUGINS_SOURCE);
  if (pluginsResult.isErr()) return err(pluginsResult.error);
  const plugins: (readonly [string, Result<Plugin, string>])[] = [];
  for (const [id, value] of Object.entries(pluginsResult.value))
    plugins.push([id, await asPlugin(id, value)] as const);
  const invalidPlugin = plugins.find(([, plugin]) => plugin.isErr());
  if (invalidPlugin !== undefined && invalidPlugin[1].isErr())
    return err(invalidPlugin[1].error);
  const validPlugins = plugins.flatMap(([id, plugin]) =>
    plugin.isOk() ? [[id, plugin.value] as const] : [],
  );
  const paths =
    parsed.flags.vault === undefined
      ? await vaultPaths()
      : ok([await realpath(parsed.flags.vault)]);
  if (paths.isErr()) return err(paths.error);
  if (paths.value.length === 0) {
    process.stdout.write(`skip: no Obsidian vault registry at ${REGISTRY}\n`);
    return ok(undefined);
  }

  let drift = 0;
  for (const vault of paths.value) {
    const dir = join(vault, ".obsidian");
    if (parsed.flags.vault !== undefined && !parsed.flags.check)
      await mkdir(dir, { recursive: true });
    if (!(await exists(dir))) {
      process.stdout.write(`SKIP  ${vault} (no .obsidian/)\n`);
      continue;
    }
    const shadowBase = resolve(
      process.env["HOME"] ?? "",
      ".obsidian-remote/vaults",
    );
    const canonicalBase = await realpath(shadowBase).catch(() => shadowBase);
    const shadow =
      resolve(vault).startsWith(shadowBase + sep) ||
      (await realpath(vault)).startsWith(canonicalBase + sep);
    if (shadow)
      process.stdout.write(
        `SKIP  ${vault}: settings and enabled plugins owned by open-remote.ts (shadow vault); pinned plugin files still verified\n`,
      );
    const app = shadow
      ? ok<Fix[]>([])
      : await appFixes(dir, wantAppResult.value);
    if (app.isErr()) return err(app.error);
    const pluginResults = await Promise.all(
      validPlugins.map(([id, p]) => pluginFixes(dir, id, p)),
    );
    const pluginError = pluginResults.find((result) => result.isErr());
    if (pluginError !== undefined && pluginError.isErr())
      return err(pluginError.error);
    const settingsResults = await Promise.all(
      validPlugins.map(([id, p]) =>
        shadow
          ? Promise.resolve(ok<Fix[]>([]))
          : pluginSettingsFixes(dir, id, p.settings),
      ),
    );
    const settingsError = settingsResults.find((result) => result.isErr());
    if (settingsError !== undefined && settingsError.isErr())
      return err(settingsError.error);
    const enabled = shadow
      ? ok<Fix[]>([])
      : await enableFix(
          dir,
          validPlugins.map(([id]) => id),
        );
    if (enabled.isErr()) return err(enabled.error);
    const fixes = [
      ...app.value,
      ...pluginResults.flatMap((result) => (result.isOk() ? result.value : [])),
      ...settingsResults.flatMap((result) =>
        result.isOk() ? result.value : [],
      ),
      ...enabled.value,
    ];
    if (fixes.length === 0) {
      process.stdout.write(`OK    ${vault}\n`);
      continue;
    }
    drift++;
    const names = fixes.map((f) => f.what).join(" ");
    if (parsed.flags.check) {
      process.stdout.write(`DRIFT ${vault}: ${names}\n`);
      continue;
    }
    const applied = await applyFixes(fixes);
    if (applied.isErr()) return applied;
    process.stdout.write(`SET   ${vault}: ${names}\n`);
  }

  if (parsed.flags.check && drift > 0) process.exitCode = 1;
  else if (drift > 0)
    process.stdout.write(
      "   Reload Obsidian (Cmd+P → Reload app without saving). Plugins stay inert until Restricted mode is off (Settings → Community plugins), once per vault.\n",
    );
  return ok(undefined);
}

const outcome = await Promise.try(main).then(
  (result) => result,
  (error: unknown) =>
    err(error instanceof Error ? error.message : String(error)),
);
outcome.match(
  () => process.exit(process.exitCode ?? 0),
  (message) => {
    process.stderr.write(`FATAL: ${message}\n`);
    process.exit(2);
  },
);
