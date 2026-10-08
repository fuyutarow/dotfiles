// The typed work ticket at the top of an agent-dispatch brief: TOML front matter between `+++` lines.
// A brief that does not start with `+++` is LEGACY — it comes back untouched, so no running
// coordinator breaks. Consumers: agent-dispatch (run, pick). Pure: no I/O, no state.
//
//   +++
//   schema = 1
//   writes = ["tools/agent-dispatch/**"]   # globs relative to --cd; [] = read-only
//   verify = ["bun test tools/agent-dispatch/tests"]
//   verify_timeout_s = 1200                  # optional; bound for all verify commands together
//   timeout_s = 3600                         # optional; worker wall clock (60..14400)
//   timeout_reason = "why this exceeds 1800 seconds" # required when timeout_s > 1800
//   capabilities = ["long-tool-loop"]        # optional; handed to Jev as required capabilities
//   +++
//   <the prose the worker receives>
import { fromThrowable, z } from "../../shared/src/zod.ts";

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
    message: "a write glob is relative to --cd and stays inside it",
  });

const CommonTicket = {
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
  capabilities: z.array(z.string().min(1)).default([]),
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
