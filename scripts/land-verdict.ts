// Shared human/queue verdict protocol. Doctor findings are advisory deploy details.
import { jsonOf, z } from "../agents/hooks/zod.ts";

export const LandReportSchema = z.strictObject({
  commit: z.enum(["pending", "ok", "failed"]),
  push: z.enum(["pending", "ok", "failed"]),
  hosts: z.record(z.string(), z.string()),
  failure: z.string().optional(),
});
export type LandReport = z.output<typeof LandReportSchema>;

export function landExit(report: LandReport): number {
  const landed = report.commit === "ok" && report.push === "ok";
  const deployFailed = Object.values(report.hosts).some((state) =>
    state.startsWith("FAIL "),
  );
  if (landed && (report.failure !== undefined || deployFailed)) return 2;
  return landed &&
    report.failure === undefined &&
    !deployFailed &&
    Object.values(report.hosts).every(
      (state) =>
        state.startsWith("ok") ||
        state.startsWith("blocked: foreign WIP (") ||
        state.startsWith("skipped (") ||
        state === "skipped: unresolvable" ||
        state.startsWith("would "),
    )
    ? 0
    : 1;
}

export function landSummary(report: LandReport, commit?: string): string {
  const landed = report.commit === "ok" && report.push === "ok";
  const exit = landExit(report);
  let status: string;
  if (exit === 0) status = "ok";
  else if (exit === 2) status = "landed, deploy failed";
  else status = "FAIL";
  return `summary: ${status} commit=${commit ?? "none"} ${landed ? "landed and pushed" : `commit=${report.commit} push=${report.push}`}; skipped hosts appear in hosts below; mark a host inactive with deploy: false in LAND_HOSTS hosts=${JSON.stringify(report.hosts)}`;
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
