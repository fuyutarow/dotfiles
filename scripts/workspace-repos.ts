import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** The shared repo set used by repos:audit and the helper-path doctor check. */
export function registeredRepos(
  home: string,
  workspace = join(home, "Workspace"),
): string[] {
  const candidates = [join(home, "dotfiles")];
  if (existsSync(workspace)) {
    candidates.push(
      ...readdirSync(workspace, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(workspace, entry.name)),
    );
  }
  return candidates.filter((path) => existsSync(join(path, ".git")));
}
