import { lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { effective, parseShell, type ShellCommand } from "./shell-syntax.ts";
import { z } from "./zod.ts";

export type TicketWrite = { path: string; content: string };

export function isAgxTicket(text: string): boolean {
  const lines = text.split("\n");
  if (lines[0]?.replace(/\r$/u, "") !== "+++") return false;
  const end = lines.findIndex(
    (line, index) => index > 0 && line.replace(/\r$/u, "") === "+++",
  );
  if (end < 0) return false;
  const frontMatter = lines.slice(1, end).join("\n");
  return (
    /^\s*name\s*=/mu.test(frontMatter) && /^\s*outcome\s*=/mu.test(frontMatter)
  );
}

function homePath(value: string, root: string): string {
  let expanded = value;
  if (value === "~") expanded = homedir();
  else if (value.startsWith("~/")) expanded = join(homedir(), value.slice(2));
  return isAbsolute(expanded) ? resolve(expanded) : resolve(root, expanded);
}

function shellPath(value: string, cwd: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return resolve(homedir(), value.slice(2));
  return resolve(cwd, value);
}

async function exists(path: string): Promise<boolean> {
  return Promise.try(() => lstat(path)).then(
    () => true,
    () => false,
  );
}

async function isDirectory(path: string): Promise<boolean> {
  return Promise.try(() => lstat(path)).then(
    (stat) => stat.isDirectory(),
    () => false,
  );
}

export async function repoRootFor(path: string): Promise<string | undefined> {
  let cursor = resolve(path);
  if (!(await isDirectory(cursor))) cursor = dirname(cursor);
  for (;;) {
    if (
      (await exists(join(cursor, ".jj"))) ||
      (await exists(join(cursor, ".git")))
    )
      return cursor;
    const parent = dirname(cursor);
    if (parent === cursor) return undefined;
    cursor = parent;
  }
}

async function configuredHome(root: string): Promise<string> {
  const config = Bun.file(join(root, ".agx.toml"));
  if (!(await config.exists())) return join(root, ".agents", "tickets");
  const text = await config.text();
  const row = await Promise.try(() => Bun.TOML.parse(text)).then(
    (value) => value,
    () => null,
  );
  const values = z.record(z.string(), z.unknown()).safeParse(row);
  if (!values.success || typeof values.data.tickets !== "string")
    return join(root, ".agents", "tickets");
  return homePath(values.data.tickets, root);
}

function under(path: string, directory: string): boolean {
  const fromHome = relative(resolve(directory), resolve(path));
  return (
    fromHome !== "" &&
    fromHome !== ".." &&
    !fromHome.startsWith(`..${sep}`) &&
    !isAbsolute(fromHome)
  );
}

export async function ticketHomeViolation(
  target: string,
  cwd: string,
): Promise<string | undefined> {
  const absolute = resolve(cwd, target);
  const owner =
    (await repoRootFor(dirname(absolute))) ?? (await repoRootFor(cwd));
  if (owner === undefined)
    return `cannot determine the owning repository for ${absolute}`;
  const expected = await configuredHome(owner);
  return under(absolute, expected)
    ? undefined
    : `${absolute} is outside the ticket home; expected ${expected}; create tickets with \`tkt new <slug> --repo ${owner}\``;
}

function heredocOutput(command: ShellCommand): string | undefined {
  const call = effective(command);
  if (call === undefined || command.dynamic || command.heredocs.length !== 1)
    return undefined;
  if (call.name === "cat" && call.args.length === 0) {
    if (
      command.heredocQuoted?.[0] !== true &&
      /[$`\\]/u.test(command.heredocs[0] ?? "")
    )
      return undefined;
    return command.heredocContents?.[0];
  }
  if (call.name === "tee") {
    if (
      command.heredocQuoted?.[0] !== true &&
      /[$`\\]/u.test(command.heredocs[0] ?? "")
    )
      return undefined;
    return command.heredocContents?.[0];
  }
  return undefined;
}

export function bashTicketWrites(
  command: string,
  cwd: string,
): TicketWrite[] | undefined {
  const parsed = parseShell(command, cwd);
  if (parsed === undefined)
    return /(?:>|\btee\b)/u.test(command) ? undefined : [];
  const writes: TicketWrite[] = [];
  for (const item of parsed.commands) {
    const content = heredocOutput(item);
    if (content === undefined || !isAgxTicket(content)) continue;
    writes.push(...redirectWrites(item, content), ...teeWrites(item, content));
  }
  return writes;
}

function redirectWrites(item: ShellCommand, content: string): TicketWrite[] {
  const writes: TicketWrite[] = [];
  for (const redirect of item.redirects) {
    if (
      !/[>]/u.test(redirect.op) ||
      redirect.op.endsWith("&") ||
      redirect.target === ""
    )
      continue;
    writes.push({ path: shellPath(redirect.target, item.cwd), content });
  }
  return writes;
}

function teeWrites(item: ShellCommand, content: string): TicketWrite[] {
  const call = effective(item);
  if (call?.name !== "tee") return [];
  const paths: string[] = [];
  let operands = false;
  for (const arg of call.args) {
    if (!operands && arg === "--") {
      operands = true;
      continue;
    }
    if (!operands && arg.startsWith("-")) continue;
    paths.push(arg);
  }
  return paths.map((path) => ({ path: shellPath(path, item.cwd), content }));
}
