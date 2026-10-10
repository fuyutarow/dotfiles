// Shared, non-executing path resolution for coordinator reads. Unknown expansions retain their
// spelling: only an explicit coordinator-location prefix can exempt them from repository search.
import { realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { ShellCommand } from "./shell-syntax.ts";

export function insidePath(path: string, root: string): boolean {
  const rel = relative(root, path);
  return (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(`..${sep}`) && !rel.startsWith(sep))
  );
}

/** Resolve existing ancestors as well as existing files, so symlinks cannot hide repo targets. */
export function physicalPath(path: string): string {
  let parent = resolve(path);
  const suffix: string[] = [];
  while (statSync(parent, { throwIfNoEntry: false }) === undefined) {
    const next = dirname(parent);
    if (next === parent) return resolve(path);
    suffix.unshift(relative(next, parent));
    parent = next;
  }
  return resolve(realpathSync(parent), ...suffix);
}

/** The enclosing worktree, even when the call starts in one of its subdirectories. */
export function readRepositoryRoot(cwd: string): string {
  let dir = physicalPath(cwd);
  while (true) {
    const current = dir;
    if (
      [".git", ".jj", ".cocoindex_code/settings.yml"].some(
        (marker) =>
          statSync(join(current, marker), { throwIfNoEntry: false }) !==
          undefined,
      )
    )
      return dir;
    const parent = dirname(dir);
    if (parent === dir) return physicalPath(cwd);
    dir = parent;
  }
}

export function coordinatorPath(path: string): boolean {
  return [
    "/tmp",
    "/private/tmp",
    join(homedir(), ".local/state"),
    join(homedir(), ".claude"),
    process.env.CLAUDE_SESSION_SCRATCHPAD,
    process.env.SESSION_SCRATCHPAD,
  ].some(
    (root) =>
      root !== undefined && root !== "" && insidePath(path, physicalPath(root)),
  );
}

function environmentExpansion(
  raw: string,
  quoted: boolean,
): { text: string; width: number; resolved: boolean } {
  const match = /^\$(?:\{([A-Za-z_]\w*)\}|([A-Za-z_]\w*))/u.exec(raw);
  if (match === null) return { text: "$", width: 1, resolved: false };
  const name = match[1] ?? match[2] ?? "";
  const value = process.env[name];
  return {
    text: value ?? match[0],
    width: match[0].length,
    resolved: value !== undefined && (quoted || !/[\s*?[]/u.test(value)),
  };
}

export function readPath(
  operand: string,
  c: ShellCommand,
): { path: string; resolved: boolean } {
  const index = c.words.indexOf(operand);
  const raw = c.rawWords[index] ?? operand;
  const spellings = c.rawWords.filter((_word, i) => c.words[i] === operand);
  if (new Set(spellings).size > 1)
    return { path: physicalPath(c.cwd), resolved: false };
  let expanded = "";
  let quote = "";
  let resolved = true;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charAt(i);
    if ((ch === "'" || ch === '"') && (quote === "" || quote === ch)) {
      quote = quote === "" ? ch : "";
    } else if (ch === "\\" && quote !== "'") {
      const next = raw.charAt(++i);
      expanded +=
        quote === '"' && !'$`"\\\n'.includes(next) ? `\\${next}` : next;
    } else if (ch === "$" && quote !== "'") {
      const variable = environmentExpansion(raw.slice(i), quote === '"');
      expanded += variable.text;
      resolved = resolved && variable.resolved;
      i += variable.width - 1;
    } else {
      resolved = resolved && ch !== "`" && !(quote === "" && /[*?[]/u.test(ch));
      expanded += ch;
    }
  }
  if (raw.startsWith("~/")) expanded = join(homedir(), expanded.slice(2));
  const path = physicalPath(resolve(c.cwd, expanded));
  // Unknown expansions are only classifiable under a literal, normalized location prefix.
  if (!resolved) {
    const dynamic = expanded.search(/[$`*?[]/u);
    const prefix = expanded.slice(0, dynamic);
    const base = prefix.endsWith("/") ? prefix : dirname(prefix);
    if (
      !coordinatorPath(physicalPath(resolve(c.cwd, base))) ||
      expanded.includes("/../")
    )
      return { path: physicalPath(c.cwd), resolved: false };
  }
  return { path, resolved };
}

/** Quote an operand for a ready-to-run repair command. */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
