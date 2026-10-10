// The typed work ticket at the top of an agx brief: TOML front matter between `+++` lines.
// A brief that does not start with `+++` is LEGACY — it comes back untouched, so no running
// coordinator breaks. Consumers: agx (run, pick). Pure: no I/O, no state.
//
//   +++
//   schema = 1
//   writes = ["tools/agx/**"]   # globs relative to repo root; [] = read-only
//   verify = ["bun test tools/agx/tests"]
//   verify_timeout_s = 1200                  # optional; bound for all verify commands together
//   timeout_s = 3600                         # optional; worker wall clock (60..14400)
//   timeout_reason = "why this exceeds 1800 seconds" # required when timeout_s > 1800
//   capabilities = ["long-tool-loop"]        # optional; handed to Jev as required capabilities
//   budget_usd = 5.00                       # optional positive USD budget used to exclude over-budget rows
//   pick_temperature = 1.0                  # optional sampling temperature (0 <= T <= 5)
//   +++
//   <the prose the worker receives>
import { resolve } from "node:path";
import { fromThrowable, z } from "../../shared/src/zod.ts";

export const KindSchema = z.enum(["token", "compute"]);
export type Kind = z.output<typeof KindSchema>;

/** Classification comes only from the worker's resource declaration. */
export function resourceKind(prose: string): Kind | undefined {
  if (/^RESOURCE-CLASS\(NONCOMPUTE\):\s*\S[^\r\n]*$/mu.test(prose))
    return "token";
  if (/^RESOURCE-ENVELOPE\([^\r\n)]+\):\s*\S[^\r\n]*$/mu.test(prose))
    return "compute";
  return undefined;
}

export const TICKET_SCHEMA = 2;
export const DEFAULT_VERIFY_TIMEOUT_S = 1200;
export const DEFAULT_TIMEOUT_S = 600;
export const DEFAULT_FIRST_RETURN_S = 360;
export const EXTENDED_TIMEOUT_THRESHOLD_S = 600;
export const MAX_TIMEOUT_S = 14400;

const writeGlob = z
  .string()
  .min(1)
  .refine((g) => !g.startsWith("/") && !g.split("/").includes(".."), {
    message: "a write glob is relative to the repo root and stays inside it",
  });

const premise = z.string().refine(
  (value) => {
    if (value.startsWith("file:")) {
      const path = value.slice("file:".length);
      return (
        path !== "" && !path.startsWith("/") && !path.split("/").includes("..")
      );
    }
    if (value.startsWith("symbol:")) {
      const reference = value.slice("symbol:".length);
      const separator = reference.indexOf("@");
      const name = separator < 0 ? reference : reference.slice(0, separator);
      const glob = separator < 0 ? undefined : reference.slice(separator + 1);
      return (
        name !== "" &&
        (glob === undefined ||
          (glob !== "" &&
            !glob.startsWith("/") &&
            !glob.split("/").includes("..")))
      );
    }
    return false;
  },
  {
    message:
      'expected "file:<relative-path>", "symbol:<name>", or "symbol:<name>@<path-glob>"',
  },
);

const CommonTicket = {
  labels: z.array(z.string()).default([]),
  name: z
    .string()
    .min(1)
    .max(16)
    .regex(/^[A-Za-z0-9_-]+$/u)
    .optional(),
  writes: z.array(writeGlob).optional(),
  verify: z.array(z.string().trim().min(1)).default([]),
  verify_timeout_s: z.number().positive().default(DEFAULT_VERIFY_TIMEOUT_S),
  timeout_s: z.number().int().min(60).max(MAX_TIMEOUT_S).optional(),
  timeout_reason: z.string().trim().min(1).optional(),
  first_return_s: z
    .number()
    .int()
    .min(60)
    .max(360)
    .default(DEFAULT_FIRST_RETURN_S),
  budget_usd: z.number().positive().optional(),
  stall_s: z.number().int().positive().optional(),
  pick_temperature: z.number().min(0).max(5).optional(),
  capabilities: z.array(z.string().min(1)).default([]),
  premises: z.array(premise).optional(),
  outcome: z.string().trim().min(1).optional(),
  consumer: z.string().trim().min(1).optional(),
  first_return: z.string().trim().min(1).optional(),
  split_from: z.string().trim().min(1).optional(),
  urgent_reason: z.string().trim().min(1).optional(),
  read_only_diagnostic: z.boolean().optional(),
};

export const TicketSchema = z
  .strictObject({
    schema: z.union([z.literal(1), z.literal(2)]),
    ...CommonTicket,
  })
  .refine(
    (ticket) =>
      ticket.timeout_s === undefined ||
      ticket.timeout_s <= EXTENDED_TIMEOUT_THRESHOLD_S ||
      ticket.timeout_reason !== undefined,
    {
      path: ["timeout_reason"],
      message: `required when timeout_s exceeds ${EXTENDED_TIMEOUT_THRESHOLD_S} seconds`,
    },
  )
  .refine((ticket) => ticket.schema === 2 || ticket.writes !== undefined, {
    path: ["writes"],
    message: "required for schema 1 tickets",
  });
export type Ticket = z.output<typeof TicketSchema>;

