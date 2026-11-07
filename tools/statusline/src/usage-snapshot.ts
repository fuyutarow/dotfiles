import type { Dataframe } from "./dataframe.ts";
import {
  subscriptionUsagePath,
  SubscriptionUsageSnapshotSchema,
  type SubscriptionUsageSnapshot,
  type SubscriptionUsageWindow,
} from "@dotfiles/shared/src/subscription-usage.ts";
import { readJsonAsync, writeCacheAsync } from "./bounded.ts";
import { acquireSamplerLock } from "./sampler-lock.ts";

type RateFacts = Pick<
  Dataframe,
  "rl5" | "rl5Reset" | "rl7" | "rl7Reset" | "codexRate"
>;

const FIVE_HOURS = 5 * 60 * 60;
const SEVEN_DAYS = 7 * 24 * 60 * 60;
type WindowUsage = {
  used_percent: number;
  resets_at: number | null;
  window_seconds: number;
  measured_at: number;
};

function windowUsage(
  usedPercent: number | undefined,
  resetsAt: number | undefined,
  windowSeconds: number,
  measuredAt: number,
): WindowUsage | undefined {
  let usage: WindowUsage | undefined;
  if (usedPercent !== undefined && Number.isFinite(usedPercent))
    usage = {
      used_percent: usedPercent,
      resets_at:
        resetsAt !== undefined && Number.isFinite(resetsAt) ? resetsAt : null,
      window_seconds: windowSeconds,
      measured_at: measuredAt,
    };
  return usage;
}

const newest = (
  current: SubscriptionUsageWindow | undefined,
  prior: SubscriptionUsageWindow | undefined,
) =>
  current === undefined ||
  (prior !== undefined && prior.measured_at > current.measured_at)
    ? prior
    : current;

/** Persist the subscription facts already consumed by the statusline renderers. */
function usageSnapshot(
  facts: RateFacts,
  nowSeconds: number,
): SubscriptionUsageSnapshot {
  const codexWeek = facts.codexRate?.windows.find(
    (window) => window.minutes === SEVEN_DAYS / 60,
  );
  const codexWindow =
    codexWeek === undefined
      ? undefined
      : windowUsage(
          codexWeek.percent,
          codexWeek.reset,
          codexWeek.minutes * 60,
          facts.codexRate?.mtimeMs ?? nowSeconds * 1000,
        );
  return {
    version: 1,
    routes: {
      claude: {
        "5h": windowUsage(
          facts.rl5,
          facts.rl5Reset,
          FIVE_HOURS,
          nowSeconds * 1000,
        ),
        "7d": windowUsage(
          facts.rl7,
          facts.rl7Reset,
          SEVEN_DAYS,
          nowSeconds * 1000,
        ),
      },
      codex: { "7d": codexWindow },
    },
  };
}

/** Serialize read/merge/write across the timer and concurrent Claude invocations. */
export async function writeUsageSnapshotAsync(
  facts: RateFacts,
  nowSeconds: number,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const path = subscriptionUsagePath(env);
  const next = usageSnapshot(facts, nowSeconds);
  if (
    next.routes.claude["5h"] === undefined &&
    next.routes.claude["7d"] === undefined &&
    next.routes.codex["7d"] === undefined
  )
    return;
  let lock: AsyncDisposable | undefined;
  for (let attempt = 0; attempt < 50 && lock === undefined; attempt++) {
    lock = await acquireSamplerLock(`${path}.lock`).catch(() => void 0);
    if (lock === undefined) await Bun.sleep(10);
  }
  if (lock === undefined) return;
  await using _lock = lock;
  const previous = await readJsonAsync(path, SubscriptionUsageSnapshotSchema);
  await writeCacheAsync(path, {
    version: 1,
    routes: {
      claude: {
        "5h": newest(next.routes.claude["5h"], previous?.routes.claude["5h"]),
        "7d": newest(next.routes.claude["7d"], previous?.routes.claude["7d"]),
      },
      codex: {
        "7d": newest(next.routes.codex["7d"], previous?.routes.codex["7d"]),
      },
    },
  });
}
