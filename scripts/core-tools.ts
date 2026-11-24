// Brewfile.core owns the package list; tool-tiers owns its command map; this checks prefixes.
import { existsSync, readFileSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import { LAND_HOSTS, resolveRole } from "#root/config-registry.ts";
import {
  commandsForFormula,
  readToolCommandMap,
} from "@dotfiles/tool-tiers/src/tool-commands.ts";
import {
  currentToolHost,
  parseBrewEntries,
  type ToolHost,
} from "@dotfiles/tool-tiers/src/tool-tiers.ts";

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
  const commandMap = await readToolCommandMap();
  const text = await Bun.file(join(root, "Brewfile.core")).text();
  const names = (
    await Promise.all(
      parseBrewEntries(text, "core", host).map(async ({ kind, name }) => {
        const base = name.split("/").at(-1) ?? name;
        if (
          (base === "codex" && !host.isWsl) ||
          (kind === "cask" && !commandMap.has(base))
        )
          return [];
        return commandsForFormula(name, commandMap);
      }),
    )
  ).flat();
  return [...new Set(names)];
}

/** Which profile this machine is. The machine says so itself, in one word, in
 * ~/.config/dotfiles/profile; the repo defines what a profile means (roles/roles.toml) and must
 * not need a machine's name to answer. LAND_HOSTS' hostname match is the fallback for machines
 * that have not written the file yet, and goes away once they have. */
export function machineRole(
  home = homedir(),
  host = hostname(),
): { role: "workstation" | "shared-light"; source: string } {
  const path = join(home, ".config/dotfiles/profile");
  const declared = existsSync(path) ? readFileSync(path, "utf8").trim() : "";
  if (declared === "workstation" || declared === "shared-light")
    return { role: declared, source: path };
  const { role, bound } = resolveRole(host);
  return {
    role,
    source: bound ? `host ${host}` : `unbound host ${host}; default`,
  };
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
export async function corePathProblems(
  commands: readonly string[],
  prefix: string,
  path: string,
): Promise<string[]> {
  const physicalPrefix =
    Bun.which(join(prefix, "bin/brew")) === null
      ? undefined
      : await realpath(prefix);
  return Promise.all(
    commands.map(async (command) => {
      const resolved = Bun.which(command, { PATH: path });
      // Shared hosts can expose HOME through a mount alias (/home2 vs /export/home/home2).
      // Ownership is filesystem identity, not whichever spelling shellenv returns.
      const physicalResolved =
        resolved === null ? undefined : await realpath(resolved);
      return resolved !== null &&
        physicalPrefix !== undefined &&
        (physicalResolved?.startsWith(`${physicalPrefix}/`) ?? false)
        ? null
        : `${command}: ${resolved ?? "missing"} (expected ${prefix}/)`;
    }),
  ).then((problems) => problems.filter((problem) => problem !== null));
}
