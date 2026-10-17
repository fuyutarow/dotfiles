import { err, ok, Err, Ok, type Result } from "neverthrow";
import type { SessionStatus } from "./session-status.ts";
import type { Dataframe } from "./dataframe.ts";
import type { HostLoad } from "./host-load.ts";
import type { RouteScan } from "./dispatch-runs.ts";
import type { Admitted } from "./jobs.ts";
import type { DiskEntry } from "./storage.ts";
import type { ModelLimit } from "./rate-limits.ts";
import type { RcState } from "./identity.ts";
import { contextLabel, firstNonEmpty, modelName } from "./model-context.ts";
import type { readCodexRate } from "./codex-rate.ts";
import type { readJevUsage } from "./jev-usage.ts";
import type { RecoverHealth } from "./recover-health.ts";
import { ownerSources, type OwnerState } from "./owner-state.ts";
import { readCoreRuns } from "./core-runs.ts";

type IdentityFacts = {
  email: string | undefined;
  accountWhy: string | undefined;
  rlModel: ModelLimit[];
  modelCapsWhy: string | undefined;
  wfOn: boolean;
  workflowWhy?: string | undefined;
};
type WarningRead = Result<string | undefined, string> | string | undefined;
type HealthRead =
  | Result<RecoverHealth | undefined, string>
  | RecoverHealth
  | undefined;
