// Shared human/queue verdict protocol. Doctor findings are advisory deploy details.
import { jsonOf, z } from "../agents/hooks/zod.ts";
import { RENDERED } from "./config-registry.ts";

export const LandReportSchema = z.strictObject({
  commit: z.enum(["pending", "ok", "failed"]),
  push: z.enum(["pending", "ok", "failed"]),
  live: z.boolean().optional(),
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
  if (exit === 0 && report.live === false) status = "NOT LIVE";
  else if (exit === 0 && report.live === true) status = "LIVE";
  else if (exit === 0) status = "ok";
  else status = "FAIL";
  return `summary: ${status} commit=${commit ?? "none"} ${landed ? "landed and pushed" : `commit=${report.commit} push=${report.push}`}`;
}

const deployInputRoots = RENDERED.flatMap(({ inputs }) => inputs).toSorted();

function isAtOrUnder(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

/** Returns landed paths whose effects require `mise run deploy` to become live.
 * Link targets and package bin targets are read from the checkout, so their content is live
 * immediately. Callers supply package manifests whose `bin` map changed and added/removed
 * environment.d declarations, the cases where installation or link creation must catch up. */
export function landDeployPaths(
  changedPaths: readonly string[],
  changedBinMaps: readonly string[] = [],
  changedEnvironmentDropins: readonly string[] = [],
): string[] {
  const explicitDeployPaths = new Set([
    ...changedBinMaps,
    ...changedEnvironmentDropins,
  ]);
  return [...new Set(changedPaths)]
    .filter(
      (path) =>
        explicitDeployPaths.has(path) ||
        deployInputRoots.some((root) => isAtOrUnder(path, root)),
    )
    .toSorted();
}

export function landLiveness(
  changedPaths: readonly string[],
  changedBinMaps: readonly string[] = [],
  changedEnvironmentDropins: readonly string[] = [],
): { live: boolean; deployPaths: string[] } {
  const deployPaths = landDeployPaths(
    changedPaths,
    changedBinMaps,
    changedEnvironmentDropins,
  );
  return { live: deployPaths.length === 0, deployPaths };
}

export type LedgerAcceptance = {
  run_id: string;
  accept: boolean;
  at?: string;
  order: number;
};

export function ledgerAcceptances(lines: string[]): LedgerAcceptance[] {
  const acceptanceSchema = z.looseObject({
    kind: z.literal("acceptance"),
    run_id: z.string(),
    accept: z.boolean(),
    at: z.string().optional(),
  });
  const judgments: LedgerAcceptance[] = [];
  for (const [order, line] of lines.entries()) {
    const parsed = jsonOf(acceptanceSchema).safeParse(line);
    if (!parsed.success) continue;
    judgments.push({
      run_id: parsed.data.run_id,
      accept: parsed.data.accept,
      ...(parsed.data.at === undefined ? {} : { at: parsed.data.at }),
      order,
    });
  }
  return judgments;
}

export function lifecycleJudgments(lines: string[]): LedgerAcceptance[] {
  const judgedSchema = z.looseObject({
    type: z.literal("judged"),
    run_id: z.string(),
    decision: z.enum(["accept", "reject"]),
    at: z.string().optional(),
  });
  const judgments: LedgerAcceptance[] = [];
  for (const [order, line] of lines.entries()) {
    const parsed = jsonOf(judgedSchema).safeParse(line);
    if (!parsed.success) continue;
    judgments.push({
      run_id: parsed.data.run_id,
      accept: parsed.data.decision === "accept",
      ...(parsed.data.at === undefined ? {} : { at: parsed.data.at }),
      order,
    });
  }
  return judgments;
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
