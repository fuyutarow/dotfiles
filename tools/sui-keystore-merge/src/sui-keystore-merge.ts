#!/usr/bin/env bun
// Merge only Sui's keystore and alias data. Transport and secret resolution belong to fnox.
import { createPrivateKey, createPublicKey, randomUUID } from "node:crypto";
import {
  access,
  chmod,
  copyFile,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { cli as cleyeCli } from "cleye";
import { standardCli } from "@dotfiles/shared/src/cli.ts";
import cliPackage from "../package.json" with { type: "json" };
import { attempt, errorMessage } from "@dotfiles/shared/src/attempt.ts";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";

const cliArgv = () => process.argv.slice(2);
const cli = standardCli(cleyeCli, cliPackage, cliArgv);

const DEFAULT_CONFIG_DIR = "~/.sui/sui_config";
const ED25519_FLAG = 0;
const PRIVATE_KEY_DER_PREFIX = Buffer.from(
  "302e020100300506032b657004220420",
  "hex",
);

const AliasSchema = z
  .object({ alias: z.string(), public_key_base64: z.string() })
  .loose();
type Alias = z.infer<typeof AliasSchema>;
type Counts = { existing: number; added: number; total: number };
type MergeResult = {
  keystore: string[];
  aliases: Alias[];
  keystoreCounts: Counts;
  aliasCounts: Counts;
  conflicts: string[];
};

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`unknown flag(s): --${flag}\n`);
    process.exit(2);
  }
}

export const SUI_KEYSTORE_MERGE_CLI_OPTIONS = {
  name: "sui-keystore-merge",
  strictFlags: true,
  ignoreArgv: rejectPrototypeFlag,
  parameters: [],
  help: {
    description:
      "Add fnox-provided Sui keys and aliases without replacing existing keystore entries.",
  },
  flags: {
    configDir: {
      type: String,
      default: DEFAULT_CONFIG_DIR,
      description: "Sui config directory",
    },
    keystoreEnv: {
      type: String,
      default: "SUI_KEYSTORE",
      description: "Environment variable containing the JSON keystore array",
    },
    aliasesEnv: {
      type: String,
      default: "SUI_ALIASES",
      description: "Environment variable containing the JSON aliases array",
    },
    dryRun: {
      type: Boolean,
      default: false,
      description: "Show counts/conflicts without writing",
    },
  },
} satisfies {
  name: string;
  strictFlags: true;
  ignoreArgv: typeof rejectPrototypeFlag;
  parameters: [];
  help: { description: string };
  flags: {
    configDir: {
      type: StringConstructor;
      default: string;
      description: string;
    };
    keystoreEnv: {
      type: StringConstructor;
      default: string;
      description: string;
    };
    aliasesEnv: {
      type: StringConstructor;
      default: string;
      description: string;
    };
    dryRun: { type: BooleanConstructor; default: boolean; description: string };
  };
};

function jsonArray<S extends z.ZodType>(
  raw: string,
  name: string,
  schema: S,
): z.infer<S> | string {
  const parsed = jsonOf(schema).safeParse(raw);
  return parsed.success
    ? parsed.data
    : `${name} must contain a valid JSON array`;
}

function publicKeyBase64(privateKeyBase64: string): string | null {
  const bytes = Buffer.from(privateKeyBase64, "base64");
  if (bytes.length !== 33 || bytes[0] !== ED25519_FLAG) return null;
  const der = Buffer.concat([PRIVATE_KEY_DER_PREFIX, bytes.subarray(1)]);
  const privateKey = createPrivateKey({
    key: der,
    format: "der",
    type: "pkcs8",
  });
  const spki = createPublicKey(privateKey).export({
    format: "der",
    type: "spki",
  });
  return Buffer.concat([bytes.subarray(0, 1), spki.subarray(-32)]).toString(
    "base64",
  );
}

export function mergeSuiData(
  targetKeystore: string[],
  targetAliases: Alias[],
  incomingKeystore: string[],
  incomingAliases: Alias[],
): MergeResult | string {
  const aliasesByKey = new Map(
    incomingAliases.map((item) => [item.public_key_base64, item]),
  );
  const incomingPairs: { key: string; alias: Alias }[] = [];
  for (const key of incomingKeystore) {
    const pub = publicKeyBase64(key);
    if (pub === null) return "only 33-byte Sui Ed25519 keys are supported";
    const alias = aliasesByKey.get(pub);
    if (alias === undefined) return "new Sui key has no alias entry";
    incomingPairs.push({ key, alias });
  }

  const conflicts: string[] = [];
  const targetByName = new Map(
    targetAliases.map((item) => [item.alias, item.public_key_base64]),
  );
  const incomingByName = new Map<string, string>();
  for (const { alias } of incomingPairs) {
    const currentKey = targetByName.get(alias.alias);
    if (currentKey !== undefined && currentKey !== alias.public_key_base64)
      conflicts.push(alias.alias);
    const earlierKey = incomingByName.get(alias.alias);
    if (earlierKey !== undefined && earlierKey !== alias.public_key_base64)
      conflicts.push(alias.alias);
    incomingByName.set(alias.alias, alias.public_key_base64);
  }
  if (conflicts.length > 0) {
    return {
      keystore: [...targetKeystore],
      aliases: [...targetAliases],
      keystoreCounts: {
        existing: targetKeystore.length,
        added: 0,
        total: targetKeystore.length,
      },
      aliasCounts: {
        existing: targetAliases.length,
        added: 0,
        total: targetAliases.length,
      },
      conflicts,
    };
  }

  const keys = [...targetKeystore];
  const keySet = new Set(keys);
  for (const { key } of incomingPairs) {
    if (!keySet.has(key)) {
      keys.push(key);
      keySet.add(key);
    }
  }
  const aliases = [...targetAliases];
  const aliasKeys = new Set(aliases.map((item) => item.public_key_base64));
  for (const { alias } of incomingPairs) {
    if (!aliasKeys.has(alias.public_key_base64)) {
      aliases.push(alias);
      aliasKeys.add(alias.public_key_base64);
    }
  }
  return {
    keystore: keys,
    aliases,
    keystoreCounts: {
      existing: targetKeystore.length,
      added: keys.length - targetKeystore.length,
      total: keys.length,
    },
    aliasCounts: {
      existing: targetAliases.length,
      added: aliases.length - targetAliases.length,
      total: aliases.length,
    },
    conflicts,
  };
}

