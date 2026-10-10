// Repository-local ticket creation and inventory. No model or network calls.
import {
  existsSync,
  copyFileSync,
  constants,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { dispatchStateDir } from "../../shared/src/dispatch-state.ts";
import { attempt } from "../../shared/src/attempt.ts";
import { parseTicket, resourceKind, ticketFields } from "./ticket.ts";
import { z } from "../../shared/src/zod.ts";

export function ticketRoot(cwd: string): string | undefined {
  for (const cmd of [
    ["jj", "--ignore-working-copy", "root"],
    ["git", "rev-parse", "--show-toplevel"],
  ]) {
    if (Bun.which(cmd[0] ?? "") === null) continue;
    const result = Bun.spawnSync(cmd, {
      cwd: resolve(cwd),
      stdout: "pipe",
      stderr: "ignore",
      timeout: 5000,
    });
    if (result.exitCode === 0 && result.stdout.toString().trim() !== "")
      return resolve(result.stdout.toString().trim());
  }
  return undefined;
}

/** Ticket storage is a coordinator concern, so it can live outside a worker's write scope.
 * CLI `--home` wins, then the process override, then the closest repository declaration. */
const expandTicketHome = (value: string): string => {
  if (value === "~" || value.startsWith("~/"))
    return join(process.env.HOME ?? "", value.slice(2));
  return value;
};

const configTicketHome = (path: string): string | undefined => {
  if (!existsSync(path)) return undefined;
  return /^\s*ticket_home\s*=\s*["']([^"']+)["']\s*$/mu.exec(
    readFileSync(path, "utf8"),
  )?.[1];
};

const resolvedTicketHome = (value: string, base?: string): string => {
  const expanded = expandTicketHome(value);
  if (isAbsolute(expanded) || base === undefined) return resolve(expanded);
  return resolve(join(base, expanded));
};

export function ticketHome(
  root: string,
  cwd: string,
  explicit?: string,
  project?: string,
): string | Error {
  const selected = selectTicketHome(root, cwd, explicit, project);
  return selected instanceof Error ? selected : selected.path;
}

export function selectTicketHome(
  root: string,
  cwd: string,
  explicit?: string,
  project = basename(resolve(root)),
): { path: string; rule: string } | Error {
  if (
    project.trim() === "" ||
    /[/\\\0]/u.test(project) ||
    project === "." ||
    project === ".."
  )
    return new Error("invalid project: use one directory name");
  const stateHome = join(dispatchStateDir(), "tickets", project);
  if (explicit?.trim() === "state")
    return { path: stateHome, rule: "--home state" };
  for (const [value, rule] of [
    [explicit, "--home"],
    [process.env.AGX_TICKET_HOME, "AGX_TICKET_HOME"],
  ])
    if (value !== undefined && value.trim() !== "")
      return { path: resolvedTicketHome(value.trim()), rule: rule ?? "--home" };
  let at = resolve(cwd);
  const resolvedRoot = resolve(root);
  while (at === resolvedRoot || at.startsWith(`${resolvedRoot}/`)) {
    const value = configTicketHome(join(at, ".agx.toml"));
    if (value !== undefined)
      return {
        path: resolvedTicketHome(value, at),
        rule: ".agx.toml ticket_home",
      };
    if (at === resolvedRoot) break;
    at = dirname(at);
  }
  const local = join(resolvedRoot, ".agents", "tickets");
  return existsSync(local)
    ? { path: local, rule: "repo .agents/tickets" }
    : { path: stateHome, rule: "state fallback" };
}

const ticketFileIdentity = (name: string): string =>
  name.replace(/^\d{6}-/u, "");

function ticketImportId(home: string, name: string): string {
  const fields = z
    .object({ name: z.string().optional(), id: z.string().optional() })
    .safeParse(ticketFields(readFileSync(join(home, name), "utf8"))).data;
  return fields?.name ?? fields?.id ?? ticketFileIdentity(name);
}

/** Copy bytes verbatim; exclusive copies refuse collisions, including a concurrent importer. */
export async function importTickets(
  source: string,
  home: string,
  date = Temporal.Now.plainDateISO().toString(),
  onImported?: (source: string, destination: string) => void,
): Promise<{ imported: number; skipped_collision: number } | Error> {
  const result = await attempt(async () => {
    const files = readdirSync(source, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .toSorted((a, b) => a.name.localeCompare(b.name));
    mkdirSync(home, { recursive: true });
    let imported = 0;
    let skipped_collision = 0;
    const names = new Set(
      readdirSync(home)
        .filter((name) => name.endsWith(".md"))
        .map((name) => ticketFileIdentity(name)),
    );
    const ids = new Set(
      readdirSync(home)
        .filter((name) => name.endsWith(".md"))
        .map((name) => ticketImportId(home, name)),
    );
    for (const entry of files) {
      const stamp = date.replaceAll("-", "").slice(2);
      const name = /^\d{6}-.+\.md$/u.test(entry.name)
        ? entry.name
        : `${stamp}-${entry.name}`;
      const target = join(home, name);
      const id = ticketImportId(source, entry.name);
      if (names.has(ticketFileIdentity(name)) || ids.has(id)) {
        skipped_collision++;
        continue;
      }
      const copied = await attempt(() => {
        copyFileSync(join(source, entry.name), target, constants.COPYFILE_EXCL);
      });
      if (copied.ok) {
        imported++;
        names.add(ticketFileIdentity(name));
        ids.add(id);
        onImported?.(resolve(source, entry.name), resolve(target));
      } else if (existsSync(target)) skipped_collision++;
      else
        return new Error(
          `cannot import ${entry.name}: ${String(copied.error)}`,
        );
    }
    return { imported, skipped_collision };
  });
  return result.ok
    ? result.value
    : new Error(`cannot import tickets: ${String(result.error)}`);
}

export function ticketPath(home: string, name: string): string | Error {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(name))
    return new Error(
      "ticket name must contain only letters, numbers, underscores or hyphens",
    );
  if (!existsSync(home)) return new Error(`no ticket home: ${home}`);
  const matches = readdirSync(home)
    .filter((file) => file.endsWith(".md"))
    .map((file) => join(home, file))
    .filter((path) => {
      const parsed = parseTicket(readFileSync(path, "utf8"));
      return (
        (parsed.kind === "ticket" && parsed.ticket.name === name) ||
        path.endsWith(`-${name}.md`)
      );
    });
  if (matches.length === 1)
    return matches[0] ?? new Error(`no ticket named ${name} in ${home}`);
  if (matches.length === 0)
    return new Error(`no ticket named ${name} in ${home}`);
  return new Error(`ticket name ${name} is ambiguous in ${home}`);
}

export function newTicketAtHome(
  home: string,
  name: string,
  labels: string[],
  date = Temporal.Now.plainDateISO().toString(),
): string | Error {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(name))
    return new Error(
      "ticket name must contain only letters, numbers, underscores or hyphens",
    );
  const stamp = date.replaceAll("-", "").slice(2);
  const path = join(home, `${stamp}-${name}.md`);
  mkdirSync(home, { recursive: true });
  if (existsSync(path)) return new Error(`ticket already exists: ${path}`);
  const text = [
    "+++",
    "schema = 2",
    `name = ${JSON.stringify(name)}`,
    'outcome = "<checkable result>"',
    'consumer = "<who uses the result>"',
    'writes = [] # Example: ["tools/agx/**"]',
    'first_return = "<useful interim artifact>"',
    "first_return_s = 360",
    'verify = ["<foreground verification command>"] # Example: ["bun test tools/agx"]',
    "# read_only_diagnostic = true # Alternative to verify for a read-only diagnostic",
    "timeout_s = 600 # Above 600 also requires timeout_reason",
    'premises = [] # Example: ["file:tools/agx/src/ticket.ts"]',
    `labels = ${JSON.stringify(labels)}`,
    "+++",
    "",
    "RESOURCE-CLASS(NONCOMPUTE): <why no numerical experiment or resident service is needed>",
    "# Compute alternative: RESOURCE-ENVELOPE(/absolute/path.json): agent-resource-run only",
    "",
    "<Describe the task, acceptance criteria, and RETURN conditions.>",
    "",
  ].join("\n");
  writeFileSync(path, text, { flag: "wx" });
  return path;
}

