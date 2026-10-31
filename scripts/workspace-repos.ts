import { access, readdir } from "node:fs/promises";
import { join } from "node:path";

/** The shared repo set used by repos:audit and the helper-path doctor check. */
async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

export async function registeredRepos(
  home: string,
  workspace = join(home, "Workspace"),
): Promise<string[]> {
  const candidates = [join(home, "dotfiles")];
  if (await exists(workspace)) {
    candidates.push(
      ...(await readdir(workspace, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(workspace, entry.name)),
    );
  }
  const present = await Promise.all(
    candidates.map((path) => exists(join(path, ".git"))),
  );
  return candidates.filter((_, index) => present[index] === true);
}
