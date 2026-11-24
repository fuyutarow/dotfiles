import { Result } from "@dotfiles/shared/src/result.ts";
import {
  account,
  agentNameAsync,
  readClaudeJsonAsync,
  rcStateAsync,
  reportToHerdr,
  ultracodeConfiguredAsync,
} from "#src/identity.ts";
import { modelWeeklyLimits } from "#src/rate-limits.ts";
import { repoStateAsync } from "#src/repo-state.ts";
import { readHostLoadAsync } from "#src/host-load.ts";
import { agxRouteRunsAsync } from "#src/dispatch-runs.ts";
import { dispatchWarning } from "#src/dispatch-warning.ts";
import { collectAgxRouting } from "#src/agx-collector.ts";
import { diskReadingsAsync } from "#src/storage.ts";
import { readCodexRate } from "#src/codex-rate.ts";
import { readJevUsage } from "#src/jev-usage.ts";
import { readRecoverHealthAsync } from "#src/recover-health.ts";
import type { Sources } from "#src/build-dataframe.ts";
import { readAgxJobRuns } from "#src/agx-job-runs.ts";

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
  liveAgxJobs: readAgxJobRuns,
  hostLoad: readHostLoadAsync,
  routes: async (sid, cwd) =>
    Result.ok(await agxRouteRunsAsync(process.env, sid, false, cwd)),
  dispatchWarning: async () =>
    (await collectAgxRouting()).map((stats) => dispatchWarning(stats)),
  storage: diskReadingsAsync,
  herdrReport: reportToHerdr,
  codexRate: readCodexRate,
  jevUsage: () => readJevUsage(),
  recoverHealth: readRecoverHealthAsync,
};
