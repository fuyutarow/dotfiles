import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fromThrowable } from "../../../shared/src/zod.ts";
import { jj } from "./jj.ts";

export type Listed = { name: string; root: string | null };
/** `store` is the directory whose `.jj/repo` is the store directory. */
export type Store = {
  store: string;
  listed: Listed[] | null;
  error: string | null;
};
export type Found = { stores: string[]; workspaces: string[] };
type ByteCursor = { at: number };

function nextVarint(bytes: Buffer, cursor: ByteCursor): number | null {
  let value = 0;
  for (let shift = 0; ; shift += 7) {
    const byte = bytes[cursor.at++];
    if (byte === undefined) return null;
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return value;
  }
}

function readWorkspaceEntry(
  bytes: Buffer,
  cursor: ByteCursor,
  end: number,
): { name: string | null; path: string | null } | null {
  let name: string | null = null;
  let path: string | null = null;
  while (cursor.at < end) {
    const tag = nextVarint(bytes, cursor);
    const length = nextVarint(bytes, cursor);
    if (tag === null || length === null || cursor.at + length > end)
      return null;
    const text = bytes.subarray(cursor.at, cursor.at + length).toString("utf8");
    cursor.at += length;
    if (tag === 0x0a) name = text;
    if (tag === 0x12) path = text;
  }
  return { name, path };
}

const MAX_DEPTH = 6;
const SKIP = new Set([
  ".git",
  ".jj",
  "node_modules",
  "target",
  ".venv",
  ".cache",
]);

const real = (path: string): string => {
  return fromThrowable(() => realpathSync(path))().unwrapOr(resolve(path));
};

/** Roots may end in a `*` segment (`~/Workspace/*`); expand it one level, keep only directories. */
export function expandRoot(pattern: string): string[] {
  if (!pattern.includes("*")) return [pattern];
  const parts = pattern.split("/");
  const at = parts.findIndex((p) => p.includes("*"));
  const base = parts.slice(0, at).join("/");
  const globBase = base.length > 0 ? base : "/";
  const rest = parts.slice(at).join("/");
  const paths = fromThrowable(() => [
    ...new Bun.Glob(rest).scanSync({
      cwd: globBase,
      onlyFiles: false,
      absolute: true,
    }),
  ])().unwrapOr([]);
  return paths.filter((path) =>
    fromThrowable(() => lstatSync(path).isDirectory())().unwrapOr(false),
  );
}

const jjKind = (dir: string): "store" | "workspace" | null => {
  return fromThrowable(() => lstatSync(join(dir, ".jj", "repo")))()
    .map((stat) => {
      if (stat.isDirectory()) return "store";
      if (stat.isFile()) return "workspace";
      return null;
    })
    .unwrapOr(null);
};

/** Walk roots to depth 6 for `.jj/repo`: a directory is a store holder, a FILE is a secondary workspace. */
export function walkRoots(roots: string[]): Found {
  const stores = new Set<string>();
  const workspaces = new Set<string>();
  const seen = new Set<string>();
  const visit = (dir: string, depth: number) => {
    const key = real(dir);
    if (seen.has(key)) return;
    seen.add(key);
    const kind = jjKind(dir);
    if (kind === "store") stores.add(key);
    if (kind === "workspace") workspaces.add(key);
    if (depth >= MAX_DEPTH) return;
    const entries = fromThrowable(() =>
      readdirSync(dir, { withFileTypes: true }),
    )();
    if (entries.isErr()) return;
    for (const entry of entries.value) {
      if (!entry.isDirectory() || SKIP.has(entry.name)) continue;
      visit(join(dir, entry.name), depth + 1);
    }
  };
  for (const root of roots.flatMap((pattern) => expandRoot(pattern)))
    visit(root, 0);
  return { stores: [...stores], workspaces: [...workspaces] };
}

/** The store a secondary workspace points at: `.jj/repo` holds a path relative to `.jj/`. */
export function storeOf(workspace: string): string | null {
  return fromThrowable(() => {
    const target = resolve(
      join(workspace, ".jj"),
      readFileSync(join(workspace, ".jj", "repo"), "utf8").trim(),
    );
    return lstatSync(target).isDirectory()
      ? dirname(dirname(real(target)))
      : null;
  })().unwrapOr(null);
}

/**
 * jj prints an empty `root` when the directory is gone (it cannot canonicalize the path). The
 * path is still recorded in `.jj/repo/workspace_store/index`, a tiny protobuf of
 * `{name, path-relative-to-.jj/repo}` entries; read it to learn WHERE the missing directory was.
 */
export function recordedRoot(store: string, name: string): string | null {
  const base = join(store, ".jj", "repo");
  const result = fromThrowable(() =>
    readFileSync(join(base, "workspace_store", "index")),
  )();
  if (result.isErr()) return null;
  const bytes = result.value;
  const cursor: ByteCursor = { at: 0 };
  while (cursor.at < bytes.length) {
    if (nextVarint(bytes, cursor) !== 0x0a) return null;
    const length = nextVarint(bytes, cursor);
    if (length === null) return null;
    const end = length + cursor.at;
    const entry = readWorkspaceEntry(bytes, cursor, end);
    if (entry === null) return null;
    if (entry.name === name && entry.path !== null)
      return resolve(base, entry.path);
  }
  return null;
}

/** Parse `name\troot` lines; with the default-output fallback, roots come from `workspace root --name`. */
export function listWorkspaces(store: string): Store {
  const templated = jj([
    "-R",
    store,
    "--ignore-working-copy",
    "workspace",
    "list",
    "-T",
    'name ++ "\\t" ++ root ++ "\\n"',
  ]);
  if (templated.ok) {
    const listed = templated.stdout
      .split("\n")
      .filter((line) => line.includes("\t"))
      .map((line): Listed => {
        const [name = "", root = ""] = line.split("\t");
        return {
          name,
          root: root === "" ? recordedRoot(store, name) : real(root),
        };
      });
    return { store, listed, error: null };
  }
  const plain = jj(["-R", store, "--ignore-working-copy", "workspace", "list"]);
  if (!plain.ok)
    return {
      store,
      listed: null,
      error: `${templated.stderr.trim()} | ${plain.stderr.trim()}`,
    };
  const listed = plain.stdout
    .split("\n")
    .flatMap((line) => {
      const name = /^([^:\s]+): /u.exec(line)?.[1];
      return name === undefined ? [] : [name];
    })
    .map((name): Listed => {
      const root = jj([
        "-R",
        store,
        "--ignore-working-copy",
        "workspace",
        "root",
        "--name",
        name,
      ]);
      return { name, root: root.ok ? real(root.stdout.trim()) : null };
    });
  return { store, listed, error: null };
}
