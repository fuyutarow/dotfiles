// Converts a caller's --path into the glob that ccc's --path consumes (SQLite GLOB semantics).
//
// - An existing directory inside the project selects every indexed file under it: `<dir>/**`;
//   the project root itself selects everything: `**`.
// - An existing file inside the project whose name contains GLOB metacharacters is a literal
//   name: its metacharacters are escaped.
// - Anything else (nonexistent path, outside the project, a plain file name, or an explicit
//   glob such as `src/*.rs`) is the caller's own pattern and passes through unchanged.
//
// realpath keeps an in-project symlink to an outside directory from accidentally widening the
// search scope. This is accidental-scope normalization, not a hostile TOCTOU security boundary:
// the filesystem may change after these checks and before ccc consumes the resulting glob.

import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fromAsyncThrowable } from "neverthrow";

// Characters that a name may contain but that SQLite GLOB would read as a pattern.
const GLOB_MAGIC = /[*?[\]{}]/u;
// SQLite GLOB escapes a literal `*`, `?` or `[` by wrapping it in a one-character class.
// `]`, `{` and `}` are literal outside a class and need no escape.
const GLOB_OPERATOR = /[*?[]/gu;

export function escapeGlobLiteral(literal: string): string {
  return literal.replace(GLOB_OPERATOR, (char) => `[${char}]`);
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export async function cccSearchPath(
  project: string,
  path: string,
): Promise<string> {
  const r = await fromAsyncThrowable(async () => {
    const projectPath = await realpath(project);
    const candidate = await realpath(resolve(projectPath, path));
    const insideProject = relative(projectPath, candidate);
    if (
      insideProject === ".." ||
      insideProject.startsWith(`..${sep}`) ||
      isAbsolute(insideProject)
    ) {
      return path;
    }
    const rel = insideProject.split(sep).join("/");
    const info = await stat(candidate);
    if (info.isDirectory()) {
      return rel === "" ? "**" : `${escapeGlobLiteral(rel)}/**`;
    }
    if (info.isFile() && GLOB_MAGIC.test(rel)) return escapeGlobLiteral(rel);
    return path;
  }, asError)();
  return r.match(
    (value) => value,
    () => path,
  );
}
