import { cli } from "cleye";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

// Merge obsidian/app.json (single source) into EVERY vault's .obsidian/app.json.
// Run via `mise run mac:obsidian` (wired into `mise run mac:init`). Consumer: human, verdict lines.
//
// WHY MERGE, NOT SYMLINK. Obsidian rewrites .obsidian/app.json whenever any setting is touched in
// its UI, and the vaults live on Google Drive — a symlink would be replaced by a real file on the
// first save (and Drive does not sync symlinks faithfully). So this owns only the keys it declares:
// every other key a vault has stays as Obsidian wrote it.
//
// Vaults are enumerated from Obsidian's own registry, so a newly opened vault is covered on the
// next run with nothing to remember. Obsidian may hold the old values in memory: if it is running,
// reload it (Cmd+P → "Reload app without saving") after applying.
//
// Exit: 0 all vaults already matched or were updated / 1 --check found drift / 2 FATAL.

const SOURCE = join(import.meta.dir, "app.json");
const REGISTRY = join(
  process.env.HOME ?? "",
  "Library/Application Support/obsidian/obsidian.json",
);

class UsageError extends Error {}

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new UsageError(`Unknown option '--${flag}'`);
  }
}

const RecordSchema = z.record(z.string(), z.unknown());
const VaultSchema = z.object({ path: z.string() });

async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  const data: unknown = await Bun.file(path).json();
  const record = RecordSchema.safeParse(data);
  if (!record.success) throw new Error(`${path}: not a JSON object`);
  return record.data;
}

async function vaultPaths(): Promise<string[]> {
  if (!existsSync(REGISTRY)) return [];
  const reg = await readJsonObject(REGISTRY);
  const vaultsRecord = RecordSchema.safeParse(reg.vaults);
  const vaults: Record<string, unknown> = vaultsRecord.success
    ? vaultsRecord.data
    : {};
  return Object.values(vaults).flatMap((v) => {
    const vault = VaultSchema.safeParse(v);
    return vault.success ? [vault.data.path] : [];
  });
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
          "Merge obsidian/app.json into every registered Obsidian vault.",
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

  const want = await readJsonObject(SOURCE);
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
    const target = join(dir, "app.json");
    const have = existsSync(target) ? await readJsonObject(target) : {};
    const changed = Object.keys(want).filter(
      (k) => JSON.stringify(have[k]) !== JSON.stringify(want[k]),
    );
    if (changed.length === 0) {
      process.stdout.write(`OK    ${vault}\n`);
      continue;
    }
    drift++;
    if (parsed.flags.check) {
      process.stdout.write(`DRIFT ${vault}: ${changed.join(", ")}\n`);
      continue;
    }
    await Bun.write(
      target,
      `${JSON.stringify({ ...have, ...want }, null, 2)}\n`,
    );
    process.stdout.write(`SET   ${vault}: ${changed.join(", ")}\n`);
  }

  if (parsed.flags.check && drift > 0) process.exitCode = 1;
  else if (drift > 0)
    process.stdout.write(
      "   Reload Obsidian (Cmd+P → Reload app without saving) if it is running.\n",
    );
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`FATAL: ${msg}\n`);
  process.exit(2);
});
