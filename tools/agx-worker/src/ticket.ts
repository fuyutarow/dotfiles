// The typed work ticket at the top of every agx brief: TOML front matter between `+++` lines.
// There is one schema; a brief without it is invalid. Consumers: agx (run, pick, ticket). Pure: no
// I/O, no state.
//
//   +++
//   schema = 2
//   outcome = "the result this changes"
//   consumer = "who consumes it"
//   first_return = "useful interim artifact"
//   writes = ["tools/agx-worker/**"]   # globs relative to repo root; [] = read-only
//   verify = ["bun test tools/agx-worker/tests"]    # or read_only_diagnostic = true
//   verify_timeout_s = 1200                  # optional; bound for all verify commands together
//   timeout_s = 3600                         # optional; worker wall clock (60..14400)
//   timeout_reason = "why this exceeds 600 seconds" # required when timeout_s > 600
//   return_policy = "hard-blockers-only"         # or "any-contradiction"
//   capabilities = ["long-tool-loop"]        # optional; handed to Jev as required capabilities
//   budget_usd = 5.00                       # optional positive USD budget used to exclude over-budget rows
//   pick_temperature = 1.0                  # optional sampling temperature (0 <= T <= 5)
//
//   [proposition]                            # the decisive question this ticket serves
//   id = "D1"
//   claim = "one falsifiable sentence"
//   decides = "decisive"                     # decisive | mechanism | prerequisite | infrastructure
//   refuted_by = "the observable outcome that refutes the claim"
//   graph_node = "<statement id>"            # required for decisive | mechanism
//   serves = ["D1"]                          # required for prerequisite | infrastructure
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
export const DEFAULT_RETURN_POLICY = "hard-blockers-only";
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

export const CapabilitySchema = z.union([
  z.string().trim().min(1),
  z.strictObject({
    need: z.string().trim().min(1),
    lower_effort_lacks: z.string().trim().min(1),
  }),
]);

const oneLine = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !/[\r\n]/u.test(value), { message: "must be one line" });

/** Why the ticket exists: carried to Jev and to the worker so a side task cannot displace it. */
export const PropositionSchema = z
  .strictObject({
    id: oneLine,
    claim: oneLine,
    decides: z.enum([
      "decisive",
      "mechanism",
      "prerequisite",
      "infrastructure",
    ]),
    refuted_by: oneLine,
    graph_node: oneLine.optional(),
    serves: z.array(oneLine).optional(),
  })
  .refine(
    (p) =>
      (p.decides !== "decisive" && p.decides !== "mechanism") ||
      p.graph_node !== undefined,
    {
      path: ["graph_node"],
      message: "required when decides is decisive or mechanism",
    },
  )
  .refine(
    (p) =>
      (p.decides !== "prerequisite" && p.decides !== "infrastructure") ||
      (p.serves ?? []).length > 0,
    {
      path: ["serves"],
      message:
        "required (non-empty) when decides is prerequisite or infrastructure",
    },
  );
export type Proposition = z.output<typeof PropositionSchema>;

