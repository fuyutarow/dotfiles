// Shared human/queue verdict protocol. Doctor findings are advisory deploy details.
import { jsonOf, z } from "../agents/hooks/zod.ts";

export const LandReportSchema = z.strictObject({
  commit: z.enum(["pending", "ok", "failed"]),
  push: z.enum(["pending", "ok", "failed"]),
  // Read legacy queue results, but never produce or judge by deployment details here.
  hosts: z.record(z.string(), z.string()).optional(),
  failure: z.string().optional(),
});
export type LandReport = z.output<typeof LandReportSchema>;

export function landExit(report: LandReport): number {
  return report.commit === "ok" &&
    report.push === "ok" &&
    report.failure === undefined
    ? 0
    : 1;
}

export function landSummary(report: LandReport, commit?: string): string {
  const landed = report.commit === "ok" && report.push === "ok";
  const exit = landExit(report);
  let status: string;
  if (exit === 0) status = "ok";
  else status = "FAIL";
  return `summary: ${status} commit=${commit ?? "none"} ${landed ? "landed and pushed" : `commit=${report.commit} push=${report.push}`}`;
}

export function foreignWip(output: string): string[] | undefined {
  for (const line of output.split("\n")) {
    const marker = line.indexOf("DOTFILES_RENDER_REFUSAL_V1=");
    if (marker < 0) continue;
    const decoded = jsonOf(
      z.strictObject({
        reason: z.literal("foreign-wip"),
        paths: z.array(z.string().min(1)).min(1),
      }),
    ).safeParse(line.slice(marker + "DOTFILES_RENDER_REFUSAL_V1=".length));
    if (decoded.success) return decoded.data.paths;
  }
  return undefined;
}
