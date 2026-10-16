import { err, ok, type Result } from "neverthrow";
import type { SessionStatus } from "./session-status.ts";
import type { Dataframe } from "./dataframe.ts";
import type { HostLoad } from "./host-load.ts";
import type { RouteScan } from "./dispatch-runs.ts";
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
import { agxRouteRunsAsync } from "./dispatch-runs.ts";
import { readDispatchWarningAsync } from "./dispatch-warning.ts";
import { diskReadingsAsync } from "./storage.ts";
import type { DiskReading } from "./storage.ts";
import { readCodexRate } from "./codex-rate.ts";
import { readJevUsage } from "./jev-usage.ts";
import {
  readRecoverHealthAsync,
  type RecoverHealth,
} from "./recover-health.ts";
import { cachedSource } from "./render-cache.ts";
import { z } from "./zod.ts";

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
  routes: (
    sessionId?: string,
  ) => Promise<Result<RouteScan, string> | undefined>;
  dispatchWarning: () => Promise<string | undefined>;
  storage: () => Promise<Result<DiskEntry[], string>>;
  herdrReport: (
    model: string,
    sessionName?: string,
    effort?: string,
    rc?: RcState,
  ) => Promise<void>;
  codexRate: () => ReturnType<typeof readCodexRate>;
  jevUsage: () => ReturnType<typeof readJevUsage>;
  recoverHealth: () => Promise<RecoverHealth | undefined>;
};
export interface BuildDataframeOptions {
  sources?: Partial<Sources>;
  budgets?: Partial<Record<keyof Sources, number>>;
  codex?: boolean;
  clock?: SourceClock;
}
/** Monotonic deadlines, injectable independently of source I/O and host scheduling. */
export interface SourceClock {
  now: () => number;
  timeout: (callback: () => void, ms: number) => () => void;
}
const SOURCE_CLOCK: SourceClock = {
  now: () => performance.now(),
  timeout: (callback, ms) => {
    const timer = setTimeout(callback, ms);
    timer.unref();
    return () => {
      clearTimeout(timer);
    };
  },
};
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
  jevUsage: 1000,
  recoverHealth: 1000,
};
type Outcome<T> = { ok: true; value: T } | { ok: false; why: string };
async function runBounded<T>(
  name: string,
  budgetMs: number,
  source: () => Promise<T>,
  clock: SourceClock,
): Promise<Outcome<T>> {
  const started = clock.now();
  let cancel: (() => void) | undefined;
  const timedOut = new Promise<Outcome<T>>((resolve) => {
    cancel = clock.timeout(() => {
      resolve({ ok: false, why: `${name} timeout ${budgetMs}ms` });
    }, budgetMs);
  });
  const pending = Promise.resolve()
    .then(source)
    .then(
      (value): Outcome<T> =>
        clock.now() - started >= budgetMs
          ? { ok: false, why: `${name} timeout ${budgetMs}ms` }
          : { ok: true, value },
      (): Outcome<T> => ({ ok: false, why: `${name} unavailable` }),
    );
  const outcome = await Promise.race([pending, timedOut]);
  cancel?.();
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
const RepoStateCacheSchema = z.object({
  branch: z.string().optional(),
  branchWhy: z.string().optional(),
});
const JobScanCacheSchema = z.object({
  jobs: z.array(z.object({ name: z.string(), secs: z.number() })),
  orphans: z.number(),
  failed: z.string().optional(),
});
const DiskEntryCacheSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("reading"),
    label: z.string(),
    usedG: z.number(),
    totalG: z.number().optional(),
    freeG: z.number().optional(),
    path: z.string().optional(),
    rateGibPerMin: z.number().optional(),
    rateRedMinutes: z.number().optional(),
    rateYellowMinutes: z.number().optional(),
  }),
  z.object({ kind: z.literal("miss"), label: z.string(), why: z.string() }),
]);
const DiskResultCacheSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("readings"),
    entries: z.array(DiskEntryCacheSchema),
  }),
  z.object({ kind: z.literal("error"), value: z.string() }),
]);
function diskEntryFromCache(entry: z.output<typeof DiskEntryCacheSchema>) {
  if (entry.kind === "miss") return entry;
  const reading: DiskReading = {
    kind: "reading" as const,
    label: entry.label,
    usedG: entry.usedG,
    totalG: entry.totalG,
    freeG: entry.freeG,
  };
  if (entry.path !== undefined) reading.path = entry.path;
  if (entry.rateGibPerMin !== undefined)
    reading.rateGibPerMin = entry.rateGibPerMin;
  if (entry.rateRedMinutes !== undefined)
    reading.rateRedMinutes = entry.rateRedMinutes;
  if (entry.rateYellowMinutes !== undefined)
    reading.rateYellowMinutes = entry.rateYellowMinutes;
  return reading;
}
const cachedStorage: Sources["storage"] = async () => {
  const cached = await cachedSource({
    key: "configured-disk-statfs-and-rates",
    ttlMs: 5_000,
    schema: DiskResultCacheSchema,
    load: async () => {
      const result = await diskReadingsAsync();
      return result.match(
        (entries) => ({ kind: "readings" as const, entries }),
        (value) => ({ kind: "error" as const, value }),
      );
    },
  });
  return cached.kind === "error"
    ? err(cached.value)
    : ok(cached.entries.map(diskEntryFromCache));
};
const cachedRoutes: Sources["routes"] = async (sessionId) => {
  return ok(await agxRouteRunsAsync(process.env, sessionId));
};
const DEFAULT_SOURCES: Sources = {
  identity: identityFacts,
  agentName: agentNameAsync,
  rcState: rcStateAsync,
  repoState: async (cwd) => {
    const result = await cachedSource({
      key: `git:${cwd}`,
      ttlMs: 1_500,
      schema: RepoStateCacheSchema,
      load: () => repoStateAsync(cwd),
    });
    return { branch: result.branch, branchWhy: result.branchWhy };
  },
  jobScan: async () => {
    const result = await cachedSource({
      key: "ps-agx-admissions",
      ttlMs: 1_000,
      schema: JobScanCacheSchema,
      load: scanOutOfHarnessAsync,
    });
    return {
      jobs: result.jobs,
      orphans: result.orphans,
      ...(result.failed === undefined ? {} : { failed: result.failed }),
    };
  },
  hostLoad: readHostLoadAsync,
  routes: cachedRoutes,
  dispatchWarning: readDispatchWarningAsync,
  storage: cachedStorage,
  herdrReport: reportToHerdr,
  codexRate: readCodexRate,
  jevUsage: () => readJevUsage(),
  recoverHealth: readRecoverHealthAsync,
};

