#!/usr/bin/env bun
// Shared J1 snapshot interface for commit-gate consumers. No Git index is involved.
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
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

export async function jjRead(
  args: string[],
  root = process.cwd(),
): Promise<Buffer> {
  const child = Bun.spawn(["jj", "--ignore-working-copy", ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) fatal(`jj ${args[0]} failed: ${stderr.trim()}`);
  return Buffer.from(stdout);
}

export async function jjContext(): Promise<JjPrecommit | undefined> {
  const vcs = process.env["PRECOMMIT_VCS"];
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
  const text = await readFile(file, "utf8");
  if (!text.endsWith("\0"))
    fatal("PRECOMMIT_PATHS_FILE must be NUL-terminated");
  const paths = text.slice(0, -1).split("\0");
  if (!paths.every((path) => validPath(path)))
    fatal("invalid repo-relative selected path");
  const root = (await jjRead(["root"])).toString().trim();
  return { root, rev, base, paths };
}

export async function jjFiles(rev: string, root: string): Promise<string[]> {
  return (
    await jjRead(["file", "list", "-r", rev, "-T", 'path ++ "\\0"'], root)
  )
    .toString()
    .split("\0")
    .filter((path) => path !== "");
}

export async function jjChanged(context: JjPrecommit): Promise<string[]> {
  const args = ["diff", "--from", context.base, "--to", context.rev];
  // The agreed enumeration. The template form also preserves embedded newlines in paths.
  await jjRead([...args, "--name-only"], context.root);
  const changed = (await jjRead([...args, "-T", 'path ++ "\\0"'], context.root))
    .toString()
    .split("\0")
    .filter((path) => path !== "" && selected(context.paths, path));
  // A rename's --name-only entry is its destination; include selected deleted sources too.
  const present = new Set(await jjFiles(context.rev, context.root));
  const baseFiles = await jjFiles(context.base, context.root);
  return [
    ...new Set([
      ...changed,
      ...baseFiles.filter(
        (path) => !present.has(path) && selected(context.paths, path),
      ),
    ]),
  ];
}

export async function jjContent(
  context: JjPrecommit,
  path: string,
  rev = context.rev,
): Promise<Buffer> {
  return jjRead(
    ["file", "show", "-r", rev, "--", `root-file:${JSON.stringify(path)}`],
    context.root,
  );
}

// Collection gates need the candidate tree: BASE with only selected paths from REV overlaid.
export async function jjCandidate(
  context: JjPrecommit,
): Promise<Map<string, string>> {
  const entries = new Map(
    (await jjFiles(context.base, context.root))
      .filter((path) => !selected(context.paths, path))
      .map((path) => [path, context.base]),
  );
  for (const path of await jjFiles(context.rev, context.root)) {
    if (selected(context.paths, path)) entries.set(path, context.rev);
  }
  return entries;
}

/** The paths of `rev` for which `template` (a jj boolean over a tree entry) holds. */
async function jjPathsWhere(
  root: string,
  rev: string,
  template: string,
): Promise<Set<string>> {
  const out = await jjRead(
    ["file", "list", "-r", rev, "-T", `if(${template}, path ++ "\\0")`],
    root,
  );
  return new Set(out.toString().split("\0"));
}

export async function jjExport(
  context: JjPrecommit,
  destination: string,
  entries: ReadonlyMap<string, string>,
): Promise<void> {
  for (const path of entries.keys())
    if (!validPath(path)) fatal(`unsafe snapshot path: ${path}`);
  const revs = [...new Set(entries.values())];
  const executable = new Map<string, Set<string>>();
  // Only regular files are read in bulk: for a symlink `jj file show` prints nothing, and the
  // per-file read below keeps that answer.
  const files = new Map<string, Set<string>>();
  for (const rev of revs) {
    executable.set(rev, await jjPathsWhere(context.root, rev, "executable"));
    files.set(
      rev,
      await jjPathsWhere(context.root, rev, 'file_type == "file"'),
    );
  }
  const regular = new Map(
    [...entries].filter(([path, rev]) => files.get(rev)?.has(path) === true),
  );
  // A few jj processes read every file; one `jj file show` per file took minutes on a tree of
  // a few thousand files and was the commit gate's largest cost.
  const bulk = await jjBlobs(context.root, revs, regular);
  for (const [path, rev] of entries) {
    const target = join(destination, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(
      target,
      bulk?.get(path) ?? (await jjContent(context, path, rev)),
    );
    // Snapshot executability is needed by the Bun script floor, independent of the worktree.
    if (executable.get(rev)?.has(path) === true) await chmod(target, 0o755);
  }
}

/** Paths per `jj file show` call: bounds the argument list on any tree size. */
const SHOW_BATCH = 400;

/**
 * Splits one `jj file show -T '<token> ++ path ++ "\0"'` stream into path -> bytes, or undefined
 * when the stream does not start with the token or a path is unterminated.
 */
function splitShown(
  out: Buffer,
  mark: Buffer,
): Map<string, Buffer> | undefined {
  const shown = new Map<string, Buffer>();
  let offset = out.indexOf(mark);
  if (offset !== 0) return out.length === 0 ? shown : undefined;
  while (offset >= 0) {
    const nameStart = offset + mark.length;
    const nameEnd = out.indexOf(0, nameStart);
    if (nameEnd < 0) return undefined;
    const next = out.indexOf(mark, nameEnd + 1);
    shown.set(
      out.toString("utf8", nameStart, nameEnd),
      out.subarray(nameEnd + 1, next < 0 ? out.length : next),
    );
    offset = next;
  }
  return shown;
}

/**
 * Every entry's bytes from a few `jj file show` calls instead of one per file, or undefined when
 * an answer does not name exactly the requested paths (the caller then reads per file). The
 * template prints a random token and the path before each file's bytes, so the stream splits
 * without knowing sizes; a file containing a 128-bit random token is not a case to handle.
 */
async function jjBlobs(
  root: string,
  revs: readonly string[],
  entries: ReadonlyMap<string, string>,
): Promise<Map<string, Buffer> | undefined> {
  const token = `<<jj-export-${crypto.randomUUID()}>>`;
  const mark = Buffer.from(token);
  const batches = revs.flatMap((rev) => {
    const paths = [...entries].flatMap(([path, at]) =>
      at === rev ? [path] : [],
    );
    return Array.from(
      { length: Math.ceil(paths.length / SHOW_BATCH) },
      (_, index) => ({
        rev,
        paths: paths.slice(index * SHOW_BATCH, (index + 1) * SHOW_BATCH),
      }),
    );
  });
  const blobs = new Map<string, Buffer>();
  for (const { rev, paths } of batches) {
    const out = await jjRead(
      [
        "file",
        "show",
        "-r",
        rev,
        "-T",
        `${JSON.stringify(token)} ++ path ++ "\\0"`,
        "--",
        ...paths.map((path) => `root-file:${JSON.stringify(path)}`),
      ],
      root,
    );
    const shown = splitShown(out, mark);
    if (shown === undefined || !paths.every((path) => shown.has(path)))
      return undefined;
    for (const [path, bytes] of shown) blobs.set(path, bytes);
  }
  return blobs;
}
