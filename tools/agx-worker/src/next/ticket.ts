import { fromThrowable } from "neverthrow";
import { z } from "../../../shared/src/zod.ts";
import { CapabilitySchema, capabilityTags } from "../ticket.ts";

const oneLine = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !/[\r\n]/u.test(value));
const Proposition = z.looseObject({
  id: oneLine,
  claim: oneLine,
  refuted_by: oneLine,
});

export const writeGlob = z
  .string()
  .min(1)
  .refine((glob) => !glob.startsWith("/") && !glob.split("/").includes(".."));
const Ticket = z
  .looseObject({
    schema: z.literal(2),
    name: z.string().min(1).optional(),
    writes: z.array(z.string().min(1)).default([]),
    outcome: z.string().trim().min(1),
    verify: z.array(z.string().trim().min(1)).default([]),
    timeout_s: z.number().int().min(60).max(14_400).optional(),
    premises: z
      .array(z.string().regex(/^(?:file|symbol|bookmark|task|rev):.+$/u))
      .optional(),
    base_rev: z
      .string()
      .regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u)
      .optional(),
    supersedes: oneLine.optional(),
    first_return_s: z.number().int().positive().max(14_400).optional(),
    external_reads: z.array(oneLine).optional(),
    network: z.enum(["none", "allowed"]).optional(),
    sandbox: z.enum(["none", "read-only", "workspace-write"]).optional(),
    resources: z
      .strictObject({
        cpu: z.number().positive(),
        ram_gb: z.number().nonnegative(),
        gpu: z.number().int().nonnegative().optional(),
        vram_gb: z.number().nonnegative().optional(),
      })
      .optional(),
    capabilities: z
      .array(CapabilitySchema)
      .default([])
      .transform(capabilityTags),
    proposition: Proposition,
  })
  .refine(
    (ticket) =>
      ticket.first_return_s === undefined ||
      ticket.first_return_s <= (ticket.timeout_s ?? 600),
    {
      path: ["first_return_s"],
      message: "must not exceed timeout_s (default 600)",
    },
  );

export type NextTicket = z.output<typeof Ticket>;
export type ParsedNextTicket =
  | { success: true; ticket: NextTicket; prose: string; warnings: string[] }
  | { success: false; reason: string; reasons?: string[] };

const parseToml = fromThrowable(
  (text: string): unknown => Bun.TOML.parse(text),
  (error) => (error instanceof Error ? error.message : String(error)),
);

const rowOf = (value: unknown): Record<string, unknown> | undefined => {
  const parsed = z.record(z.string(), z.unknown()).safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

export function parseNextTicket(
  text: string,
  collectWrites = false,
): ParsedNextTicket {
  const lines = text.split("\n");
  if (lines[0]?.trimEnd() !== "+++")
    return { success: false, reason: "a ticket starts with +++ front matter" };
  const closing = lines.findIndex(
    (line, index) => index > 0 && line.trimEnd() === "+++",
  );
  if (closing < 0)
    return { success: false, reason: "ticket front matter is not closed" };
  const decoded = parseToml(lines.slice(1, closing).join("\n"));
  if (decoded.isErr())
    return { success: false, reason: `invalid ticket TOML: ${decoded.error}` };
  const fields = z.record(z.string(), z.unknown()).safeParse(decoded.value);
  if (!fields.success)
    return {
      success: false,
      reason: fields.error.issues[0]?.message ?? "invalid ticket fields",
    };
  const checked = Ticket.safeParse(fields.data);
  if (!checked.success) {
    const examples: Record<string, string> = {
      schema: "schema = 2",
      outcome: 'outcome = "Deliver the result"',
      proposition:
        '[proposition]\\nid = "P1"\\nclaim = "Expected result"\\nrefuted_by = "Counterexample"',
      "proposition.id": 'id = "P1"',
      "proposition.claim": 'claim = "Expected result"',
      "proposition.refuted_by": 'refuted_by = "Counterexample"',
      "resources.cpu": "cpu = 1",
      "resources.ram_gb": "ram_gb = 1",
    };
    const reasons = checked.error.issues.map((issue) => {
      const path = issue.path.map(String).join(".");
      const example = examples[path];
      const table = path.includes(".")
        ? `[${path.split(".")[0]}]`
        : "ticket front matter";
      const suffix = example === undefined ? "" : `; example: ${example}`;
      return path === ""
        ? issue.message
        : `${table} ${path}: ${issue.message}${suffix}`;
    });
    const writes = z.array(z.string()).safeParse(fields.data.writes);
    reasons.push(
      ...(writes.success ? writes.data : []).flatMap((glob, index) =>
        writeGlob.safeParse(glob).success
          ? []
          : [
              `ticket front matter writes.${index}: use a relative glob without .., relative to --cd`,
            ],
      ),
    );
    return { success: false, reason: reasons.join("; "), reasons };
  }

  if (!collectWrites) {
    const invalid = checked.data.writes.findIndex(
      (glob) => !writeGlob.safeParse(glob).success,
    );
    if (invalid >= 0)
      return {
        success: false,
        reason: `ticket front matter writes.${invalid}: use a relative glob without ..; repair writes relative to --cd`,
      };
  }
  const warnings = new Set<string>();
  const supported = new Set([
    "schema",
    "name",
    "writes",
    "outcome",
    "verify",
    "timeout_s",
    "premises",
    "capabilities",
    "proposition",
    "base_rev",
    "supersedes",
    "first_return_s",
    "external_reads",
    "network",
    "sandbox",
    "resources",
  ]);
  for (const key of Object.keys(fields.data))
    if (!supported.has(key)) warnings.add(key);
  const propositionFields = rowOf(fields.data.proposition);
  for (const key of Object.keys(propositionFields ?? {}))
    if (!["id", "claim", "refuted_by"].includes(key))
      warnings.add(`proposition.${key}`);
  if (checked.data.capabilities.length > 0)
    warnings.add("capabilities (routing only)");
  const prose = lines.slice(closing + 1).join("\n");
  if (/^RESOURCE-(?:CLASS|ENVELOPE)\(/mu.test(prose))
    warnings.add("RESOURCE line");
  return {
    success: true,
    ticket: checked.data,
    prose,
    warnings: [...warnings],
  };
}