// --- buildDataframe: stdin -> every displayable value, already computed. No ANSI, no rows. ---
export async function buildDataframe(
  data: SessionStatus,
  options: BuildDataframeOptions = {},
): Promise<Dataframe> {
  // || (not ??): an empty cwd string must ALSO fall through to PWD, matching the old sh's
  // `[ -n "$cwd" ] || cwd=$PWD` guard — "" is never a real working directory.
  const cwdCandidate = firstNonEmpty(data.cwd, process.env.PWD ?? "");
  const cwd = cwdCandidate;
  const sid =
    data.sessionId !== undefined && data.sessionId !== ""
      ? data.sessionId
      : undefined; // "" is not an id either
  const sessionNameHint =
    data.sessionName !== undefined && data.sessionName !== ""
      ? data.sessionName
      : undefined;
  const sources = { ...DEFAULT_SOURCES, ...options.sources };
  const bounded = <T>(
    name: string,
    budgetMs: number,
    source: () => Promise<T>,
  ) => runBounded(name, budgetMs, source, options.clock ?? SOURCE_CLOCK);

  const model = modelName(data.model?.name, data.model?.id);

  // "Dynamic workflow" (ultracode's auto multi-agent orchestration) is armed ONLY while BOTH
  // hold: the setting says so, and the live effort actually running is xhigh — ultracode forces
  // xhigh whenever it genuinely engages, and a higher-precedence effort lever (env var, an
  // interactive /effort choice, a per-model modelSettings entry the CLI itself writes back —
  // see ultracodeConfigured()'s note) can silently push effort off xhigh and turn orchestration
  // OFF even though `ultracode: true` still sits in settings. Reading the live value here (not
  // the setting alone) is what makes this catch that silent case instead of lying about it.
  const effort = data.effort; // string | undefined
  // Plain-text form for herdr only ("xhigh" vs "xhigh+WF") — render() does its OWN combining
  // (with its own +WF color) from the raw `effort`/`wfOn` pair below; a dataframe field must
  // hold one raw fact, not a pre-styled/pre-joined display string, or a future render() change
  // duplicates work already done here (caught live 2026-09-12: the first cut of this split
  // stored the combined string AND re-appended "+WF" in render(), rendering "xhigh+WF+WF").
  // No `?? 0`: a payload that carries no token count is "unknown", not "zero tokens".
  const ctxTok = data.context?.inputTokens;
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
    jevUsageResult,
    recoverHealthResult,
  ] = await Promise.allSettled([
    bounded(
      "account",
      budget("identity"),
      options.codex === true
        ? () =>
            Promise.resolve({
              email: undefined,
              accountWhy: undefined,
              rlModel: [],
              modelCapsWhy: undefined,
              wfOn: false,
            })
        : sources.identity,
    ),
    bounded("name", budget("agentName"), () =>
      sid === undefined
        ? Promise.resolve(ok<string | undefined, string>(undefined))
        : sources.agentName(sid, sessionNameHint),
    ),
    bounded("rc", budget("rcState"), sources.rcState),
    bounded("git", budget("repoState"), () => sources.repoState(cwd)),
    bounded("process scan", budget("jobScan"), sources.jobScan),
    bounded("host load", budget("hostLoad"), sources.hostLoad),
    bounded("dispatch", budget("routes"), () => sources.routes(sid)),
    bounded(
      "dispatch warning",
      budget("dispatchWarning"),
      sources.dispatchWarning,
    ),
    bounded("storage", budget("storage"), sources.storage),
    bounded("codex rate", budget("codexRate"), sources.codexRate),
    bounded("Jev usage", budget("jevUsage"), sources.jevUsage),
    bounded("recover health", budget("recoverHealth"), sources.recoverHealth),
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
  const jevUsage = settled(
    jevUsageResult,
    err("Jev usage unavailable"),
    "Jev usage",
  );
  const recoverHealth = settled(
    recoverHealthResult,
    undefined,
    "recover health",
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
    ctxPct: data.context?.usedPercent,
    rl5: data.rateLimits?.fiveHour?.usedPercent,
    rl5Reset: data.rateLimits?.fiveHour?.resetsAt,
    rl7: data.rateLimits?.sevenDay?.usedPercent,
    rl7Reset: data.rateLimits?.sevenDay?.resetsAt,
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
    jevUsage:
      jevUsage.why === undefined && jevUsage.value.isOk()
        ? jevUsage.value.value
        : undefined,
    jevUsageWhy:
      jevUsage.why ??
      (jevUsage.value.isErr() ? jevUsage.value.error : undefined),
    branch,
    branchWhy,
    add: data.changes?.linesAdded,
    del: data.changes?.linesRemoved,
    wt: data.worktree?.name,
    jobs,
    orphans,
    jobScanWhy: scan.why ?? scan.value.failed,
    routes: routes.why === undefined ? routes.value : err(routes.why),
    dispatchWarning:
      warning.why === undefined ? warning.value : "dispatch warning …",
    recoverHealth: recoverHealth.value,
    vram,
    disks,
    cpuPct: cpu,
    ram,
  };
  void bounded("herdr", budget("herdrReport"), () =>
    sources.herdrReport(model, sessionName, effortDisplay, rc.value),
  ).catch(() => null);
  return dataframe;
}
