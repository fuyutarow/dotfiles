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

const writeGlob = z
  .string()
  .min(1)
  .refine((glob) => !glob.startsWith("/") && !glob.split("/").includes(".."));
const Ticket = z.looseObject({
  schema: z.literal(2),
  name: z.string().min(1).optional(),
  writes: z.array(writeGlob).default([]),
  outcome: z.string().trim().min(1),
  verify: z.array(z.string().trim().min(1)).default([]),
  timeout_s: z.number().int().min(60).max(14_400).optional(),
  premises: z.array(z.string()).optional(),
  capabilities: z.array(CapabilitySchema).default([]).transform(capabilityTags),
  proposition: Proposition,
});

export type NextTicket = z.output<typeof Ticket>;
export type ParsedNextTicket =
  | { success: true; ticket: NextTicket; prose: string; warnings: string[] }
  | { success: false; reason: string };

const parseToml = fromThrowable(
  (text: string): unknown => Bun.TOML.parse(text),
  (error) => (error instanceof Error ? error.message : String(error)),
);

const rowOf = (value: unknown): Record<string, unknown> | undefined => {
  const parsed = z.record(z.string(), z.unknown()).safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

export function parseNextTicket(text: string): ParsedNextTicket {
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
    const issue = checked.error.issues[0];
    const path = issue?.path.map(String).join(".");
    return {
      success: false,
      reason:
        path === undefined || path === ""
          ? (issue?.message ?? "invalid ticket")
          : `${path}: ${issue?.message ?? "invalid value"}`,
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
