// Shared J1 snapshot interface for commit-gate consumers. No Git index is involved.
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, posix } from "node:path";

export type JjPrecommit = {
  root: string;
  rev: string;
  base: string;
  paths: string[];
};

function fatal(message: string): never {
  process.stderr.write(`FATAL: precommit: ${message}\n`);
  process.exit(2);
}

export function validPath(path: string): boolean {
  const parts = path.split("/");
  return (
    path !== "" &&
    !isAbsolute(path) &&
    !path.includes("\0") &&
    !parts.includes("..") &&
    !parts.includes(".git") &&
    !parts.includes(".jj")
  );
}

export function selected(paths: readonly string[], path: string): boolean {
  return paths.some((raw) => {
    const prefix = posix.normalize(raw).replace(/\/$/u, "");
    return prefix === "." || path === prefix || path.startsWith(`${prefix}/`);
  });
}

export const filesets = (paths: readonly string[]): string[] =>
  paths.map((path) => `root:${JSON.stringify(path)}`);

export function jjRead(args: string[], root = process.cwd()): Buffer {
  const result = Bun.spawnSync(["jj", "--ignore-working-copy", ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.exitCode !== 0)
    fatal(`jj ${args[0]} failed: ${result.stderr.toString().trim()}`);
  return result.stdout;
}

export function jjContext(): JjPrecommit | undefined {
  const vcs = process.env.PRECOMMIT_VCS;
  if (vcs === undefined) return undefined;
  if (vcs !== "jj") fatal(`unsupported PRECOMMIT_VCS=${vcs}`);
  const {
    PRECOMMIT_PATHS_FILE: file,
    PRECOMMIT_REV: rev,
    PRECOMMIT_BASE: base,
  } = process.env;
  if (file === undefined || rev === undefined || base === undefined)
    fatal(
      "jj mode needs PRECOMMIT_PATHS_FILE, PRECOMMIT_REV and PRECOMMIT_BASE",
    );
  if (![rev, base].every((id) => /^[0-9a-f]{40,64}$/u.test(id)))
    fatal("PRECOMMIT_REV and PRECOMMIT_BASE must be full commit IDs");
  const text = readFileSync(file, "utf8");
  if (!text.endsWith("\0"))
    fatal("PRECOMMIT_PATHS_FILE must be NUL-terminated");
  const paths = text.slice(0, -1).split("\0");
  if (!paths.every((path) => validPath(path)))
    fatal("invalid repo-relative selected path");
  const root = jjRead(["root"]).toString().trim();
  return { root, rev, base, paths };
}

export function jjFiles(rev: string, root: string): string[] {
  return jjRead(["file", "list", "-r", rev, "-T", 'path ++ "\\0"'], root)
    .toString()
    .split("\0")
    .filter((path) => path !== "");
}

export function jjChanged(context: JjPrecommit): string[] {
  const args = ["diff", "--from", context.base, "--to", context.rev];
  // The agreed enumeration. The template form also preserves embedded newlines in paths.
  jjRead([...args, "--name-only"], context.root);
  const changed = jjRead([...args, "-T", 'path ++ "\\0"'], context.root)
    .toString()
    .split("\0")
    .filter((path) => path !== "" && selected(context.paths, path));
  // A rename's --name-only entry is its destination; include selected deleted sources too.
  const present = new Set(jjFiles(context.rev, context.root));
  return [
    ...new Set([
      ...changed,
      ...jjFiles(context.base, context.root).filter(
        (path) => !present.has(path) && selected(context.paths, path),
      ),
    ]),
  ];
}

export function jjContent(
  context: JjPrecommit,
  path: string,
  rev = context.rev,
): Buffer {
  return jjRead(
    ["file", "show", "-r", rev, "--", `root-file:${JSON.stringify(path)}`],
    context.root,
  );
}

// Collection gates need the candidate tree: BASE with only selected paths from REV overlaid.
export function jjCandidate(context: JjPrecommit): Map<string, string> {
  const entries = new Map(
    jjFiles(context.base, context.root)
      .filter((path) => !selected(context.paths, path))
      .map((path) => [path, context.base]),
  );
  for (const path of jjFiles(context.rev, context.root)) {
    if (selected(context.paths, path)) entries.set(path, context.rev);
  }
  return entries;
}

export function jjExport(
  context: JjPrecommit,
  destination: string,
  entries: ReadonlyMap<string, string>,
): void {
  const executable = new Map(
    [...new Set(entries.values())].map((rev) => [
      rev,
      new Set(
        jjRead(
          ["file", "list", "-r", rev, "-T", 'if(executable, path ++ "\\0")'],
          context.root,
        )
          .toString()
          .split("\0"),
      ),
    ]),
  );
  for (const [path, rev] of entries) {
    if (!validPath(path)) fatal(`unsafe snapshot path: ${path}`);
    const target = join(destination, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, jjContent(context, path, rev));
    // Snapshot executability is needed by the Bun script floor, independent of the worktree.
    if (executable.get(rev)?.has(path) === true) chmodSync(target, 0o755);
  }
}
