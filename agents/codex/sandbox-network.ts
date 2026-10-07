// The declaration is repo-owned; ~/.codex/config.toml remains Codex-owned. This module only
// reads the declared key and edits that single line in the live file, preserving unrelated bytes.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { attempt } from "../hooks/attempt.ts";
import { z } from "../hooks/zod.ts";

const RecordSchema = z.record(z.string(), z.unknown());

export type Live = { contents: string | null; networkAccess: boolean | null };

export async function readDeclared(dotfiles: string): Promise<boolean | Error> {
  const path = join(dotfiles, "agents/codex/config.declared.toml");
  const parsed = await attempt(() =>
    Bun.TOML.parse(readFileSync(path, "utf8")),
  );
  if (!parsed.ok) return new Error(`${path}: unreadable or not TOML`);
  const table = RecordSchema.safeParse(parsed.value);
  if (!table.success) return new Error(`${path}: unreadable or not TOML`);
  const section = RecordSchema.safeParse(table.data.sandbox_workspace_write);
  const value = section.success ? section.data.network_access : undefined;
  if (typeof value === "boolean") return value;
  return new Error(
    `${path}: sandbox_workspace_write.network_access must be true or false`,
  );
}

export async function readLive(home: string): Promise<Live | Error> {
  const path = join(home, ".codex/config.toml");
  if (!existsSync(path)) return { contents: null, networkAccess: null };
  const read = await attempt(() => readFileSync(path, "utf8"));
  if (!read.ok) return new Error(`${path}: unreadable or not TOML`);
  const parsed = await attempt(() => Bun.TOML.parse(read.value));
  if (!parsed.ok) return new Error(`${path}: unreadable or not TOML`);
  const table = RecordSchema.safeParse(parsed.value);
  if (!table.success) return new Error(`${path}: unreadable or not TOML`);
  const section = RecordSchema.safeParse(table.data.sandbox_workspace_write);
  const value = section.success ? section.data.network_access : undefined;
  return {
    contents: read.value,
    networkAccess: typeof value === "boolean" ? value : null,
  };
}

export function drift(declared: boolean, live: Live): string[] {
  return live.networkAccess === declared
    ? []
    : [
        `sandbox_workspace_write.network_access=${String(live.networkAccess)}, declared ${declared}`,
      ];
}

/** Change only the target assignment, or append its one-table declaration when absent. */
export function edit(contents: string | null, declared: boolean): string {
  const source = contents ?? "";
  const lines = source.split("\n");
  let inTarget = false;
  let tableFound = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const header = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/u.exec(line);
    if (header !== null) {
      inTarget = header[1] === "sandbox_workspace_write";
      tableFound ||= inTarget;
      continue;
    }
    if (!inTarget) continue;
    const assignment =
      /^(\s*network_access\s*=\s*)(true|false)(\s*(?:#.*)?)$/u.exec(line);
    if (assignment !== null) {
      lines[index] = `${assignment[1]}${declared}${assignment[3]}`;
      return lines.join("\n");
    }
  }
  if (tableFound) {
    const headerIndex = lines.findIndex((line) =>
      /^\s*\[sandbox_workspace_write\]\s*(?:#.*)?$/u.test(line),
    );
    const nextTable = lines.findIndex(
      (line, index) => index > headerIndex && /^\s*\[[^\]]+\]/u.test(line),
    );
    const insertion = nextTable < 0 ? lines.length : nextTable;
    lines.splice(insertion, 0, `network_access = ${declared}`);
    return lines.join("\n");
  }
  const prefix =
    source.length === 0 || source.endsWith("\n") ? source : `${source}\n`;
  return `${prefix}${prefix.length === 0 || prefix.endsWith("\n\n") ? "" : "\n"}[sandbox_workspace_write]\nnetwork_access = ${declared}\n`;
}
