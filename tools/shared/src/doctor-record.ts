import { z } from "./zod.ts";
import type { Attempt } from "./attempt.ts";

export const DoctorRecord = z.object({
  tool: z.string().min(1),
  object: z.string().min(1),
  finding: z.string().min(1),
  remedy: z.string().min(1),
});
export type DoctorRecord = z.output<typeof DoctorRecord>;

/** Keep classifier inventory columns internal; publish one validated JSONL shape. */
export function doctorOutput(lines: string[]): Attempt<string> {
  const records: string[] = [];
  for (const line of lines) {
    const [tool, repo, object, finding, remedy] = line.split("\t");
    const parsed = DoctorRecord.safeParse({
      tool,
      object:
        repo === undefined || object === undefined
          ? undefined
          : `${repo}/${object}`,
      finding,
      remedy,
    });
    if (!parsed.success) return { ok: false, error: parsed.error };
    records.push(JSON.stringify(parsed.data));
  }
  return {
    ok: true,
    value: records.length === 0 ? "" : `${records.join("\n")}\n`,
  };
}