function targetPath(configDir: string, file: string): string {
  const home = process.env["HOME"] ?? "";
  const expanded = configDir.replace(/^~(?=\/)/u, home);
  return join(resolve(expanded), file);
}

function backupPath(path: string, timestamp: string): string {
  return `${path}.bak-${timestamp}`;
}

async function atomicWrite(path: string, content: string): Promise<void> {
  const temp = `${path}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temp, content, { mode: 0o600, flag: "wx" });
  await chmod(temp, 0o600);
  await rename(temp, path);
}

function renderCounts(label: string, counts: Counts): string {
  return `${label} existing ${counts.existing}, added ${counts.added}, total ${counts.total}`;
}

async function main(): Promise<void> {
  const parsed = cli(SUI_KEYSTORE_MERGE_CLI_OPTIONS, undefined, cliArgv());
  if (parsed._.length > 0) {
    process.stderr.write(
      "sui-keystore-merge accepts no positional arguments\n",
    );
    process.exitCode = 2;
    return;
  }
  const { configDir, keystoreEnv, aliasesEnv, dryRun } = parsed.flags;
  const incomingKeysRaw = process.env[keystoreEnv];
  const incomingAliasesRaw = process.env[aliasesEnv];
  if (incomingKeysRaw === undefined || incomingAliasesRaw === undefined) {
    process.stderr.write(
      `missing ${incomingKeysRaw === undefined ? keystoreEnv : aliasesEnv} environment variable\n`,
    );
    process.exitCode = 1;
    return;
  }
  const incomingKeys = jsonArray(
    incomingKeysRaw,
    keystoreEnv,
    z.array(z.string()),
  );
  const incomingAliases = jsonArray(
    incomingAliasesRaw,
    aliasesEnv,
    z.array(AliasSchema),
  );
  if (typeof incomingKeys === "string") {
    process.stderr.write(`${incomingKeys}\n`);
    process.exitCode = 1;
    return;
  }
  if (typeof incomingAliases === "string") {
    process.stderr.write(`${incomingAliases}\n`);
    process.exitCode = 1;
    return;
  }

  const keystorePath = targetPath(configDir, "sui.keystore");
  const aliasesPath = targetPath(configDir, "sui.aliases");
  const [keystoreExists, aliasesExist] = await Promise.all([
    access(keystorePath).then(
      () => true,
      () => false,
    ),
    access(aliasesPath).then(
      () => true,
      () => false,
    ),
  ]);
  if (!keystoreExists || !aliasesExist) {
    process.stderr.write(
      "both target sui.keystore and sui.aliases must already exist\n",
    );
    process.exitCode = 1;
    return;
  }
  const oldKeys = jsonArray(
    await readFile(keystorePath, "utf8"),
    "target keystore",
    z.array(z.string()),
  );
  const oldAliases = jsonArray(
    await readFile(aliasesPath, "utf8"),
    "target aliases",
    z.array(AliasSchema),
  );
  if (typeof oldKeys === "string") {
    process.stderr.write(`${oldKeys}\n`);
    process.exitCode = 1;
    return;
  }
  if (typeof oldAliases === "string") {
    process.stderr.write(`${oldAliases}\n`);
    process.exitCode = 1;
    return;
  }
  const merged = mergeSuiData(
    oldKeys,
    oldAliases,
    incomingKeys,
    incomingAliases,
  );
  if (typeof merged === "string") {
    process.stderr.write(`${merged}\n`);
    process.exitCode = 1;
    return;
  }
  const counts = `${renderCounts("keystore", merged.keystoreCounts)}; ${renderCounts("aliases", merged.aliasCounts)}`;
  if (merged.conflicts.length > 0) {
    process.stderr.write(
      `alias conflict(s): ${merged.conflicts.join(", ")}\n${counts}\n`,
    );
    process.exitCode = 1;
    return;
  }
  if (dryRun) {
    process.stdout.write(`${counts}; dry-run, no files written\n`);
    return;
  }

  const timestamp = Temporal.Now.instant()
    .toString()
    .replaceAll(":", "-")
    .replaceAll(".", "-");
  const keystoreBackup = backupPath(keystorePath, timestamp);
  const aliasesBackup = backupPath(aliasesPath, timestamp);
  await copyFile(keystorePath, keystoreBackup);
  await copyFile(aliasesPath, aliasesBackup);
  await chmod(keystoreBackup, 0o600);
  await chmod(aliasesBackup, 0o600);
  await atomicWrite(
    keystorePath,
    `${JSON.stringify(merged.keystore, null, 2)}\n`,
  );
  await atomicWrite(
    aliasesPath,
    `${JSON.stringify(merged.aliases, null, 2)}\n`,
  );
  process.stdout.write(`${counts}\n`);
}

if (import.meta.main) {
  const result = await attempt(main);
  if (!result.ok) {
    process.stderr.write(`FATAL: ${errorMessage(result.error)}\n`);
    process.exitCode = 2;
  }
}
