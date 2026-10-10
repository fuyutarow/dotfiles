/** Build the environment used by every command spawned during linux:init. */
import { brewPrefix, prefixPaths } from "./core-tools.ts";

export function buildLinuxInitEnv(
  home: string,
  inherited: NodeJS.ProcessEnv,
  prefix = brewPrefix(home),
): NodeJS.ProcessEnv {
  const localBin = `${home}/.local/bin`;
  const inheritedPath = inherited.PATH;
  const path = [
    ...prefixPaths(prefix),
    localBin,
    `${home}/.bun/bin`,
    inheritedPath,
  ]
    .filter((part) => part !== undefined && part !== "")
    .join(":");

  return { ...inherited, HOME: home, PATH: path };
}
