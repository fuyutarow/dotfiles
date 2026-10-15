import { afterEach, describe, expect, test } from "bun:test";
import { generateKeyPair, type KeyObject } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergeSuiData } from "../src/sui-keystore-merge.ts";
import { jsonOf, z } from "../../shared/src/zod.ts";

const keystoreJson = jsonOf(z.array(z.string()));
const aliasesJson = jsonOf(
  z.array(z.object({ alias: z.string(), public_key_base64: z.string() })),
);

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function key(alias: string): Promise<{
  privateKey: string;
  alias: { alias: string; public_key_base64: string };
}> {
  const pair = await new Promise<{
    privateKey: KeyObject;
    publicKey: KeyObject;
  }>((resolve, reject) => {
    generateKeyPair("ed25519", {}, (error, publicKey, privateKey) => {
      if (error !== null) reject(error);
      else resolve({ publicKey, privateKey });
    });
  });
  const privateDer = pair.privateKey.export({ format: "der", type: "pkcs8" });
  const publicDer = pair.publicKey.export({ format: "der", type: "spki" });
  return {
    privateKey: Buffer.concat([
      Buffer.from([0]),
      privateDer.subarray(-32),
    ]).toString("base64"),
    alias: {
      alias,
      public_key_base64: Buffer.concat([
        Buffer.from([0]),
        publicDer.subarray(-32),
      ]).toString("base64"),
    },
  };
}

async function run(
  configDir: string,
  incoming: {
    privateKey: string;
    alias: { alias: string; public_key_base64: string };
  }[],
  dryRun = false,
) {
  const env = {
    ...process.env,
    SUI_KEYSTORE: JSON.stringify(incoming.map((item) => item.privateKey)),
    SUI_ALIASES: JSON.stringify(incoming.map((item) => item.alias)),
  };
  const args = [
    "bun",
    join(import.meta.dir, "../src/sui-keystore-merge.ts"),
    "--config-dir",
    configDir,
  ];
  if (dryRun) args.push("--dry-run");
  const proc = Bun.spawn(args, { env, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { out, err, code };
}

async function target(): Promise<{
  root: string;
  configDir: string;
  client: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "sui-keystore-merge-test-"));
  roots.push(root);
  const configDir = join(root, "sui_config");
  await mkdir(configDir);
  const client = join(configDir, "client.yaml");
  await writeFile(join(configDir, "sui.keystore"), "[]\n");
  await writeFile(join(configDir, "sui.aliases"), "[]\n");
  await writeFile(client, "active-address: keep-me\n");
  return { root, configDir, client };
}

describe("sui-keystore-merge", () => {
  test("adds new keys and aliases, preserving target state and client.yaml", async () => {
    const t = await target();
    const existing = await key("EXISTING");
    const next = await key("NEW_KEY");
    await writeFile(
      join(t.configDir, "sui.keystore"),
      JSON.stringify([existing.privateKey]) + "\n",
      { mode: 0o600 },
    );
    await writeFile(
      join(t.configDir, "sui.aliases"),
      JSON.stringify([existing.alias]) + "\n",
    );
    const result = await run(t.configDir, [next]);
    expect(result.code).toBe(0);
    expect(result.out).toContain("keystore existing 1, added 1, total 2");
    const mergedKeys = keystoreJson.safeParse(
      await readFile(join(t.configDir, "sui.keystore"), "utf8"),
    );
    const mergedAliases = aliasesJson.safeParse(
      await readFile(join(t.configDir, "sui.aliases"), "utf8"),
    );
    expect(mergedKeys.success).toBe(true);
    expect(mergedAliases.success).toBe(true);
    if (mergedKeys.success)
      expect(mergedKeys.data).toEqual([existing.privateKey, next.privateKey]);
    if (mergedAliases.success)
      expect(mergedAliases.data).toEqual([existing.alias, next.alias]);
    expect(await readFile(t.client, "utf8")).toBe("active-address: keep-me\n");
    expect((await stat(join(t.configDir, "sui.keystore"))).mode & 0o777).toBe(
      0o600,
    );
    const backups = [];
    for await (const backup of new Bun.Glob("*.bak-*").scan({
      cwd: t.configDir,
    }))
      backups.push(backup);
    expect(backups).toHaveLength(2);
    for (const backup of backups)
      expect((await stat(join(t.configDir, backup))).mode & 0o777).toBe(0o600);
  });

  test("deduplicates exact keys and aliases by public key", async () => {
    const item = await key("SAME");
    const result = mergeSuiData(
      [item.privateKey],
      [item.alias],
      [item.privateKey],
      [item.alias],
    );
    expect(typeof result).not.toBe("string");
    if (typeof result !== "string") {
      expect(result.keystoreCounts).toEqual({
        existing: 1,
        added: 0,
        total: 1,
      });
      expect(result.aliasCounts).toEqual({ existing: 1, added: 0, total: 1 });
    }
  });

  test("dry run reports counts and does not write", async () => {
    const t = await target();
    const item = await key("DRY");
    const result = await run(t.configDir, [item], true);
    expect(result.code).toBe(0);
    expect(result.out).toContain("dry-run, no files written");
    expect(await readFile(join(t.configDir, "sui.keystore"), "utf8")).toBe(
      "[]\n",
    );
  });

  test("alias collision exits 1 with no writes", async () => {
    const t = await target();
    const incoming = await key("COLLISION");
    const other = await key("OTHER");
    const keystorePath = join(t.configDir, "sui.keystore");
    const aliasesPath = join(t.configDir, "sui.aliases");
    await writeFile(keystorePath, JSON.stringify([other.privateKey]) + "\n");
    await writeFile(
      aliasesPath,
      JSON.stringify([{ ...other.alias, alias: incoming.alias.alias }]) + "\n",
    );
    const result = await run(t.configDir, [incoming]);
    expect(result.code).toBe(1);
    expect(result.err).toContain("COLLISION");
    expect(await readFile(keystorePath, "utf8")).toContain(other.privateKey);
    expect(await readFile(aliasesPath, "utf8")).toContain(incoming.alias.alias);
    const backups = [];
    for await (const backup of new Bun.Glob("*.bak-*").scan({
      cwd: t.configDir,
    }))
      backups.push(backup);
    expect(backups).toHaveLength(0);
  });

  test("dry run reports alias conflicts without writing", async () => {
    const t = await target();
    const incoming = await key("DRY_COLLISION");
    const other = await key("OTHER");
    const keystorePath = join(t.configDir, "sui.keystore");
    const aliasesPath = join(t.configDir, "sui.aliases");
    await writeFile(keystorePath, JSON.stringify([other.privateKey]) + "\n");
    await writeFile(
      aliasesPath,
      JSON.stringify([{ ...other.alias, alias: incoming.alias.alias }]) + "\n",
    );
    const result = await run(t.configDir, [incoming], true);
    expect(result.code).toBe(1);
    expect(result.err).toContain("DRY_COLLISION");
    expect(result.err).toContain("keystore existing 1, added 0, total 1");
    expect(await readFile(keystorePath, "utf8")).toContain(other.privateKey);
    const backups = [];
    for await (const backup of new Bun.Glob("*.bak-*").scan({
      cwd: t.configDir,
    }))
      backups.push(backup);
    expect(backups).toHaveLength(0);
  });

  test("new key without an alias entry is refused", async () => {
    const item = await key("NO_ALIAS");
    const result = mergeSuiData([], [], [item.privateKey], []);
    expect(result).toContain("new Sui key has no alias entry");
  });
});
