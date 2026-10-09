export type Admission = Readonly<{ ok: true } | { ok: false; reason: string }>;

export function codexWorkerLimit(
  processLimit: string,
  override?: number,
): number | undefined {
  if (override !== undefined) return override;
  if (processLimit.trim().toLowerCase() === "unlimited") return undefined;
  const parsed = Number(processLimit.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.max(1, Math.floor((parsed - 100) / 130));
}

export type AdmissionDependencies = Readonly<{
  liveCodexWorkers: () => number;
  limit: number | undefined;
  waitMs: number;
  intervalMs: number;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  reportWait: (live: number, limit: number, waitedMs: number) => void;
}>;

/** Wait for an active codex marker slot, then refuse with the bound and live count. */
export async function admitCodexWorker(
  deps: AdmissionDependencies,
): Promise<Admission> {
  if (deps.limit === undefined) return { ok: true };
  const started = deps.now();
  while (true) {
    const live = deps.liveCodexWorkers();
    if (live < deps.limit) return { ok: true };
    const waitedMs = deps.now() - started;
    if (waitedMs >= deps.waitMs)
      return {
        ok: false,
        reason: `codex worker limit reached (${live}/${deps.limit}); waited ${Math.round(waitedMs / 1000)}s`,
      };
    deps.reportWait(live, deps.limit, waitedMs);
    await deps.sleep(Math.min(deps.intervalMs, deps.waitMs - waitedMs));
  }
}
