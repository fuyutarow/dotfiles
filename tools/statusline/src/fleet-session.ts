import { attempt } from "../../shared/src/attempt.ts";
import {
  writeFleetSession,
  type FleetSession,
  type FleetSessionUnavailable,
} from "../../shared/src/fleet-session.ts";
import type { SessionStatus } from "./session-status.ts";

type Vendor = FleetSession["vendor"];
type Unavailable = FleetSessionUnavailable;

const unavailable = (why: string): Unavailable => ({ na: true, why });

function availableText(value: string | undefined, why: string) {
  if (value === undefined || value === "") return unavailable(why);
  return value;
}

function availablePct(value: number | undefined, why: string) {
  if (
    value === undefined ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  )
    return unavailable(why);
  return value;
}

function isoFromEpochSeconds(value: number | undefined, why: string) {
  if (value === undefined || !Number.isFinite(value)) return unavailable(why);
  return Temporal.Instant.fromEpochMilliseconds(value * 1000).toString();
}

function sessionName(vendor: Vendor) {
  if (vendor === "codex")
    return unavailable("Codex rollout has no addressable agent name");
  return unavailable(
    "Claude session name is not available in the statusline payload",
  );
}

function sessionRate(
  vendor: Vendor,
  fiveHourPct: number | undefined,
  sevenDayPct: number | undefined,
  fiveHourReset: number | undefined,
  sevenDayReset: number | undefined,
) {
  if (vendor === "codex")
    return unavailable(
      "Codex rate limits are not in the selected rollout status",
    );
  const five = availablePct(
    fiveHourPct,
    "Claude 5-hour rate percentage is not available",
  );
  const seven = availablePct(
    sevenDayPct,
    "Claude 7-day rate percentage is not available",
  );
  const fiveReset = isoFromEpochSeconds(
    fiveHourReset,
    "Claude 5-hour rate reset is not available",
  );
  const sevenReset = isoFromEpochSeconds(
    sevenDayReset,
    "Claude 7-day rate reset is not available",
  );
  if (
    typeof five !== "number" ||
    typeof seven !== "number" ||
    typeof fiveReset !== "string" ||
    typeof sevenReset !== "string"
  )
    return unavailable(
      "Claude rate percentages and reset times are not all available",
    );
  return {
    five_h_pct: five,
    seven_d_pct: seven,
    resets: `5h=${fiveReset};7d=${sevenReset}`,
  };
}

export async function writeStatuslineFleetSession(
  session: SessionStatus,
  vendor: Vendor,
): Promise<void> {
  const sessionId = session.sessionId;
  if (sessionId === undefined || sessionId === "") return;

  await attempt(async () => {
    const context = session.context;
    let ctx: FleetSession["ctx"];
    if (
      context?.inputTokens !== undefined &&
      Number.isInteger(context.inputTokens) &&
      context.inputTokens >= 0 &&
      context.usedPercent !== undefined &&
      Number.isFinite(context.usedPercent) &&
      context.usedPercent >= 0 &&
      context.usedPercent <= 100
    ) {
      ctx = { tokens: context.inputTokens, pct: context.usedPercent };
    } else {
      ctx = unavailable("context tokens and percentage are not both available");
    }

    const rate = sessionRate(
      vendor,
      session.rateLimits?.fiveHour?.usedPercent,
      session.rateLimits?.sevenDay?.usedPercent,
      session.rateLimits?.fiveHour?.resetsAt,
      session.rateLimits?.sevenDay?.resetsAt,
    );
    const paneId = process.env.TMUX_PANE;
    const record: FleetSession = {
      schema: 1,
      session_id: sessionId,
      vendor,
      // session_name is only a display hint; the statusline payload does not provide the
      // addressable Claude agent name, and resolving it would spawn a subprocess per render.
      name: sessionName(vendor),
      model: availableText(
        session.model?.name,
        "model display name is not available",
      ),
      effort: availableText(
        session.effort,
        "reasoning effort is not available",
      ),
      ctx,
      rate,
      cwd: session.cwd ?? process.env.PWD ?? process.cwd(),
      pane_id: paneId ?? null,
      updated_at: Temporal.Now.instant().toString(),
    };
    await writeFleetSession(record);
  });
}
