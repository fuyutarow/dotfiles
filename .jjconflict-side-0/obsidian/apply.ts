import { cli } from "cleye";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Bring EVERY registered Obsidian vault in line with this directory (single source):
//   app.json     — keys merged into each vault's .obsidian/app.json
//   plugins.json — community plugins installed into .obsidian/plugins/<id>/ and enabled in
//                  .obsidian/community-plugins.json, pinned by release tag AND sha256 per file
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

class UsageError extends Error {}

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new UsageError(`Unknown option '--${flag}'`);
  }
}

type Plugin = { repo: string; version: string; sha256: Record<string, string> };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  const data: unknown = await Bun.file(path).json();
  if (!isRecord(data)) throw new Error(`${path}: not a JSON object`);
  return data;
}

function asPlugin(id: string, v: unknown): Plugin {
  const ok =
    isRecord(v) &&
    typeof v.repo === "string" &&
    typeof v.version === "string" &&
    isRecord(v.sha256) &&
    Object.values(v.sha256).every((h) => typeof h === "string");
  if (!ok)
    throw new Error(
      `plugins.json: ${id}: needs repo, version, sha256{file: hash}`,
    );
  return v as Plugin;
}

async function vaultPaths(): Promise<string[]> {
  if (!existsSync(REGISTRY)) return [];
  const reg = await readJsonObject(REGISTRY);
  const vaults = isRecord(reg.vaults) ? reg.vaults : {};
  return Object.values(vaults)
    .map((v) => (isRecord(v) && typeof v.path === "string" ? v.path : null))
    .filter((p): p is string => p !== null);
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

async function asset(p: Plugin, file: string): Promise<Uint8Array> {
  const url = `https://github.com/${p.repo}/releases/download/${p.version}/${file}`;
  const hit = assetCache.get(url);
  if (hit) return hit;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_MS) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const got = sha256(bytes);
  if (got !== p.sha256[file]) {
    throw new Error(
      `${url}: sha256 ${got} != pinned ${p.sha256[file]} — refusing to install`,
    );
  }
  assetCache.set(url, bytes);
  return bytes;
}

// Each Fix names what drifted and how to repair it; --check only prints the names.
type Fix = { what: string; apply: () => Promise<void> };

async function appFixes(
  dir: string,
  want: Record<string, unknown>,
): Promise<Fix[]> {
  const target = join(dir, "app.json");
  const have = existsSync(target) ? await readJsonObject(target) : {};
  const changed = Object.keys(want).filter(
    (k) => JSON.stringify(have[k]) !== JSON.stringify(want[k]),
  );
  if (changed.length === 0) return [];
  return [
    {
      what: `app.json(${changed.join(",")})`,
      apply: async () => {
        await Bun.write(
          target,
          `${JSON.stringify({ ...have, ...want }, null, 2)}\n`,
        );
      },
    },
  ];
}

async function pluginFixes(dir: string, id: string, p: Plugin): Promise<Fix[]> {
  const pdir = join(dir, "plugins", id);
  const fixes: Fix[] = [];
  for (const [file, hash] of Object.entries(p.sha256)) {
    if ((await fileHash(join(pdir, file))) === hash) continue;
    fixes.push({
      what: `${id}@${p.version}/${file}`,
      apply: async () => {
        // Verify first: a refused asset must leave no plugin dir behind.
        const bytes = await asset(p, file);
        mkdirSync(pdir, { recursive: true });
        await Bun.write(join(pdir, file), bytes);
      },
    });
  }
  return fixes;
}

async function enableFix(dir: string, ids: string[]): Promise<Fix[]> {
  const target = join(dir, "community-plugins.json");
  const raw: unknown = existsSync(target) ? await Bun.file(target).json() : [];
  if (!Array.isArray(raw)) throw new Error(`${target}: not a JSON array`);
  const missing = ids.filter((id) => !raw.includes(id));
  if (missing.length === 0) return [];
  return [
    {
      what: `enable(${missing.join(",")})`,
      apply: async () => {
        await Bun.write(
          target,
          `${JSON.stringify([...raw, ...missing], null, 2)}\n`,
        );
      },
    },
  ];
}

async function main(): Promise<void> {
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
  if (parsed._.length > 0)
    throw new UsageError(`unexpected argument: ${parsed._.join(" ")}`);

  const wantApp = await readJsonObject(APP_SOURCE);
  const plugins = Object.entries(await readJsonObject(PLUGINS_SOURCE)).map(
    ([id, v]) => [id, asPlugin(id, v)] as const,
  );
  const paths = await vaultPaths();
  if (paths.length === 0) {
    process.stdout.write(`skip: no Obsidian vault registry at ${REGISTRY}\n`);
    return;
  }

  let drift = 0;
  for (const vault of paths) {
    const dir = join(vault, ".obsidian");
    if (!existsSync(dir)) {
      process.stdout.write(`SKIP  ${vault} (no .obsidian/)\n`);
      continue;
    }
    const fixes = [
      ...(await appFixes(dir, wantApp)),
      ...(
        await Promise.all(plugins.map(([id, p]) => pluginFixes(dir, id, p)))
      ).flat(),
      ...(await enableFix(
        dir,
        plugins.map(([id]) => id),
      )),
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
    for (const f of fixes) await f.apply();
    process.stdout.write(`SET   ${vault}: ${names}\n`);
  }

  if (parsed.flags.check && drift > 0) process.exitCode = 1;
  else if (drift > 0)
    process.stdout.write(
      "   Reload Obsidian (Cmd+P → Reload app without saving). Plugins stay inert until Restricted mode is off (Settings → Community plugins), once per vault.\n",
    );
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`FATAL: ${msg}\n`);
  process.exit(2);
});
