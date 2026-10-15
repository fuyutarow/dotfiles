// IGNORE-DECLARED: declared ignore sources, no ignored tracked files, and no fresh-clone leftovers.
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { LINKS } from "./config-registry.ts";

export const ROOT = resolve(import.meta.dir, "..");

const run = (
  command: string[],
  cwd: string,
  timeout = 120_000,
  env?: Record<string, string>,
): { code: number; out: string; err: string } => {
  // bounded: every subprocess has an explicit synchronous timeout.
  const result = Bun.spawnSync(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    timeout,
    ...(env === undefined ? {} : { env: { ...process.env, ...env } }),
  });
  return {
    code: result.exitCode,
    out: result.stdout.toString(),
    err: result.stderr.toString(),
  };
};

const nulPaths = (output: string): string[] =>
  output.split("\0").filter((path) => path.length > 0);

export function trackedPaths(root = ROOT): {
  paths: string[];
  error: string | null;
} {
  const result = run(
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

export function visiblePaths(root = ROOT): {
  paths: string[];
  error: string | null;
} {
  const result = run(
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

export function ignoreFindings(root = ROOT): string[] {
  const findings = [
    ...ignoreRuleFindings(root, ".gitignore"),
    ...ignoreRuleFindings(root, "git/ignore"),
  ];
  const config = readFileSync(join(root, "git/gitconfig"), "utf8");
  const excludes = config.match(/^\s*excludesfile\s*=\s*(\S+)\s*$/imu)?.[1];
  const expected = "~/.config/git/ignore";
  if (excludes !== expected)
    findings.push(`git/gitconfig must declare core.excludesfile = ${expected}`);
  if (!existsSync(join(root, "git/ignore")))
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

  const local = trackedPaths(root);
  if (local.error !== null) findings.push(local.error);
  if (local.error === null)
    findings.push(...trackedIgnoreFindings(root, local.paths));
  return findings;
}

/** Match tracked path names as leaves: Git tracks a symlink, not its target's descendants. */
function trackedIgnoreFindings(root: string, paths: string[]): string[] {
  const probe = mkdtempSync(join(tmpdir(), "dotfiles-ignore-paths-"));
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    rmSync(probe, { recursive: true, force: true });
  });
  for (const path of paths) {
    const destination = join(probe, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, "");
  }
  mkdirSync(join(probe, "git"), { recursive: true });
  cpSync(join(root, ".gitignore"), join(probe, ".gitignore"));
  cpSync(join(root, "git/ignore"), join(probe, "git/ignore"));
  const visible = visiblePaths(probe);
  if (visible.error !== null) return [visible.error];
  const present = new Set(visible.paths);
  return paths
    .filter((path) => !present.has(path))
    .map((path) => `tracked path is ignored: ${path}`);
}

function hasSymlinkParent(root: string, path: string): boolean {
  let parent = dirname(path);
  while (parent !== ".") {
    if (lstatSync(join(root, parent)).isSymbolicLink()) return true;
    parent = dirname(parent);
  }
  return false;
}

/** Copy each physical source once; preserve relative compatibility links inside the clone. */
export function copyCloneSources(
  root: string,
  clone: string,
  paths: string[],
): void {
  const sources = [...new Set(paths)].filter(
    (path) =>
      path !== ".git" && path !== ".jj" && !hasSymlinkParent(root, path),
  );
  for (const path of sources) {
    const destination = join(clone, path);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(root, path), destination, {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
    });
  }
}

function ignoreRuleFindings(root: string, path: string): string[] {
  const lines = readFileSync(join(root, path), "utf8").split(/\r?\n/u);
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
export function freshCloneGateFindings(root = ROOT): string[] {
  const tracked = trackedPaths(root);
  if (tracked.error !== null) return [tracked.error];
  const visible = visiblePaths(root);
  if (visible.error !== null) return [visible.error];
  const clone = mkdtempSync(join(tmpdir(), "dotfiles-ignore-clone-"));
  const miseState = mkdtempSync(join(tmpdir(), "dotfiles-ignore-mise-state-"));
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    rmSync(clone, { recursive: true, force: true });
  });
  cleanup.defer(() => {
    rmSync(miseState, { recursive: true, force: true });
  });
  copyCloneSources(root, clone, [...tracked.paths, ...visible.paths]);
  // A tracked link or source path must never carry checkout metadata into the clone.
  rmSync(join(clone, ".git"), { recursive: true, force: true });
  rmSync(join(clone, ".jj"), { recursive: true, force: true });
  const init = run(["jj", "git", "init", "--no-colocate", clone], clone);
  if (init.code !== 0)
    return [`fresh clone jj init failed (${init.code}): ${init.err.trim()}`];
  const baseline = run(["jj", "new"], clone);
  if (baseline.code !== 0)
    return [
      `fresh clone baseline failed (${baseline.code}): ${baseline.err.trim()}`,
    ];

  for (const task of ["lint:ignore", "lint:md"]) {
    const result = run(["mise", "run", task], clone, 180_000, {
      XDG_STATE_HOME: miseState,
    });
    if (result.code !== 0)
      return [
        `fresh clone task ${task} failed (${result.code}): ${result.err.trim()}${result.out.trim()}`,
      ];
  }

  const status = run(["jj", "status"], clone);
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
}

if (import.meta.main) {
  const findings = ignoreFindings();
  for (const finding of findings) process.stderr.write(`FAIL: ${finding}\n`);
  if (findings.length === 0)
    process.stdout.write(
      "PASS: declared ignore rules; no tracked file is ignored\n",
    );
  process.exitCode = findings.length === 0 ? 0 : 1;
}