/** Compatibility API for callers that use the repository default home. */
export function newTicket(
  root: string,
  name: string,
  labels: string[],
  date = Temporal.Now.plainDateISO().toString(),
): string | Error {
  return newTicketAtHome(join(root, ".agents", "tickets"), name, labels, date);
}

/** Append-only ticket history: prior instructions remain evidence and the id never changes. */
export function amendTicket(
  path: string,
  amendment: string,
  at = Temporal.Now.instant().toString(),
): void | Error {
  if (!existsSync(path)) return new Error(`no such ticket: ${path}`);
  if (amendment.trim() === "") return new Error("amendment file is empty");
  writeFileSync(
    path,
    `${readFileSync(path, "utf8").trimEnd()}\n\n## AMEND ${at}\n\n${amendment.trimEnd()}\n`,
  );
}

export interface TicketRun {
  run_id?: string | undefined;
  brief?: { path: string; sha256?: string | undefined } | undefined;
  cwd?: string | undefined;
  worker?: { outcome?: string | undefined } | undefined;
}

export function listTicketsAtHome(home: string, runs: TicketRun[]): object[] {
  if (!existsSync(home)) return [];
  return readdirSync(home)
    .filter((name) => name.endsWith(".md"))
    .toSorted()
    .map((name) => {
      const path = join(home, name);
      const text = readFileSync(path, "utf8");
      const parsed = parseTicket(text);
      const hash = createHash("sha256").update(text).digest("hex");
      const last = runs.findLast(
        (run) => run.brief?.path === path || run.brief?.sha256 === hash,
      );
      return {
        name:
          parsed.kind === "ticket" && parsed.ticket.name !== undefined
            ? parsed.ticket.name
            : name.slice(0, -3),
        path,
        kind:
          resourceKind(parsed.kind === "invalid" ? text : parsed.prose) ?? null,
        labels: parsed.kind === "ticket" ? parsed.ticket.labels : [],
        last_run_id: last?.run_id ?? null,
        outcome: last?.worker?.outcome ?? "unrun",
        error: parsed.kind === "invalid" ? parsed.reason : undefined,
      };
    });
}

/** Compatibility API for the conventional repository ticket home. */
export function listTickets(root: string, runs: TicketRun[]): object[] {
  return listTicketsAtHome(join(root, ".agents", "tickets"), runs);
}
