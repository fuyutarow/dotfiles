import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fromThrowable, err, ok, type Result } from "neverthrow";
import { z } from "../../shared/src/zod.ts";
import type { HostKind } from "./profiles.ts";

export type ApprovedHost = {
  alias: string;
  kind: HostKind;
  transfers: readonly string[];
};

const hostKindSchema = z.enum(["linux", "wsl", "mac"]);

export function readApprovedHost(
  alias: string,
  file = join(homedir(), ".config/coredev/hosts.toml"),
): Result<ApprovedHost, Error> {
  const read = fromThrowable((path: string) => readFileSync(path, "utf8"))(
    file,
  );
  if (read.isErr())
    return err(
      new Error(
        `approved host '${alias}' unavailable: host registry is missing or unreadable`,
      ),
    );
  const source = read.value;
  const section = `[hosts.${alias}]`;
  const lines = source.split(/\r?\n/u);
  const start = lines.indexOf(section);
  if (start < 0) return err(new Error(`host is not approved: ${alias}`));
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*\[[^\]]+\]\s*$/u.test(line)) break;
    body.push(line.replace(/#.*$/u, "").trim());
  }
  const values = new Map<string, string>();
  for (const line of body) {
    if (line.length === 0) continue;
    const match = /^(kind|transfers)\s*=\s*(.+)$/u.exec(line);
    if (match === null)
      return err(new Error(`invalid host registry entry: ${alias}`));
    const key = match[1];
    const value = match[2];
    if (key === undefined || value === undefined)
      return err(new Error(`invalid host registry entry: ${alias}`));
    if (values.has(key))
      return err(
        new Error(`duplicate host registry field '${key}' for ${alias}`),
      );
    values.set(key, value);
  }
  const kindInput = values.get("kind")?.replaceAll(/^"|"$/gu, "");
  const kindValue = hostKindSchema.safeParse(kindInput);
  if (!kindValue.success)
    return err(new Error(`invalid target kind for approved host '${alias}'`));
  const transfersText = values.get("transfers");
  if (transfersText === undefined || !/^\[.*\]$/u.test(transfersText))
    return err(new Error(`invalid transfers for approved host '${alias}'`));
  const transferTokens = [...transfersText.matchAll(/"([a-z-]+)"/gu)].map(
    (match) => match[1],
  );
  const stringTokens = z.array(z.string()).safeParse(transferTokens);
  const residue = transfersText
    .replaceAll(/"[a-z-]+"/gu, "")
    .replaceAll(/[,[\]\s]/gu, "");
  const transferSchema = z.array(z.enum(["fnox", "codex-auth"]));
  const parsedTransfers = stringTokens.success
    ? transferSchema.safeParse(stringTokens.data)
    : stringTokens;
  if (residue.length > 0 || !parsedTransfers.success)
    return err(new Error(`invalid transfers for approved host '${alias}'`));
  return ok({ alias, kind: kindValue.data, transfers: parsedTransfers.data });
}