export const TicketSchema = z
  .strictObject({
    schema: z.literal(2),
    labels: z.array(z.string()).default([]),
    name: z
      .string()
      .min(1)
      .max(16)
      .regex(/^[A-Za-z0-9_-]+$/u)
      .optional(),
    writes: z.array(writeGlob),
    lease: z.literal("workspace").optional(),
    exclusive: z.boolean().default(false),
    verify: z.array(z.string().trim().min(1)).optional(),
    verify_timeout_s: z.number().positive().default(DEFAULT_VERIFY_TIMEOUT_S),
    timeout_s: z.number().int().min(60).max(MAX_TIMEOUT_S).optional(),
    timeout_reason: z.string().trim().min(1).optional(),
    first_return_s: z
      .number()
      .int()
      .min(60)
      .max(360)
      .default(DEFAULT_FIRST_RETURN_S),
    return_policy: z
      .enum(["hard-blockers-only", "any-contradiction"])
      .default(DEFAULT_RETURN_POLICY),
    budget_usd: z.number().positive().optional(),
    stall_s: z.number().int().positive().optional(),
    pick_temperature: z.number().min(0).max(5).optional(),
    requires_gpu: z.boolean().optional(),
    capabilities: z.array(CapabilitySchema).default([]),
    reuses: z.array(z.string().trim().min(1)).optional(),
    premises: z.array(premise).optional(),
    outcome: z.string().trim().min(1),
    consumer: z.string().trim().min(1),
    first_return: z.string().trim().min(1),
    split_from: z.string().trim().min(1).optional(),
    urgent_reason: z.string().trim().min(1).optional(),
    read_only_diagnostic: z.boolean().optional(),
    proposition: PropositionSchema,
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
  .refine(
    (ticket) =>
      ticket.verify !== undefined || ticket.read_only_diagnostic === true,
    {
      path: ["verify"],
      message: "required unless read_only_diagnostic = true",
    },
  )
  .transform((ticket) => ({ ...ticket, verify: ticket.verify ?? [] }));
export type Ticket = z.output<typeof TicketSchema>;
export type Capability = Ticket["capabilities"][number];
export const capabilityTags = (capabilities: readonly Capability[]): string[] =>
  capabilities.map((capability) =>
    typeof capability === "string" ? capability : capability.need,
  );

export type ParsedBrief =
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

/** The `[proposition]` table as TOML lines, for generated tickets (split pieces inherit it). */
export function propositionToml(p: Proposition): string[] {
  return [
    "[proposition]",
    `id = ${JSON.stringify(p.id)}`,
    `claim = ${JSON.stringify(p.claim)}`,
    `decides = ${JSON.stringify(p.decides)}`,
    `refuted_by = ${JSON.stringify(p.refuted_by)}`,
    ...(p.graph_node === undefined
      ? []
      : [`graph_node = ${JSON.stringify(p.graph_node)}`]),
    ...(p.serves === undefined ? [] : [`serves = ${JSON.stringify(p.serves)}`]),
  ];
}

/** The recap Jev and the worker both read first; one line per field. */
export function propositionRecap(p: Proposition): string {
  return [
    `Proposition ${p.id} (${p.decides}): ${p.claim}`,
    `refuted_by: ${p.refuted_by}`,
    ...(p.graph_node === undefined ? [] : [`graph_node: ${p.graph_node}`]),
    ...(p.serves === undefined ? [] : [`serves: ${p.serves.join(", ")}`]),
  ].join("\n");
}

/** Compact worker-facing promise; paths retain glob syntax and are rooted in the checkout. */
export function promiseBlock(
  ticket: Ticket,
  cwd: string,
  sandbox: string,
  kind: Kind | undefined,
): string {
  return [
    propositionRecap(ticket.proposition),
    "Everything below serves this proposition; do not let a side task displace it.",
    "",
    "Promise:",
    `outcome: ${compact(ticket.outcome)}`,
    `consumer: ${compact(ticket.consumer)}`,
    `writes: ${JSON.stringify(ticket.writes.map((glob) => resolve(cwd, glob)))}`,
    `first_return: ${compact(ticket.first_return)} (${ticket.first_return_s} seconds)`,
    `return_policy: ${ticket.return_policy}`,
    ticket.return_policy === "any-contradiction"
      ? "Housekeeping: RETURN early for any contradiction with the brief, including a small discrepancy."
      : "Housekeeping: for small discrepancies with an obvious resolution (counts off by a few, short vs full commit ids, brief count differs from measurement, or missing formatting), use the conservative assumption, record the finding in your final report, and continue. RETURN early only for a hard blocker: a rule the data cannot satisfy, a premise failure that changes the outcome, or a safety rule.",
    `verify: ${JSON.stringify(ticket.verify)}${ticket.read_only_diagnostic === true ? " (read_only_diagnostic)" : ""}`,
    `kind: ${kind ?? "undeclared"}`,
    `labels: ${JSON.stringify(ticket.labels)}`,
    ...(ticket.labels.includes("julia-compile")
      ? [
          "Julia compile routing: run every Julia command that may precompile through `agent-resource-run --manifest <declared-envelope.json> --slot julia-compile -- julia …`; keep the ticket's declared envelope.",
        ]
      : []),
    `Sandbox mode: ${sandbox}${sandbox === "none" ? " (unsandboxed)" : ""}.`,
  ].join("\n");
}

/** Split a brief into its ticket and the prose after it. The very first line must be `+++`. */
export function parseTicket(text: string): ParsedBrief {
  const lines = text.split("\n");
  if (!isFence(lines[0]))
    return {
      kind: "invalid",
      reason:
        "a ticket starts with +++ front matter; save it as a file and pass it to agx worker run",
    };
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
// Path patterns intersect segment by segment. A single star never consumes a slash.
type Atom = {
  star: boolean;
  accepts: (code: number) => boolean;
  boundaries: number[];
};
const anyAtom = (star: boolean): Atom => ({
  star,
  accepts: (code) => code > 0 && code <= 0x10ffff && code !== 47,
  boundaries: [1, 47, 48],
});
function classAtom(
  pattern: string,
  start: number,
): { atom: Atom; end: number } | undefined {
  const end = pattern.indexOf("]", start + 1);
  if (end <= start + 1) return undefined;
  const text = pattern.slice(start + 1, end);
  const negative = text.startsWith("!") || text.startsWith("^");
  const content = Array.from(negative ? text.slice(1) : text);
  const ranges: [number, number][] = [];
  for (let j = 0; j < content.length; j++) {
    const lo = content[j]?.codePointAt(0) ?? 0;
    const ranged = content[j + 1] === "-" && j + 2 < content.length;
    const hi = ranged ? (content[j + 2]?.codePointAt(0) ?? 0) : lo;
    if (ranged) j += 2;
    ranges.push([lo, hi]);
  }
  return {
    end,
    atom: {
      star: false,
      accepts: (code) =>
        code > 0 &&
        code <= 0x10ffff &&
        code !== 47 &&
        ranges.some(([lo, hi]) => code >= lo && code <= hi) !== negative,
      boundaries: ranges.flatMap(([lo, hi]) => [lo, hi + 1]),
    },
  };
}
function segmentAtoms(pattern: string): Atom[] {
  const atoms: Atom[] = [];
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "*" || char === "?") {
      atoms.push(anyAtom(char === "*"));
      continue;
    }
    const grouped = char === "[" ? classAtom(pattern, i) : undefined;
    if (grouped !== undefined) {
      atoms.push(grouped.atom);
      i = grouped.end;
      continue;
    }
    if (char === "\\" && i + 1 < pattern.length) i++;
    const code = pattern.codePointAt(i) ?? 0;
    atoms.push({
      star: false,
      accepts: (candidate) => candidate === code && code !== 47 && code !== 0,
      boundaries: [code, code + 1],
    });
    if (code > 0xffff) i++;
  }
  return atoms;
}
function segmentsIntersect(a: string, b: string): boolean {
  const left = segmentAtoms(a),
    right = segmentAtoms(b);
  const alphabet = new Set([
    1,
    48,
    ...left.flatMap((atom) => atom.boundaries),
    ...right.flatMap((atom) => atom.boundaries),
  ]);
  const queue: [number, number, boolean][] = [[0, 0, false]];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const [i, j, consumed] = queue.pop() ?? [0, 0, false];
    const key = [i, j, consumed].join(":");
    if (visited.has(key)) continue;
    visited.add(key);
    if (i === left.length && j === right.length && consumed) return true;
    const l = left[i],
      r = right[j];
    if (l?.star === true) queue.push([i + 1, j, consumed]);
    if (r?.star === true) queue.push([i, j + 1, consumed]);
    if (
      l !== undefined &&
      r !== undefined &&
      [...alphabet].some((code) => l.accepts(code) && r.accepts(code))
    )
      queue.push([l.star ? i : i + 1, r.star ? j : j + 1, true]);
  }
  return false;
}
export function expandBraces(pattern: string): string[] {
  const start = pattern.indexOf("{");
  if (start < 0) return [pattern];
  let depth = 0,
    end = -1;
  const choices: string[] = [];
  let beginning = start + 1;
  for (let i = start; i < pattern.length; i++) {
    if (pattern[i] === "{") depth++;
    if (pattern[i] === "}") depth--;
    if ((pattern[i] === "," && depth === 1) || depth === 0) {
      choices.push(pattern.slice(beginning, i));
      beginning = i + 1;
    }
    if (depth === 0) {
      end = i;
      break;
    }
  }
  if (end < 0) return [pattern];
  return choices.flatMap((choice) =>
    expandBraces(pattern.slice(0, start) + choice + pattern.slice(end + 1)),
  );
}
const segments = (pattern: string) =>
  (pattern.endsWith("/") ? pattern + "**" : pattern)
    .split("/")
    .filter((part) => part !== "" && part !== ".");

function pathPatternsIntersect(a: string, b: string): boolean {
  const left = segments(a),
    right = segments(b);
  const queue: [number, number][] = [[0, 0]];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const [i, j] = queue.pop() ?? [0, 0];
    const key = i + ":" + j;
    if (visited.has(key)) continue;
    visited.add(key);
    if (i === left.length && j === right.length) return true;
    const l = left[i],
      r = right[j];
    if (l === "**") queue.push([i + 1, j]);
    if (r === "**") queue.push([i, j + 1]);
    if (l === undefined || r === undefined) continue;
    if (l === "**" && r !== "**") queue.push([i, j + 1]);
    if (r === "**" && l !== "**") queue.push([i + 1, j]);
    if (l !== "**" && r !== "**" && segmentsIntersect(l, r))
      queue.push([i + 1, j + 1]);
  }
  return false;
}
export function globsOverlap(a: string, b: string): boolean {
  return expandBraces(a).some((left) =>
    expandBraces(b).some((right) => pathPatternsIntersect(left, right)),
  );
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
