// IGNORE-DECLARED: declared ignore sources, no ignored tracked files, and no fresh-clone leftovers.
import {
  access,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { LINKS } from "./config-registry.ts";

export const ROOT = resolve(import.meta.dir, "..");

const run = async (
  command: string[],
  cwd: string,
  timeout = 120_000,
  env?: Record<string, string>,
): Promise<{ code: number; out: string; err: string }> => {
  const proc = Bun.spawn(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    timeout,
    ...(env === undefined ? {} : { env: { ...process.env, ...env } }),
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out, err };
};

const nulPaths = (output: string): string[] =>
  output.split("\0").filter((path) => path.length > 0);

export async function trackedPaths(root = ROOT): Promise<{
  paths: string[];
  error: string | null;
}> {
  const result = await run(
    [
      "jj",
      "file",
      "list",
      "--ignore-working-copy",
      "--template",
      'path ++ "\\0"',
    ],
    root,
  );
  if (result.code !== 0)
    return {
      paths: [],
      error: `jj file list failed (${result.code}): ${result.err.trim()}`,
    };
  return { paths: nulPaths(result.out), error: null };
}

export async function visiblePaths(root = ROOT): Promise<{
  paths: string[];
  error: string | null;
}> {
  const result = await run(
    [
      "rg",
      "--no-config",
      "--files",
      "--hidden",
      "--follow",
      "--no-require-git",
      "--no-ignore-vcs",
      "--no-ignore-global",
      "--no-ignore-parent",
      "--null",
      "--ignore-file",
      ".gitignore",
      "--ignore-file",
      "git/ignore",
      "-g",
      "!**/.jj/**",
      "-g",
      "!**/.git/**",
    ],
    root,
  );
  if (result.code !== 0 && result.code !== 1)
    return {
      paths: [],
      error: `ignore-aware file listing failed (${result.code}): ${result.err.trim()}`,
    };
  return { paths: nulPaths(result.out), error: null };
}

export async function ignoreFindings(root = ROOT): Promise<string[]> {
  const [localIgnore, globalIgnore] = await Promise.all([
    ignoreRuleFindings(root, ".gitignore"),
    ignoreRuleFindings(root, "git/ignore"),
  ]);
  const findings = [...localIgnore, ...globalIgnore];
  const config = await readFile(join(root, "git/gitconfig"), "utf8");
  const excludes = config.match(/^\s*excludesfile\s*=\s*(\S+)\s*$/imu)?.[1];
  const expected = "~/.config/git/ignore";
  if (excludes !== expected)
    findings.push(`git/gitconfig must declare core.excludesfile = ${expected}`);
  if (!(await fileExists(join(root, "git/ignore"))))
    findings.push("missing declared global ignore source: git/ignore");
  if (
    !LINKS.some(
      ([when, source, destination]) =>
        when === "all" &&
        source === "git/ignore" &&
        destination === ".config/git/ignore",
    )
  )
    findings.push("git/ignore is not linked by scripts/config-registry.ts");

  const local = await trackedPaths(root);
  if (local.error !== null) findings.push(local.error);
  if (local.error === null)
    findings.push(...(await trackedIgnoreFindings(root, local.paths)));
  return findings;
}

/** Match tracked path names as leaves: Git tracks a symlink, not its target's descendants. */
async function trackedIgnoreFindings(
  root: string,
  paths: string[],
): Promise<string[]> {
  const probe = await mkdtemp(join(tmpdir(), "dotfiles-ignore-paths-"));
  const findings = await trackedIgnoreFindingsInProbe(root, probe, paths);
  await rm(probe, { recursive: true, force: true });
  return findings;
}

async function trackedIgnoreFindingsInProbe(
  root: string,
  probe: string,
  paths: string[],
): Promise<string[]> {
  for (const path of paths) {
    const destination = join(probe, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, "");
  }
  await mkdir(join(probe, "git"), { recursive: true });
  await cp(join(root, ".gitignore"), join(probe, ".gitignore"));
  await cp(join(root, "git/ignore"), join(probe, "git/ignore"));
  const visible = await visiblePaths(probe);
  if (visible.error !== null) return [visible.error];
  const present = new Set(visible.paths);
  return paths
    .filter((path) => !present.has(path))
    .map((path) => `tracked path is ignored: ${path}`);
}

async function hasSymlinkParent(root: string, path: string): Promise<boolean> {
  let parent = dirname(path);
  while (parent !== ".") {
    const parentPath = join(root, parent);
    const symlink = await Promise.try(() => lstat(parentPath)).then(
      (stat) => stat.isSymbolicLink(),
      () => false,
    );
    if (symlink) return true;
    parent = dirname(parent);
  }
  return false;
}

/** Copy each physical source once; preserve relative compatibility links inside the clone. */
export async function copyCloneSources(
  root: string,
  clone: string,
  paths: string[],
): Promise<void> {
  const sources: string[] = [];
  for (const path of new Set(paths)) {
    if (path === ".git" || path === ".jj") continue;
    if (!(await hasSymlinkParent(root, path))) sources.push(path);
  }
  for (const path of sources) {
    const destination = join(clone, path);
    await mkdir(dirname(destination), { recursive: true });
    await cp(join(root, path), destination, {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
    });
  }
}

async function ignoreRuleFindings(
  root: string,
  path: string,
): Promise<string[]> {
  const lines = (await readFile(join(root, path), "utf8")).split(/\r?\n/u);
  let ownerDeclared = false;
  return lines.flatMap((line, index) => {
    if (line.trim() === "") {
      ownerDeclared = false;
      return [];
    }
    if (/^\s*#/u.test(line)) {
      ownerDeclared = ownerDeclared || /^\s*#\s*Owner:/iu.test(line);
      return [];
    }
    const pattern = line.startsWith("!") ? line.slice(1) : line;
    const findings: string[] = [];
    if (!ownerDeclared)
      findings.push(`${path}:${index + 1} ignore rule has no owner comment`);
    if (!pattern.startsWith("/") && !pattern.startsWith("**/"))
      findings.push(
        `${path}:${index + 1} ignore rule is not scoped to its intended path depth`,
      );
    return findings;
  });
}

/**
 * Copy the revision's tracked tree into a disposable directory, initialize a fresh jj checkout,
 * run representative land-gate tasks, then assert jj reports no untracked paths.
 */
export async function freshCloneGateFindings(root = ROOT): Promise<string[]> {
  const tracked = await trackedPaths(root);
  if (tracked.error !== null) return [tracked.error];
  const visible = await visiblePaths(root);
  if (visible.error !== null) return [visible.error];
  const clone = await mkdtemp(join(tmpdir(), "dotfiles-ignore-clone-"));
  const miseState = await mkdtemp(
    join(tmpdir(), "dotfiles-ignore-mise-state-"),
  );
  await using cleanup = new AsyncDisposableStack();
  cleanup.defer(async () => {
    await rm(clone, { recursive: true, force: true });
    await rm(miseState, { recursive: true, force: true });
  });
  return await Promise.try(async () => {
    await copyCloneSources(root, clone, [...tracked.paths, ...visible.paths]);
    // A tracked link or source path must never carry checkout metadata into the clone.
    await rm(join(clone, ".git"), { recursive: true, force: true });
    await rm(join(clone, ".jj"), { recursive: true, force: true });
    const init = await run(
      ["jj", "git", "init", "--no-colocate", clone],
      clone,
    );
    if (init.code !== 0)
      return [`fresh clone jj init failed (${init.code}): ${init.err.trim()}`];
    const baseline = await run(["jj", "new"], clone);
    if (baseline.code !== 0)
      return [
        `fresh clone baseline failed (${baseline.code}): ${baseline.err.trim()}`,
      ];

    for (const task of ["lint:ignore", "lint:md"]) {
      const result = await run(["mise", "run", task], clone, 180_000, {
        XDG_STATE_HOME: miseState,
        MISE_OFFLINE: "1",
        MISE_TRUSTED_CONFIG_PATHS: clone,
      });
      if (result.code !== 0)
        return [
          `fresh clone task ${task} failed (${result.code}): ${result.err.trim()}${result.out.trim()}`,
        ];
    }

    const status = await run(["jj", "status"], clone);
    if (status.code !== 0)
      return [
        `fresh clone jj status failed (${status.code}): ${status.err.trim()}`,
      ];
    const paths = status.out
      .split("\n")
      .filter((line) => /^\s*[A-Z?]\s/u.test(line))
      .map((line) => line.trim());
    return paths.map(
      (path) => `fresh clone has an untracked or changed path: ${path}`,
    );
  });
}

async function fileExists(path: string): Promise<boolean> {
  return Promise.try(() => access(path)).then(
    () => true,
    () => false,
  );
}

if (import.meta.main) {
  const findings = await ignoreFindings();
  for (const finding of findings) process.stderr.write(`FAIL: ${finding}\n`);
  if (findings.length === 0)
    process.stdout.write(
      "PASS: declared ignore rules; no tracked file is ignored\n",
    );
  process.exitCode = findings.length === 0 ? 0 : 1;
}
