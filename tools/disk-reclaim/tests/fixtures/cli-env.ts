import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Every filesystem declaration and executable used by the spawned CLI is isolated. */
export function cliEnv(
  root: string,
  config: { repoRoots?: string[]; scratchRoots?: string[] } = {},
) {
  const home = join(root, "home");
  const bin = join(root, "bin");
  const procRoot = join(root, "proc");
  mkdirSync(home, { recursive: true });
  mkdirSync(bin, { recursive: true });
  mkdirSync(procRoot, { recursive: true });
  for (const name of ["jj", "git", "lsattr", "getent", "pgrep", "sh", "true"]) {
    const source = Bun.which(name);
    if (source !== null) symlinkSync(source, join(bin, name));
  }
  const declaration = join(root, "reclaim.toml");
  writeFileSync(
    declaration,
    [
      `repo_roots = ${JSON.stringify(config.repoRoots ?? [])}`,
      "repos = []",
      `scratch_roots = ${JSON.stringify(config.scratchRoots ?? [])}`,
      `delete_roots = ${JSON.stringify([root])}`,
      'regenerable_ignored = ["target", "node_modules", ".venv", "build", "dist"]',
      'ignore_unreadable_procs = ["sshd"]',
      "session_grace_hours = 24",
    ].join("\n"),
  );
  const inherited: NodeJS.ProcessEnv = { ...process.env };
  delete inherited.WSL_DISTRO_NAME;
  const env = {
    ...inherited,
    HOME: home,
    PATH: bin,
    RECLAIM_CONFIG: declaration,
    RECLAIM_STATE_DIR: join(root, "state"),
    RECLAIM_UNIT_PROC_ROOT: procRoot,
    AUDIT_PROJECTS: join(home, "Workspace"),
    KONDO_DIR: home,
    RUSTUP_HOME: join(home, ".rustup"),
    CARGO_HOME: join(home, ".cargo"),
    BUN_INSTALL: join(home, ".bun"),
    XDG_STATE_HOME: join(home, ".local/state"),
    XDG_DATA_HOME: join(home, ".local/share"),
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_CACHE_HOME: join(home, ".cache"),
    GRAVEYARD: join(home, "graveyard"),
  };
  return env;
}
