import { cli } from "cleye";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
} from "node:fs";
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
  process.env.OBSIDIAN_APP_SOURCE ?? join(import.meta.dir, "app.json");
const PLUGINS_SOURCE =
  process.env.OBSIDIAN_PLUGINS_SOURCE ?? join(import.meta.dir, "plugins.json");
const REGISTRY = join(
  process.env.HOME ?? "",
  "Library/Application Support/obsidian/obsidian.json",
);
const FETCH_MS = 30_000;

function rejectPrototypeFlag(
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

function isLocalPlugin(
  plugin: Plugin,
): plugin is z.output<typeof LocalPluginSchema> {
  return "local" in plugin;
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

// Replace JSON files as one sibling rename so readers never observe a partial write.
async function atomicWrite(
  path: string,
  contents: string | Uint8Array,
): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${crypto.randomUUID()}.tmp`;
  await Bun.write(temp, contents)
    .then(() => {
      renameSync(temp, path);
    })
    .finally(() => {
      if (existsSync(temp)) unlinkSync(temp);
    });
}

function asPlugin(id: string, v: unknown): Result<Plugin, string> {
  const plugin = PluginSchema.safeParse(v);
  if (!plugin.success)
    return err(
      `plugins.json: ${id}: needs local or repo, version, sha256{file: hash}`,
    );
  if (isLocalPlugin(plugin.data)) {
    const base = realpathSync(import.meta.dir);
    const source = resolve(base, plugin.data.local);
    const declaredRel = relative(base, source);
    if (
      isAbsolute(declaredRel) ||
      declaredRel === ".." ||
      declaredRel.startsWith(`..${sep}`)
    )
      return err(`plugins.json: ${id}: local path must stay inside obsidian/`);
    if (!existsSync(source) || !lstatSync(source).isDirectory())
      return err(
        `plugins.json: ${id}: local plugin directory not found: ${plugin.data.local}`,
      );
    const actualRel = relative(base, realpathSync(source));
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
  if (!existsSync(REGISTRY)) return ok([]);
  const reg = await readJsonObject(REGISTRY);
  if (reg.isErr()) return err(reg.error);
  const vaultsRecord = RecordSchema.safeParse(reg.value.vaults);
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
  if (!existsSync(path)) return null;
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
  const haveResult = existsSync(target)
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
  if (isLocalPlugin(p)) {
    const source = resolve(import.meta.dir, p.local);
    const files: string[] = [];
    const collect = (current: string, prefix = "") => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const rel = join(prefix, entry.name);
        const path = join(current, entry.name);
        if (entry.isDirectory()) collect(path, rel);
        else if (entry.isFile()) files.push(rel);
        else throw new Error(`unsupported local plugin entry: ${path}`);
      }
    };
    try {
      collect(source);
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
    const changed: string[] = [];
    const destinationFiles: string[] = [];
    if (existsSync(pdir)) {
      const collectDestination = (current: string, prefix = "") => {
        for (const entry of readdirSync(current, { withFileTypes: true })) {
          const rel = join(prefix, entry.name);
          const path = join(current, entry.name);
          if (entry.isDirectory()) collectDestination(path, rel);
          else destinationFiles.push(rel);
        }
      };
      collectDestination(pdir);
    }
    for (const file of files) {
      const from = join(source, file);
      const to = join(pdir, file);
      if (
        !existsSync(to) ||
        !lstatSync(to).isFile() ||
        sha256(await Bun.file(from).bytes()) !== sha256(await Bun.file(to).bytes())
      ) changed.push(file);
    }
    // data.json is the plugin's runtime state (preserved on install), never a stray file.
    changed.push(
      ...destinationFiles.filter(
        (file) => !files.includes(file) && file !== "data.json",
      ),
    );
    if (changed.length === 0) return ok([]);
    return ok([
      {
        what: `${id}(local:${changed.join(",")})`,
        apply: async () => {
          const parent = dirname(pdir);
          const stage = `${pdir}.${crypto.randomUUID()}.stage`;
          const backup = `${pdir}.${crypto.randomUUID()}.backup`;
          mkdirSync(parent, { recursive: true });
          try {
            cpSync(source, stage, { recursive: true, errorOnExist: true });
            const dataFile = join(pdir, "data.json");
            if (
              existsSync(dataFile) &&
              lstatSync(dataFile).isFile() &&
              !files.includes("data.json")
            )
              cpSync(dataFile, join(stage, "data.json"));
            if (existsSync(pdir)) renameSync(pdir, backup);
            try {
              renameSync(stage, pdir);
            } catch (error) {
              if (existsSync(backup)) renameSync(backup, pdir);
              throw error;
            }
            if (existsSync(backup)) rmSync(backup, { recursive: true, force: true });
            return ok(undefined);
          } catch (error) {
            if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
            return err(error instanceof Error ? error.message : String(error));
          }
        },
      },
    ]);
  }
  const fixes: Fix[] = [];
  for (const [file, hash] of Object.entries(p.sha256)) {
    if ((await fileHash(join(pdir, file))) === hash) continue;
    fixes.push({
      what: `${id}@${p.version}/${file}`,
      apply: async () => {
        // Verify first: a refused asset must leave no plugin dir behind.
        const bytes = await asset(p, file);
        if (bytes.isErr()) return err(bytes.error);
        mkdirSync(pdir, { recursive: true });
        await atomicWrite(join(pdir, file), bytes.value);
        return ok(undefined);
      },
    });
  }
  return ok(fixes);
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeDeclared(
  have: Record<string, unknown>,
  want: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...have };
  for (const [key, value] of Object.entries(want)) {
    merged[key] =
      plainObject(value) && plainObject(have[key])
        ? mergeDeclared(have[key], value)
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
  const haveResult = existsSync(target)
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
        await atomicWrite(
          target,
          `${JSON.stringify(merged, null, 2)}\n`,
        );
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
  const text = existsSync(target) ? await Bun.file(target).text() : "[]";
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
  const parsed = cli(
    {
      name: "apply.ts",
      strictFlags: true,
      ignoreArgv: (type, flag) => {
        prototypeFlag = rejectPrototypeFlag(type, flag) || prototypeFlag;
      },
      parameters: [],
      help: {
        description:
          "Merge obsidian/app.json and install obsidian/plugins.json into every registered Obsidian vault.",
      },
      flags: {
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
  const plugins = Object.entries(pluginsResult.value).map(
    ([id, v]) => [id, asPlugin(id, v)] as const,
  );
  const invalidPlugin = plugins.find(([, plugin]) => plugin.isErr());
  if (invalidPlugin !== undefined && invalidPlugin[1].isErr())
    return err(invalidPlugin[1].error);
  const validPlugins = plugins.flatMap(([id, plugin]) =>
    plugin.isOk() ? [[id, plugin.value] as const] : [],
  );
  const paths = await vaultPaths();
  if (paths.isErr()) return err(paths.error);
  if (paths.value.length === 0) {
    process.stdout.write(`skip: no Obsidian vault registry at ${REGISTRY}\n`);
    return ok(undefined);
  }

  let drift = 0;
  for (const vault of paths.value) {
    const dir = join(vault, ".obsidian");
    if (!existsSync(dir)) {
      process.stdout.write(`SKIP  ${vault} (no .obsidian/)\n`);
      continue;
    }
    const app = await appFixes(dir, wantAppResult.value);
    if (app.isErr()) return err(app.error);
    const pluginResults = await Promise.all(
      validPlugins.map(([id, p]) => pluginFixes(dir, id, p)),
    );
    const pluginError = pluginResults.find((result) => result.isErr());
    if (pluginError !== undefined && pluginError.isErr())
      return err(pluginError.error);
    const settingsResults = await Promise.all(
      validPlugins.map(([id, p]) => pluginSettingsFixes(dir, id, p.settings)),
    );
    const settingsError = settingsResults.find((result) => result.isErr());
    if (settingsError !== undefined && settingsError.isErr())
      return err(settingsError.error);
    const enabled = await enableFix(
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
