import { attempt } from "../../shared/src/attempt.ts";
import {
  writeFleetSession,
  type FleetSession,
  type FleetSessionUnavailable,
} from "../../shared/src/fleet-session.ts";
import type { SessionStatus } from "./session-status.ts";
import { agentNameAsync } from "./identity.ts";

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

async function sessionName(
  vendor: Vendor,
  sessionId: string,
  hint: string | undefined,
  resolvedName: string | undefined,
) {
  if (vendor === "codex")
    return unavailable("Codex rollout has no addressable agent name");
  if (resolvedName !== undefined && resolvedName !== "") return resolvedName;
  if (process.env.HERDR_ENV !== "1")
    return unavailable(
      "Claude name lookup is not enabled outside Herdr sessions",
    );
  const result = await agentNameAsync(sessionId, hint);
  if (result.isErr()) return unavailable(result.error);
  return availableText(
    result.value,
    "Claude agent name is not listed for this session",
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
  resolvedName?: string,
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
    const name = await sessionName(
      vendor,
      sessionId,
      session.sessionName,
      resolvedName,
    );
    const paneId = process.env.TMUX_PANE;
    const record: FleetSession = {
      schema: 1,
      session_id: sessionId,
      vendor,
      // Claude passes the same resolved name used by the statusline's Session identity line.
      name,
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
