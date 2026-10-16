const DEFAULT_PROGRESS_EVERY_S = 300;
const MAX_PROGRESS_EVERY_S = Math.floor(2_147_483_647 / 1000);

/** Progress messages default to one every five minutes; invalid overrides keep that default. */
export function progressIntervalMs(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.AGX_PROGRESS_EVERY_S;
  if (raw === undefined) return DEFAULT_PROGRESS_EVERY_S * 1000;
  const seconds = Number(raw);
  return Number.isInteger(seconds) &&
    seconds > 0 &&
    seconds <= MAX_PROGRESS_EVERY_S
    ? seconds * 1000
    : DEFAULT_PROGRESS_EVERY_S * 1000;
}

/** A shared clock gate for separate wait loops, with no catch-up burst after a delayed tick. */
export function progressThrottle(
  intervalMs: number,
  clock: () => number = () => performance.now(),
): () => boolean {
  let lastReportedAt: number | undefined;
  return () => {
    const current = clock();
    if (lastReportedAt !== undefined && current - lastReportedAt < intervalMs)
      return false;
    lastReportedAt = current;
    return true;
  };
}
