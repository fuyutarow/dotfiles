// Repository-local ticket creation and inventory. No model or network calls.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { parseTicket, resourceKind } from "./ticket.ts";

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

export function newTicket(
  root: string,
  name: string,
  labels: string[],
  date = Temporal.Now.plainDateISO().toString(),
): string | Error {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(name))
    return new Error(
      "ticket name must contain only letters, numbers, underscores or hyphens",
    );
  const home = join(root, ".agents", "tickets");
  const stamp = date.replaceAll("-", "").slice(2);
  const path = join(home, `${stamp}-${name}.md`);
  mkdirSync(home, { recursive: true });
  if (existsSync(path)) return new Error(`ticket already exists: ${path}`);
  const text = [
    "+++",
    "schema = 2",
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

export interface TicketRun {
  run_id?: string | undefined;
  brief?: { path: string; sha256?: string | undefined } | undefined;
  cwd?: string | undefined;
  worker?: { outcome?: string | undefined } | undefined;
}

export function listTickets(root: string, runs: TicketRun[]): object[] {
  const home = join(root, ".agents", "tickets");
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
        (run) =>
          run.brief?.path === path ||
          (run.brief?.sha256 === hash && run.cwd === root),
      );
      return {
        name: name.slice(0, -3),
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