export type ParsedBrief =
  | { kind: "legacy"; prose: string }
  | { kind: "ticket"; ticket: Ticket; prose: string }
  | { kind: "invalid"; reason: string };

const FENCE = "+++";
const isFence = (line: string | undefined): boolean =>
  line !== undefined && line.trimEnd() === FENCE;

const parseToml = fromThrowable(
  (text: string): unknown => Bun.TOML.parse(text),
  (e) => (e instanceof Error ? e.message : String(e)),
);

/** Raw fields allow lint to report independent floor failures even when the schema fails. */
export function ticketFields(text: string): Record<string, unknown> {
  const lines = text.split("\n");
  if (!isFence(lines[0])) return {};
  const end = lines.findIndex((line, i) => i > 0 && isFence(line));
  if (end < 0) return {};
  const parsed = parseToml(lines.slice(1, end).join("\n"));
  if (parsed.isErr()) return {};
  const fields = z.record(z.string(), z.unknown()).safeParse(parsed.value);
  return fields.success ? fields.data : {};
}

const compact = (value: string): string => value.replaceAll(/[\r\n]+/gu, " ");

/** Compact worker-facing promise; paths retain glob syntax and are rooted in the checkout. */
export function promiseBlock(
  ticket: Ticket,
  cwd: string,
  sandbox: string,
  kind: Kind | undefined,
): string {
  return [
    "Promise:",
    `outcome: ${compact(ticket.outcome ?? "see body")}`,
    `consumer: ${compact(ticket.consumer ?? "coordinator")}`,
    `writes: ${JSON.stringify((ticket.writes ?? []).map((glob) => resolve(cwd, glob)))}`,
    `first_return: ${compact(ticket.first_return ?? "useful interim RETURN")} (${ticket.first_return_s} seconds)`,
    `verify: ${JSON.stringify(ticket.verify)}${ticket.read_only_diagnostic === true ? " (read_only_diagnostic)" : ""}`,
    `kind: ${kind ?? "undeclared"}`,
    `labels: ${JSON.stringify(ticket.labels)}`,
    `Sandbox mode: ${sandbox}${sandbox === "none" ? " (unsandboxed)" : ""}.`,
  ].join("\n");
}

/** Split a brief into its ticket and the prose after it. Front matter is recognized only when the
 *  very first line is `+++`; once it is, a malformed ticket is `invalid`, never silently legacy. */
export function parseTicket(text: string): ParsedBrief {
  const lines = text.split("\n");
  if (!isFence(lines[0])) return { kind: "legacy", prose: text };
  const end = lines.findIndex((l, i) => i > 0 && isFence(l));
  if (end === -1)
    return {
      kind: "invalid",
      reason: "front matter opened with +++ on the first line is never closed",
    };
  const toml = parseToml(lines.slice(1, end).join("\n"));
  if (toml.isErr())
    return { kind: "invalid", reason: `not valid TOML: ${toml.error}` };
  const checked = TicketSchema.safeParse(toml.value);
  if (!checked.success)
    return {
      kind: "invalid",
      reason: checked.error.issues
        .map((i) => {
          const path = i.path.map(String).join(".");
          return path === "" ? i.message : `${path}: ${i.message}`;
        })
        .join("; "),
    };
  return {
    kind: "ticket",
    ticket: checked.data,
    prose: lines.slice(end + 1).join("\n"),
  };
}

/** The one line appended to the worker's brief; empty when there is nothing to verify. */
export function verifyLine(verify: string[]): string {
  if (verify.length === 0) return "";
  const list = verify.map((c) => `\`${c}\``).join("; ");
  return `The router runs these verify commands after you exit and grades you on them: ${list}. Run them yourself in the foreground before you finish; do not background anything you need to see.`;
}

// --- overlap of write scopes ---------------------------------------------------------------------
//
// RULE (conservative literal prefix): a glob is reduced to its literal directory prefix — the path
// segments before the first segment containing a glob metacharacter (* ? [ ] { }). Two globs overlap
// when one prefix is a segment-wise prefix of the other (so `**`, with an empty prefix, overlaps
// everything, and `a/*.ts` overlaps anything under `a/`). It never says "disjoint" for two globs
// that could match one path; it may say "overlap" for two that in fact cannot (`a/*.ts` vs `a/*.md`).
const WILDCARD = /[*?[\]{}]/u;

function literalPrefix(glob: string): string[] {
  const segments = glob.split("/").filter((s) => s !== "" && s !== ".");
  const firstWild = segments.findIndex((s) => WILDCARD.test(s));
  return firstWild === -1 ? segments : segments.slice(0, firstWild);
}

export function globsOverlap(a: string, b: string): boolean {
  const pa = literalPrefix(a);
  const pb = literalPrefix(b);
  const shared = Math.min(pa.length, pb.length);
  return pa.slice(0, shared).every((segment, i) => segment === pb[i]);
}

/** Every [mine, theirs] pair of globs that overlap. */
export function overlappingGlobs(
  mine: string[],
  theirs: string[],
): [string, string][] {
  return mine.flatMap((m) =>
    theirs
      .filter((t) => globsOverlap(m, t))
      .map((t): [string, string] => [m, t]),
  );
}
