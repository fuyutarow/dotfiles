// Brewfile.core owns the package list; tools/tool-tiers owns its command map and this module checks prefixes.
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { hostname, homedir, release } from "node:os";
import { LAND_HOSTS } from "./config-registry.ts";
import {
  commandsForFormula,
  readToolCommandMap,
} from "../tools/tool-tiers/src/tool-commands.ts";

export const LINUXBREW = "/home/linuxbrew/.linuxbrew";

export async function coreCommands(
  root: string,
  options: { isWsl?: boolean } = {},
): Promise<string[]> {
  const isWsl =
    options.isWsl ??
    (process.platform === "linux" && /microsoft/iu.test(release()));
  const commandMap = readToolCommandMap();
  const names = (await Bun.file(join(root, "Brewfile.core")).text())
    .split("\n")
    .flatMap((line) => {
      const match = /^\s*(brew|cask) "([^"]+)"/u.exec(line);
      const kind = match?.[1];
      const name = match?.[2]?.split("/").at(-1);
      if (
        name === undefined ||
        (name === "codex" && !isWsl) ||
        (kind === "cask" && !commandMap.has(name))
      )
        return [];
      return commandsForFormula(name, commandMap);
    });
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
