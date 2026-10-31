import { ok } from "neverthrow";
import {
  account,
  agentNameAsync,
  readClaudeJsonAsync,
  rcStateAsync,
  reportToHerdr,
  ultracodeConfiguredAsync,
} from "./identity.ts";
import { modelWeeklyLimits } from "./rate-limits.ts";
import { repoStateAsync } from "./repo-state.ts";
import { scanOutOfHarnessAsync } from "./jobs.ts";
import { readHostLoadAsync } from "./host-load.ts";
import { agxRouteRunsAsync } from "./dispatch-runs.ts";
import { dispatchWarning } from "./dispatch-warning.ts";
import { collectAgxRouting } from "./agx-collector.ts";
import { diskReadingsAsync } from "./storage.ts";
import { readCodexRate } from "./codex-rate.ts";
import { readJevUsage } from "./jev-usage.ts";
import { readRecoverHealthAsync } from "./recover-health.ts";
import type { Sources } from "./build-dataframe.ts";
import { readAgxJobRuns } from "./agx-job-runs.ts";

async function identityFacts(): ReturnType<Sources["identity"]> {
  const cjResult = await readClaudeJsonAsync();
  const accountResult = cjResult.andThen(account);
  const capsResult = cjResult.andThen(modelWeeklyLimits);
  const workflow = await ultracodeConfiguredAsync();
  return {
    email: accountResult.unwrapOr(undefined),
    accountWhy: accountResult.isErr() ? accountResult.error : undefined,
    rlModel: capsResult.unwrapOr([]),
    modelCapsWhy: capsResult.isErr() ? capsResult.error : undefined,
    wfOn: workflow ?? false,
    workflowWhy:
      workflow === undefined ? "workflow settings unavailable" : undefined,
  };
}
// Invoked only by the systemd sampler, never by a render.
export const COLLECTOR_SOURCES: Sources = {
  identity: identityFacts,
  agentName: agentNameAsync,
  rcState: rcStateAsync,
  repoState: repoStateAsync,
  jobScan: scanOutOfHarnessAsync,
  liveAgxJobs: readAgxJobRuns,
  hostLoad: readHostLoadAsync,
  routes: async (sid, cwd) =>
    ok(await agxRouteRunsAsync(process.env, sid, false, cwd)),
  dispatchWarning: async () =>
    (await collectAgxRouting()).map((stats) => dispatchWarning(stats)),
  storage: diskReadingsAsync,
  herdrReport: reportToHerdr,
  codexRate: readCodexRate,
  jevUsage: () => readJevUsage(),
  recoverHealth: readRecoverHealthAsync,
};
