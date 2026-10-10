// Brewfile.core owns the formula list; this module owns formula-to-command spelling and prefix checks.
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { hostname, homedir } from "node:os";
import { LAND_HOSTS } from "./config-registry.ts";

export const LINUXBREW = "/home/linuxbrew/.linuxbrew";
const COMMANDS: Readonly<Record<string, readonly string[]>> = {
  "git-delta": ["delta"],
  ripgrep: ["rg"],
  "rm-improved": ["rip"],
  "choose-rust": ["choose"],
  bottom: ["btm"],
  rustup: ["rustup", "cargo"],
  bun: ["bun", "bunx"],
  uv: ["uv", "uvx"],
};
export async function coreCommands(root: string): Promise<string[]> {
  return (await Bun.file(join(root, "Brewfile.core")).text())
    .split("\n")
    .flatMap((line) => {
      const name = /^brew "([^"]+)"/u.exec(line)?.[1];
      return name === undefined ? [] : (COMMANDS[name] ?? [name]);
    });
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
