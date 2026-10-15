import {
  readSubscriptionUsageSnapshot,
  type SubscriptionUsageWindow,
} from "../../../shared/src/subscription-usage.ts";

const MAX_AGE_MS = 15 * 60 * 1000;

export type WindowUsageState = {
  used_percent: number | null;
  resets_at: number | null;
  window_seconds: number;
  elapsed_fraction: number | null;
  pace: number | null;
  status: "fresh" | "stale" | "unknown";
};
export type RouteUsageState = {
  available: boolean;
  usage_status: "fresh" | "stale" | "unknown";
  preference: "pace" | "neutral";
  windows: Record<string, WindowUsageState>;
};
export type RouteUsage = Readonly<{
  claude: RouteUsageState;
  codex: RouteUsageState;
}>;

const EMPTY_WINDOWS = {
  claude: { "5h": 5 * 60 * 60, "7d": 7 * 24 * 60 * 60 },
  codex: { "7d": 7 * 24 * 60 * 60 },
} satisfies Record<"claude" | "codex", Record<string, number>>;

function assessWindow(
  source: SubscriptionUsageWindow | undefined,
  expectedSeconds: number,
  nowMs: number,
): WindowUsageState {
  if (source === undefined)
    return {
      used_percent: null,
      resets_at: null,
      window_seconds: expectedSeconds,
      elapsed_fraction: null,
      pace: null,
      status: "unknown",
    };
  const stale =
    nowMs < source.measured_at || nowMs - source.measured_at > MAX_AGE_MS;
  if (stale || (source.resets_at !== null && source.resets_at * 1000 <= nowMs))
    return {
      used_percent: source.used_percent,
      resets_at: source.resets_at,
      window_seconds: source.window_seconds,
      elapsed_fraction: null,
      pace: null,
      status: "stale",
    };
  if (source.used_percent === null || source.resets_at === null)
    return {
      used_percent: source.used_percent,
      resets_at: source.resets_at,
      window_seconds: source.window_seconds,
      elapsed_fraction: null,
      pace: null,
      status: "unknown",
    };
  const nowSeconds = nowMs / 1000;
  const elapsedFraction = Math.max(
    0,
    Math.min(
      1,
      (nowSeconds - (source.resets_at - source.window_seconds)) /
        source.window_seconds,
    ),
  );
  return {
    used_percent: source.used_percent,
    resets_at: source.resets_at,
    window_seconds: source.window_seconds,
    elapsed_fraction: elapsedFraction,
    pace: source.used_percent / 100 - elapsedFraction,
    status: "fresh",
  };
}

function routeState(
  windows: Record<string, SubscriptionUsageWindow | undefined>,
  expected: Record<string, number>,
  nowMs: number,
): RouteUsageState {
  const assessed = Object.fromEntries(
    Object.entries(expected).map(([name, seconds]) => [
      name,
      assessWindow(windows[name], seconds, nowMs),
    ]),
  );
  const values = Object.values(assessed);
  let usageStatus: RouteUsageState["usage_status"] = "unknown";
  if (values.some((window) => window.status === "fresh")) usageStatus = "fresh";
  else if (values.some((window) => window.status === "stale"))
    usageStatus = "stale";
  const available = !values.some(
    (window) =>
      window.status !== "stale" &&
      window.used_percent !== null &&
      window.used_percent >= 100,
  );
  return {
    available,
    usage_status: usageStatus,
    preference: usageStatus === "fresh" ? "pace" : "neutral",
    windows: assessed,
  };
}

/** Convert the statusline-owned snapshot into the fresh, stale, or unknown route state Jev sees. */
export function readRouteUsage(
  nowMs = Temporal.Now.instant().epochMilliseconds,
): RouteUsage {
  const snapshot = readSubscriptionUsageSnapshot();
  const claude = snapshot?.routes.claude;
  const codex = snapshot?.routes.codex;
  return {
    claude: routeState(
      { "5h": claude?.["5h"], "7d": claude?.["7d"] },
      EMPTY_WINDOWS.claude,
      nowMs,
    ),
    codex: routeState({ "7d": codex?.["7d"] }, EMPTY_WINDOWS.codex, nowMs),
  };
}
