// One physical-line ratchet shared by the hook and commit gate.
import { basename, extname, normalize, resolve } from "node:path";
import { effective, parseShell, type ShellCommand } from "./shell-syntax.ts";

export const SHELL_LIMIT = 12;
export function shellRemedy(limit = SHELL_LIMIT): string {
  return (
    `Write the logic as one .ts file run by bun. A shell file is allowed only as a thin shim ` +
    `that execs it (at most ${limit} physical lines). Splitting a script into several shell ` +
    `files is not a fix.`
  );
}

const VENDORED = /^#\s*(?:installed|managed) by herdr\b/mu;
const BOOTSTRAP = /^#\s*shim:\s*bootstrap\b/mu;

export function shellFile(path: string, content = ""): boolean {
  const normalized = normalize(path);
  if (
    normalized.split("/").includes("zsh") ||
    extname(path) === ".zsh" ||
    /^\.?(?:zshrc|zprofile|zshenv)(?:\..+)?$/u.test(basename(path))
  )
    return false;
  return (
    /\.(?:sh|bash)$/u.test(path) ||
    /^#!\s*(?:\S*\/)?(?:sh|bash|dash|ksh|zsh)(?:\s|$)/u.test(content) ||
    /^#!\s*\S*\/env\s+(?:-\S+\s+)*(?:sh|bash|dash|ksh|zsh)(?:\s|$)/u.test(
      content,
    )
  );
}

export function physicalLines(content: string): number {
  if (content === "") return 0;
  return content.split("\n").length - (content.endsWith("\n") ? 1 : 0);
}

export function shellExempt(before: string | null, after = ""): boolean {
  return (
    VENDORED.test(after) ||
    (before !== null && (VENDORED.test(before) || BOOTSTRAP.test(before)))
  );
}

export function shellGrowth(
  path: string,
  before: string | null,
  after: string,
  limit = SHELL_LIMIT,
): boolean {
  return (
    (shellFile(path, after) || (before !== null && shellFile(path, before))) &&
    !shellExempt(before, after) &&
    physicalLines(after) > limit &&
    (before === null || physicalLines(after) > physicalLines(before))
  );
}

type Write = { path: string; append: boolean; content: string | undefined };
type Env = Readonly<Record<string, string | undefined>>;

const PARAMETER = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/gu;

/**
 * A redirect target with its plain `$NAME` / `${NAME}` references replaced from `env`, the
 * environment the Bash tool's shell inherits (for example a worker's `$AGX_RUN_DIR`). A reference
 * to an unset or empty variable is left as written, so the caller still refuses it.
 */
function expandTarget(target: string, env: Env): string {
  return target.replaceAll(
    PARAMETER,
    (whole, braced: string | undefined, bare: string | undefined) => {
      const value = env[braced ?? bare ?? ""];
      return value === undefined || value === "" ? whole : value;
    },
  );
}

// Only a literal cat/tee heredoc has known output. Never execute a producer to measure it.
function literalInput(c: ShellCommand): string | undefined {
  const eff = effective(c);
  if (
    eff === undefined ||
    !["cat", "tee"].includes(eff.name) ||
    c.dynamic ||
    c.sep === "|" ||
    c.heredocs.length !== 1 ||
    c.redirects.some((r) => r.op.includes("<")) ||
    (eff.name === "cat" && eff.args.length > 0)
  )
    return undefined;
  const body = c.heredocs[0];
  // The parser deliberately does not evaluate parameter expansions or heredoc escapes.
  if (
    body === undefined ||
    (c.heredocQuoted?.[0] !== true && /[$`\\]/u.test(body))
  )
    return undefined;
  return c.heredocContents?.[0];
}

function teeWrites(
  args: string[],
  cwd: string,
  content: string | undefined,
  env: Env,
): Write[] {
  const result: Write[] = [];
  let operands = false;
  for (const arg of args) {
    if (!operands && arg === "--") {
      operands = true;
      continue;
    }
    if (!operands && arg.startsWith("-")) continue;
    result.push({
      path: resolve(cwd, expandTarget(arg, env)),
      append: args.includes("-a") || args.includes("--append"),
      content,
    });
  }
  return result;
}

function writes(c: ShellCommand, env: Env): Write[] {
  const content = literalInput(c);
  const result = c.redirects
    .filter((r) => r.op.includes(">") || r.op === "<>")
    .filter((r) => !(r.op.endsWith("&") && /^(?:\d+|-)$/u.test(r.target)))
    .map((r) => ({
      path: resolve(c.cwd, expandTarget(r.target, env)),
      append: r.op.includes(">>"),
      content,
    }));
  const eff = effective(c);
  if (eff?.name === "tee")
    result.push(...teeWrites(eff.args, c.cwd, content, env));
  return result;
}

/**
 * Returns the first unsafe write. Unknown output or control flow fails closed. A write target
 * may name variables that are set in `env` (the environment the Bash tool inherits); any other
 * expansion, glob or substitution in a target is unknown and refused.
 */
export async function bashShellViolation(
  command: string,
  cwd: string,
  read: (path: string) => Promise<string | null>,
  limit = SHELL_LIMIT,
  env: Env = process.env,
): Promise<string | undefined> {
  const deny = (reason: string) => `${reason}. ${shellRemedy(limit)}`;
  const parsed = parseShell(command, cwd);
  if (parsed === undefined) {
    return /[<>]|\btee\b/u.test(command)
      ? deny(
          "cannot determine shell write targets from unsupported Bash syntax",
        )
      : undefined;
  }
  const state = new Map<string, string>();
  const controlled = parsed.commands.some(
    (c) => c.leading.length > 0 || c.header,
  );
  for (const w of parsed.commands.flatMap((c) => writes(c, env))) {
    if (/[$`*?{}~]|\(…\)/u.test(w.path))
      return deny(`cannot determine write target ${w.path}`);
    const before = state.get(w.path) ?? (await read(w.path));
    if (!shellFile(w.path, before ?? "")) continue;
    if (shellExempt(before)) continue;
    if (controlled || w.content === undefined)
      return deny(`cannot determine final size of ${w.path}`);
    const after = (w.append ? (before ?? "") : "") + w.content;
    if (shellGrowth(w.path, before, after, limit))
      return deny(
        `${w.path} would be ${physicalLines(after)} lines (limit ${limit})`,
      );
    state.set(w.path, after);
  }
  return undefined;
}
