// Brewfile.core owns the package list; tool-tiers owns its command map; this checks prefixes.
import { realpathSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import { LAND_HOSTS } from "./config-registry.ts";
import {
  commandsForFormula,
  readToolCommandMap,
} from "../tools/tool-tiers/src/tool-commands.ts";
import {
  currentToolHost,
  parseBrewEntries,
  type ToolHost,
} from "../tools/tool-tiers/src/tool-tiers.ts";

export const LINUXBREW = "/home/linuxbrew/.linuxbrew";

export async function coreCommands(
  root: string,
  options: { isWsl?: boolean } = {},
): Promise<string[]> {
  const detectedHost = currentToolHost();
  const host: ToolHost = {
    ...detectedHost,
    isWsl: options.isWsl ?? detectedHost.isWsl,
  };
  const commandMap = readToolCommandMap();
  const text = await Bun.file(join(root, "Brewfile.core")).text();
  const names = parseBrewEntries(text, "core", host).flatMap(
    ({ kind, name }) => {
      const base = name.split("/").at(-1) ?? name;
      if (
        (base === "codex" && !host.isWsl) ||
        (kind === "cask" && !commandMap.has(base))
      )
        return [];
      return commandsForFormula(name, commandMap);
    },
  );
  return [...new Set(names)];
}

export function brewPrefix(
  home = homedir(),
  host = hostname(),
  platform = process.platform,
): string {
  if (platform === "darwin")
    return process.arch === "arm64" ? "/opt/homebrew" : "/usr/local";
  const name = host.split(".")[0];
  const declared =
    LAND_HOSTS.find(
      (row) =>
        row.alias === name || row.hostnames?.includes(name ?? "") === true,
    )?.brewPrefix ?? LINUXBREW;
  return declared === "~/.linuxbrew" ? join(home, ".linuxbrew") : declared;
}
export function prefixPaths(prefix: string): string[] {
  return [
    join(prefix, "bin"),
    join(prefix, "sbin"),
    join(prefix, "opt/rustup/bin"),
  ];
}
export function corePathProblems(
  commands: readonly string[],
  prefix: string,
  path: string,
): string[] {
  const physicalPrefix =
    Bun.which(join(prefix, "bin/brew")) === null
      ? undefined
      : realpathSync(prefix);
  return commands.flatMap((command) => {
    const resolved = Bun.which(command, { PATH: path });
    // Shared hosts can expose HOME through a mount alias (/home2 vs /export/home/home2).
    // Ownership is filesystem identity, not whichever spelling shellenv returns.
    return resolved !== null &&
      physicalPrefix !== undefined &&
      realpathSync(resolved).startsWith(`${physicalPrefix}/`)
      ? []
      : [`${command}: ${resolved ?? "missing"} (expected ${prefix}/)`];
  });
}
