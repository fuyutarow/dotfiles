import { err, ok, type Result } from "neverthrow";
import type { StatusInput } from "./input.ts";
import type { Dataframe } from "./dataframe.ts";
import type { HostLoad } from "./host-load.ts";
import type { RouteRun } from "./dispatch-runs.ts";
import type { Admitted } from "./jobs.ts";
import type { DiskEntry } from "./storage.ts";
import type { ModelLimit } from "./rate-limits.ts";
import {
  account,
  agentNameAsync,
  readClaudeJsonAsync,
  rcStateAsync,
  reportToHerdr,
  ultracodeConfiguredAsync,
  type RcState,
} from "./identity.ts";
import { modelWeeklyLimits } from "./rate-limits.ts";
import { contextLabel, firstNonEmpty, modelName } from "./model-context.ts";
import { repoStateAsync } from "./repo-state.ts";
import { scanOutOfHarnessAsync } from "./jobs.ts";
import { readHostLoadAsync } from "./host-load.ts";
import { routeRunsAsync } from "./dispatch-runs.ts";
import { readDispatchWarningAsync } from "./dispatch-warning.ts";
import { diskReadingsAsync } from "./storage.ts";
import { readCodexRate } from "./codex-rate.ts";

type IdentityFacts = {
  email: string | undefined;
  accountWhy: string | undefined;
  rlModel: ModelLimit[];
  modelCapsWhy: string | undefined;
  wfOn: boolean;
};
type Sources = {
  identity: () => Promise<IdentityFacts>;
  agentName: (
    sid: string,
    hint?: string,
  ) => Promise<Result<string | undefined, string>>;
  rcState: () => Promise<RcState>;
  repoState: (
    cwd: string,
  ) => Promise<{ branch: string | undefined; branchWhy: string | undefined }>;
  jobScan: () => Promise<{
    jobs: Admitted[];
    orphans: number;
    failed?: string;
  }>;
  hostLoad: () => Promise<Omit<HostLoad, "disks">>;
  routes: () => Promise<Result<RouteRun[], string> | undefined>;
  dispatchWarning: () => Promise<string | undefined>;
  storage: () => Promise<Result<DiskEntry[], string>>;
  herdrReport: (
    model: string,
    sessionName?: string,
    effort?: string,
    rc?: RcState,
  ) => Promise<void>;
  codexRate: () => ReturnType<typeof readCodexRate>;
};
export interface BuildDataframeOptions {
  sources?: Partial<Sources>;
  budgets?: Partial<Record<keyof Sources, number>>;
}
const BUDGETS_MS: Record<keyof Sources, number> = {
  identity: 1500,
  agentName: 3000,
  rcState: 400,
  repoState: 2000,
  jobScan: 2000,
  hostLoad: 2000,
  routes: 2000,
  dispatchWarning: 1500,
  storage: 1500,
  herdrReport: 200,
  codexRate: 1000,
};
type Outcome<T> = { ok: true; value: T } | { ok: false; why: string };
async function runBounded<T>(
  name: string,
  budgetMs: number,
  source: () => Promise<T>,
): Promise<Outcome<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<Outcome<T>>((resolve) => {
    timer = setTimeout(() => {
      resolve({ ok: false, why: `${name} timeout ${budgetMs}ms` });
    }, budgetMs);
    timer.unref();
  });
  const pending = Promise.resolve()
    .then(source)
    .then(
      (value): Outcome<T> => ({ ok: true, value }),
      (): Outcome<T> => ({ ok: false, why: `${name} unavailable` }),
    );
  const outcome = await Promise.race([pending, timedOut]);
  if (timer !== undefined) clearTimeout(timer);
  return outcome;
}
function settled<T>(
  result: PromiseSettledResult<Outcome<T>>,
  fallback: T,
  name: string,
): { value: T; why: string | undefined } {
  if (result.status === "fulfilled")
    return result.value.ok
      ? { value: result.value.value, why: undefined }
      : { value: fallback, why: result.value.why };
  return { value: fallback, why: `${name} unavailable` };
}
async function identityFacts(): Promise<IdentityFacts> {
  const cjResult = await readClaudeJsonAsync();
  const accountResult = cjResult.andThen(account);
  const capsResult = cjResult.andThen(modelWeeklyLimits);
  return {
    email: accountResult.unwrapOr(undefined),
    accountWhy: accountResult.isErr() ? accountResult.error : undefined,
    rlModel: capsResult.unwrapOr([]),
    modelCapsWhy: capsResult.isErr() ? capsResult.error : undefined,
    wfOn: await ultracodeConfiguredAsync(),
  };
}
const DEFAULT_SOURCES: Sources = {
  identity: identityFacts,
  agentName: agentNameAsync,
  rcState: rcStateAsync,
  repoState: repoStateAsync,
  jobScan: scanOutOfHarnessAsync,
  hostLoad: readHostLoadAsync,
  routes: routeRunsAsync,
  dispatchWarning: readDispatchWarningAsync,
  storage: diskReadingsAsync,
  herdrReport: reportToHerdr,
  codexRate: readCodexRate,
};

