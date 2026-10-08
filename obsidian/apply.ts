import { cli } from "cleye";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { err, ok, type Result } from "neverthrow";
import { jsonOf, z } from "../agents/hooks/zod.ts";

// Bring EVERY registered Obsidian vault in line with this directory (single source):
//   app.json     — keys merged into each vault's .obsidian/app.json
//   plugins.json — community plugins installed into .obsidian/plugins/<id>/ and enabled in
//                  .obsidian/community-plugins.json, pinned by release tag AND sha256 per file;
//                  declared settings merged into each plugin's data.json
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
//
// NOT REACHABLE FROM FILES: Obsidian's "Restricted mode" (Settings → Community plugins) lives in
// the app's own storage, not in the vault. Until it is turned off once per vault, installed
// plugins stay inert. Obsidian may also hold old values in memory: reload it after applying.
//
// Exit: 0 all vaults already matched or were updated / 1 --check found drift / 2 FATAL.

const APP_SOURCE = join(import.meta.dir, "app.json");
const PLUGINS_SOURCE = join(import.meta.dir, "plugins.json");
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
const PluginSchema = z.object({
  repo: z.string(),
  version: z.string(),
  sha256: z.record(z.string(), z.string()),
  settings: RecordSchema.optional(),
});
type Plugin = z.output<typeof PluginSchema>;

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

function asPlugin(id: string, v: unknown): Result<Plugin, string> {
  const plugin = PluginSchema.safeParse(v);
  if (!plugin.success)
    return err(`plugins.json: ${id}: needs repo, version, sha256{file: hash}`);
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
  p: Plugin,
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
        await Bun.write(
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
        await Bun.write(join(pdir, file), bytes.value);
        return ok(undefined);
      },
    });
  }
  return ok(fixes);
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
  const changed = Object.keys(want).filter(
    (k) => JSON.stringify(have[k]) !== JSON.stringify(want[k]),
  );
  if (changed.length === 0) return ok([]);
  return ok([
    {
      what: `${id}/data.json(${changed.join(",")})`,
      apply: async () => {
        await Bun.write(
          target,
          `${JSON.stringify({ ...have, ...want }, null, 2)}\n`,
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
        await Bun.write(
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