function warningPatch(
  value: WarningRead,
): Pick<Dataframe, "dispatchWarning" | "dispatchWarningWhy"> {
  if (value === undefined || typeof value === "string")
    return { dispatchWarning: value, dispatchWarningWhy: undefined };
  return {
    dispatchWarning: value.unwrapOr(undefined),
    dispatchWarningWhy: value.isErr() ? value.error : undefined,
  };
}
function healthPatch(
  value: HealthRead,
): Pick<Dataframe, "recoverHealth" | "recoverHealthWhy"> {
  if (value instanceof Ok || value instanceof Err)
    return {
      recoverHealth: value.unwrapOr(undefined),
      recoverHealthWhy: value.isErr() ? value.error : undefined,
    };
  return { recoverHealth: value, recoverHealthWhy: undefined };
}
export type Sources = {
  identity: () => Promise<IdentityFacts>;
  agentName: (
    sid: string,
    hint?: string,
  ) => Promise<Result<string | undefined, string>>;
  rcState: () => Promise<RcState>;
  repoState: (cwd: string) => Promise<{
    branch: string | undefined;
    branchWhy: string | undefined;
    workspace?: string | undefined;
    add?: number | undefined;
    del?: number | undefined;
  }>;
  jobScan: () => Promise<{
    jobs: Admitted[];
    orphans: number;
    failed?: string | undefined;
  }>;
  hostLoad: () => Promise<Omit<HostLoad, "disks">>;
  routes: (
    sessionId?: string,
    cwd?: string,
  ) => Promise<Result<RouteScan, string> | undefined>;
  dispatchWarning: () => Promise<WarningRead>;
  storage: () => Promise<Result<DiskEntry[], string>>;
  herdrReport: (
    model: string,
    sessionName?: string,
    effort?: string,
    rc?: RcState,
  ) => Promise<void>;
  codexRate: () => ReturnType<typeof readCodexRate>;
  jevUsage: () => ReturnType<typeof readJevUsage>;
  recoverHealth: () => Promise<HealthRead>;
};
export interface BuildDataframeOptions {
  ownerSnapshot?: Promise<OwnerState | undefined>;
  fieldStoreRoot?: string;
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
  onLate?: (value: T) => Promise<void>,
): Promise<Outcome<T>> {
  const started = clock.now();
  let cancel: (() => void) | undefined;
  let missedBudget = false;
  const timedOut = new Promise<Outcome<T>>((resolve) => {
    cancel = clock.timeout(() => {
      missedBudget = true;
      resolve({ ok: false, why: `${name} timeout ${budgetMs}ms` });
    }, budgetMs);
  });
  const pending = Promise.resolve()
    .then(source)
    .then(
      (value): Outcome<T> => {
        if (missedBudget || clock.now() - started >= budgetMs) {
          void onLate?.(value).catch(() => null);
          return { ok: false, why: `${name} timeout ${budgetMs}ms` };
        }
        return { ok: true, value };
      },
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
// Build facts within source budgets, then resolve each display field against its last-good store.
export async function buildDataframe(
  data: SessionStatus,
  options: BuildDataframeOptions = {},
): Promise<Dataframe> {
  // || (not ??): an empty cwd string must ALSO fall through to PWD, matching the old sh's
  // `[ -n "$cwd" ] || cwd=$PWD` guard — "" is never a real working directory.
  const cwdCandidate = firstNonEmpty(
    data.cwd,
    process.env.PWD ?? process.cwd(),
  );
  const cwd = cwdCandidate;
  const sid =
    data.sessionId !== undefined && data.sessionId !== ""
      ? data.sessionId
      : undefined; // "" is not an id either
  const sessionNameHint =
    data.sessionName !== undefined && data.sessionName !== ""
      ? data.sessionName
      : undefined;
  const owner = ownerSources(options.ownerSnapshot);
  const sources = { ...owner, ...options.sources };
  const bounded = <T>(
    name: string,
    budgetMs: number,
    source: () => Promise<T>,
    onLate?: (value: T) => Promise<void>,
  ) =>
    options.sources === undefined ||
    (name === "dispatch" && options.sources.routes === undefined)
      ? source().then(
          (value): Outcome<T> => ({ ok: true, value }),
          (): Outcome<T> => ({ ok: false, why: name + " unavailable" }),
        )
      : runBounded(
          name,
          budgetMs,
          source,
          options.clock ?? SOURCE_CLOCK,
          onLate,
        );

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
  const ready = Promise.withResolvers<Dataframe>();
  // A late result publishes only its own fields, without changing the frame already returned.
  const publish = async (
    patch: Partial<Dataframe>,
    keys: readonly string[],
    prefix?: string,
  ) => {
    const frame = { ...(await ready.promise), ...patch };
    delete frame.fields;
    const { prepareDisplayFields } = await import("./display-fields.ts");
    await prepareDisplayFields(
      frame,
      options.fieldStoreRoot,
      (key) =>
        keys.includes(key) || (prefix !== undefined && key.startsWith(prefix)),
      options.codex,
    );
  };
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
      (value) =>
        publish(
          {
            email: value.email,
            accountWhy: value.accountWhy,
            rlModel: value.rlModel,
            modelCapsWhy: value.modelCapsWhy,
            wfOn: value.wfOn && effort === "xhigh",
            workflowWhy: value.workflowWhy,
          },
          ["account", "model-caps", "workflow"],
        ),
    ),
    bounded(
      "name",
      budget("agentName"),
      () =>
        sid === undefined
          ? Promise.resolve(ok<string | undefined, string>(undefined))
          : sources.agentName(sid, sessionNameHint),
      (value) =>
        publish(
          {
            sessionName: value.unwrapOr(undefined),
            sessionNameWhy: value.isErr() ? value.error : undefined,
          },
          ["name"],
        ),
    ),
    bounded("rc", budget("rcState"), sources.rcState, (rc) =>
      publish({ rc }, ["rc"]),
    ),
    bounded(
      "git",
      budget("repoState"),
      () => sources.repoState(cwd),
      (value) => publish(value, ["branch"]),
    ),
    bounded("process scan", budget("jobScan"), sources.jobScan, (value) =>
      publish(
        { jobs: value.jobs, orphans: value.orphans, jobScanWhy: value.failed },
        ["jobs"],
      ),
    ),
    bounded("host load", budget("hostLoad"), sources.hostLoad, (value) =>
      publish(value, ["cpu", "ram", "vram", "gpu", "tmpfs"], "tmp:"),
    ),
    bounded(
      "dispatch",
      budget("routes"),
      async (): Promise<Result<RouteScan, string> | undefined> =>
        options.sources?.routes === undefined
          ? ok(await readCoreRuns(process.env, sid, cwd))
          : sources.routes(sid, cwd),
      (routes) => publish({ routes }, ["agx"]),
    ),
    bounded(
      "dispatch warning",
      budget("dispatchWarning"),
      sources.dispatchWarning,
      (value) => publish(warningPatch(value), ["dispatch-warning"]),
    ),
    bounded("storage", budget("storage"), sources.storage, (disks) =>
      publish({ disks }, ["disks"], "disk:"),
    ),
    bounded("codex rate", budget("codexRate"), sources.codexRate, (value) =>
      publish(
        {
          codexRate: value.unwrapOr(undefined),
          codexRateWhy: value.isErr() ? value.error : undefined,
        },
        [],
        "codex:",
      ),
    ),
    bounded("Jev usage", budget("jevUsage"), sources.jevUsage, (value) =>
      publish(
        {
          jevUsage: value.unwrapOr(undefined),
          jevUsageWhy: value.isErr() ? value.error : undefined,
        },
        ["jev"],
      ),
    ),
    bounded(
      "recover health",
      budget("recoverHealth"),
      sources.recoverHealth,
      (value) => publish(healthPatch(value), ["recover"]),
    ),
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
      tmpfs: err("host load unavailable"),
    },
    "host load",
  );
  const routes = settled(routesResult, undefined, "dispatch");
  // Read the snapshot without vendor-session/progress enrichment after a live timeout.
  // This path also works on the first render, before the per-field store has been populated.
  if (
    routes.why !== undefined ||
    routes.value === undefined ||
    routes.value.isErr()
  ) {
    const snapshot = await readCoreRuns(process.env, sid, cwd);
    if (snapshot.snapshotWhy === undefined) {
      routes.value = ok({
        ...snapshot,
        snapshotAgeSecs: snapshot.snapshotAgeSecs,
      });
      routes.why = undefined;
    }
  }
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
  const warningFacts = warningPatch(warning.value);
  const healthFacts = healthPatch(recoverHealth.value);
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
    workflowWhy: identity.why ?? identity.value.workflowWhy,
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
    add: data.changes?.linesAdded ?? repo.value.add,
    del: data.changes?.linesRemoved ?? repo.value.del,
    workspace: repo.value.workspace,
    jobs,
    orphans,
    jobScanWhy: scan.why ?? scan.value.failed,
    routes: routes.why === undefined ? routes.value : err(routes.why),
    dispatchWarning: warningFacts.dispatchWarning,
    dispatchWarningWhy: warning.why ?? warningFacts.dispatchWarningWhy,
    recoverHealth: healthFacts.recoverHealth,
    recoverHealthWhy: recoverHealth.why ?? healthFacts.recoverHealthWhy,
    vram,
    disks,
    cpuPct: cpu,
    ram,
    tmpfs: host.value.tmpfs,
    tmp: host.value.tmp,
  };
  void bounded("herdr", budget("herdrReport"), () =>
    sources.herdrReport(model, sessionName, effortDisplay, rc.value),
  ).catch(() => null);
  if (options.fieldStoreRoot !== undefined) {
    const { prepareDisplayFields } = await import("./display-fields.ts");
    await prepareDisplayFields(
      dataframe,
      options.fieldStoreRoot,
      undefined,
      options.codex,
    );
  }
  if (options.fieldStoreRoot === undefined) {
    const snapshot = await owner.snapshot;
    const keys: Record<string, string> = {
      cpu: "cpuPct",
      ram: "ram",
      vram: "vram",
      gpu: "vram",
      tmpfs: "tmpfs",
      jobs: "jobScan",
      name: `name:${sid ?? ""}`,
      account: "identity",
      "model-caps": "identity",
      jev: "jevUsage",
      recover: "recoverHealth",
      "dispatch-warning": "dispatchWarning",
      disk: "storage",
      tmp: "tmp",
      codex: "codexRate",
    };
    dataframe.ownerAges = Object.fromEntries(
      Object.entries(keys).flatMap(([field, source]) => {
        const saved = snapshot?.fields[source];
        if (saved === undefined) return [];
        const age = Math.max(
          0,
          Temporal.Now.instant().epochMilliseconds - saved.at,
        );
        return saved.error !== undefined || age > 30_000 ? [[field, age]] : [];
      }),
    );
  }
  ready.resolve(dataframe);
  return dataframe;
}