// --- buildDataframe: stdin -> every displayable value, already computed. No ANSI, no rows. ---
export async function buildDataframe(
  data: StatusInput,
  options: BuildDataframeOptions = {},
): Promise<Dataframe> {
  // || (not ??): an empty cwd string must ALSO fall through to PWD, matching the old sh's
  // `[ -n "$cwd" ] || cwd=$PWD` guard — "" is never a real working directory.
  const workspaceDir = data.workspace?.current_dir;
  const cwdCandidate = firstNonEmpty(
    data.cwd,
    firstNonEmpty(workspaceDir, process.env.PWD ?? ""),
  );
  const cwd = cwdCandidate;
  const sid =
    data.session_id !== undefined && data.session_id !== ""
      ? data.session_id
      : undefined; // "" is not an id either
  const sessionNameHint =
    data.session_name !== undefined && data.session_name !== ""
      ? data.session_name
      : undefined;
  const sources = { ...DEFAULT_SOURCES, ...options.sources };

  const model = modelName(data.model?.display_name, data.model?.id);

  // "Dynamic workflow" (ultracode's auto multi-agent orchestration) is armed ONLY while BOTH
  // hold: the setting says so, and the live effort actually running is xhigh — ultracode forces
  // xhigh whenever it genuinely engages, and a higher-precedence effort lever (env var, an
  // interactive /effort choice, a per-model modelSettings entry the CLI itself writes back —
  // see ultracodeConfigured()'s note) can silently push effort off xhigh and turn orchestration
  // OFF even though `ultracode: true` still sits in settings. Reading the live value here (not
  // the setting alone) is what makes this catch that silent case instead of lying about it.
  const effort = data.effort?.level; // string | undefined
  // Plain-text form for herdr only ("xhigh" vs "xhigh+WF") — render() does its OWN combining
  // (with its own +WF color) from the raw `effort`/`wfOn` pair below; a dataframe field must
  // hold one raw fact, not a pre-styled/pre-joined display string, or a future render() change
  // duplicates work already done here (caught live 2026-09-12: the first cut of this split
  // stored the combined string AND re-appended "+WF" in render(), rendering "xhigh+WF+WF").
  // No `?? 0`: a payload that carries no token count is "unknown", not "zero tokens".
  const ctxTok =
    data.context_window?.total_input_tokens ??
    data.context_window?.current_usage?.input_tokens;
  const ctx = contextLabel(ctxTok);

  const budget = (key: keyof Sources): number =>
    options.budgets?.[key] ?? BUDGETS_MS[key];
  const [
    identityResult,
    nameResult,
    rcResult,
    repoResult,
    scanResult,
    hostResult,
    routesResult,
    warningResult,
    storageResult,
    codexRateResult,
  ] = await Promise.allSettled([
    runBounded("account", budget("identity"), sources.identity),
    runBounded("name", budget("agentName"), () =>
      sid === undefined
        ? Promise.resolve(ok<string | undefined, string>(undefined))
        : sources.agentName(sid, sessionNameHint),
    ),
    runBounded("rc", budget("rcState"), sources.rcState),
    runBounded("git", budget("repoState"), () => sources.repoState(cwd)),
    runBounded("process scan", budget("jobScan"), sources.jobScan),
    runBounded("host load", budget("hostLoad"), sources.hostLoad),
    runBounded("dispatch", budget("routes"), sources.routes),
    runBounded(
      "dispatch warning",
      budget("dispatchWarning"),
      sources.dispatchWarning,
    ),
    runBounded("storage", budget("storage"), sources.storage),
    runBounded("codex rate", budget("codexRate"), sources.codexRate),
  ]);
  const identity = settled(
    identityResult,
    {
      email: undefined,
      accountWhy: "account timeout",
      rlModel: [],
      modelCapsWhy: "model limits timeout",
      wfOn: false,
    },
    "account",
  );
  const name = settled(nameResult, err("name unavailable"), "name");
  const rc = settled(rcResult, "unknown", "rc");
  const repo = settled(
    repoResult,
    { branch: undefined, branchWhy: "git unavailable" },
    "git",
  );
  const scan = settled(
    scanResult,
    { jobs: [], orphans: 0, failed: "process scan unavailable" },
    "process scan",
  );
  const host = settled(
    hostResult,
    {
      cpuPct: err("host load unavailable"),
      ram: err("host load unavailable"),
      vram: err("host load unavailable"),
    },
    "host load",
  );
  const routes = settled(routesResult, undefined, "dispatch");
  const warning = settled(warningResult, undefined, "dispatch warning");
  const storage = settled(storageResult, err("storage unavailable"), "storage");
  const codexRate = settled(
    codexRateResult,
    err("codex rate unavailable"),
    "codex rate",
  );
  const identityWhy = identity.why;
  const nameResultValue = name.value;
  const sessionName = nameResultValue.isOk()
    ? nameResultValue.value
    : undefined;
  let sessionNameWhy = name.why;
  if (sessionNameWhy === undefined && nameResultValue.isErr())
    sessionNameWhy = nameResultValue.error;
  const branch = repo.value.branch;
  const branchWhy = repo.why ?? repo.value.branchWhy;
  const { jobs, orphans } = scan.value;
  const cpu = host.value.cpuPct;
  const ram = host.value.ram;
  const vram = host.value.vram;
  const disks = storage.why === undefined ? storage.value : err(storage.why);
  const wfOn = identity.value.wfOn && effort === "xhigh";
  let effortDisplay = effort;
  if (effort !== undefined && effort !== "")
    effortDisplay = `${effort}${wfOn ? "+WF" : ""}`;

  const dataframe: Dataframe = {
    cwd,
    sid,
    sessionName,
    sessionNameWhy,
    email: identity.value.email,
    model,
    effort,
    wfOn,
    rc: rc.value,
    ctx,
    ctxPct: data.context_window?.used_percentage,
    rl5: data.rate_limits?.five_hour?.used_percentage,
    rl5Reset: data.rate_limits?.five_hour?.resets_at,
    rl7: data.rate_limits?.seven_day?.used_percentage,
    rl7Reset: data.rate_limits?.seven_day?.resets_at,
    rlModel: identity.value.rlModel,
    accountWhy: identityWhy ?? identity.value.accountWhy,
    modelCapsWhy: identityWhy ?? identity.value.modelCapsWhy,
    codexRate:
      codexRate.why === undefined && codexRate.value.isOk()
        ? codexRate.value.value
        : undefined,
    codexRateWhy:
      codexRate.why ??
      (codexRate.value.isErr() ? codexRate.value.error : undefined),
    branch,
    branchWhy,
    add: data.cost?.total_lines_added,
    del: data.cost?.total_lines_removed,
    wt: data.worktree?.name,
    jobs,
    orphans,
    jobScanWhy: scan.why ?? scan.value.failed,
    routes: routes.why === undefined ? routes.value : err(routes.why),
    dispatchWarning:
      warning.why === undefined ? warning.value : "dispatch warning …",
    vram,
    disks,
    cpuPct: cpu,
    ram,
  };
  void runBounded("herdr", budget("herdrReport"), () =>
    sources.herdrReport(model, sessionName, effortDisplay, rc.value),
  ).catch(() => null);
  return dataframe;
}
