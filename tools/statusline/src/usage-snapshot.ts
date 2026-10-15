import type { Dataframe } from "./dataframe.ts";
import { writeSubscriptionUsageSnapshot } from "../../shared/src/subscription-usage.ts";

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

/** Persist the subscription facts already consumed by the statusline renderers. */
export function writeUsageSnapshot(
  facts: RateFacts,
  nowSeconds: number,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
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
  return writeSubscriptionUsageSnapshot(
    {
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
    },
    env,
  );
}
