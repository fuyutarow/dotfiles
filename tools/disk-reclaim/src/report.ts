import { homedir } from "node:os";
import { writeReclaimPlanCache } from "../../shared/src/reclaim-plan-cache.ts";
import type { Plan } from "./model.ts";

export async function cachePlanReport(plan: Plan): Promise<void> {
  await writeReclaimPlanCache(plan, process.env.HOME ?? homedir());
}
