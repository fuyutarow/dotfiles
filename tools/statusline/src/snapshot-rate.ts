import {
  FleetSessionSchema,
  type FleetSession,
} from "@dotfiles/shared/src/fleet-session.ts";
import { fromThrowable } from "neverthrow";
import type { Dataframe } from "./dataframe.ts";
import { contextLabel } from "./model-context.ts";

type ClaudeRate = {
  fiveHour: number;
  fiveHourReset: number;
  sevenDay: number;
  sevenDayReset: number;
};

const instantEpoch = fromThrowable((value: string) =>
  Math.floor(Temporal.Instant.from(value).epochMilliseconds / 1000),
);

function resetEpochs(
  value: string,
): { fiveHour: number; sevenDay: number } | undefined {
  const parts = value.split(";");
  const fiveHour = parts[0];
  const sevenDay = parts[1];
  if (
    parts.length !== 2 ||
    fiveHour?.startsWith("5h=") !== true ||
    sevenDay?.startsWith("7d=") !== true
  )
    return undefined;

  const parsedFiveHour = instantEpoch(fiveHour.slice(3));
  const parsedSevenDay = instantEpoch(sevenDay.slice(3));
  if (parsedFiveHour.isErr() || parsedSevenDay.isErr()) return undefined;
  return {
    fiveHour: parsedFiveHour.value,
    sevenDay: parsedSevenDay.value,
  };
}

function fleetForSession(
  value: unknown,
  sessionId: string | undefined,
): FleetSession | undefined {
  const parsed = FleetSessionSchema.safeParse(value);
  if (
    !parsed.success ||
    sessionId === undefined ||
    parsed.data.session_id !== sessionId
  )
    return undefined;
  return parsed.data;
}

function fleetClaudeRate(
  session: FleetSession | undefined,
): ClaudeRate | undefined {
  if (session === undefined || session.vendor !== "claude") return undefined;
  const rateSchema = FleetSessionSchema.shape.rate.options[0];
  if (rateSchema === undefined) return undefined;
  const rate = rateSchema.safeParse(session.rate);
  if (!rate.success) return undefined;
  const resets = resetEpochs(rate.data.resets);
  if (resets === undefined) return undefined;
  return {
    fiveHour: rate.data.five_h_pct,
    fiveHourReset: resets.fiveHour,
    sevenDay: rate.data.seven_d_pct,
    sevenDayReset: resets.sevenDay,
  };
}

/** Fill missing Claude facts from this exact session's typed fleet record before core rendering. */
export function snapshotWithFleetFacts(
  frame: Dataframe,
  fleet: unknown,
): Dataframe {
  const session = fleetForSession(fleet, frame.sid);
  if (session === undefined) return frame;

  const contextSchema = FleetSessionSchema.shape.ctx.options[0];
  const context = contextSchema?.safeParse(session.ctx);
  const fleetContext = context?.success
    ? {
        tokens: contextLabel(context.data.tokens),
        pct: context.data.pct,
      }
    : undefined;
  const rate = fleetClaudeRate(session);
  const ctx = frame.ctx ?? fleetContext?.tokens;
  const ctxPct = frame.ctxPct ?? fleetContext?.pct;
  const rl5 = frame.rl5 ?? rate?.fiveHour;
  const rl5Reset = frame.rl5Reset ?? rate?.fiveHourReset;
  const rl7 = frame.rl7 ?? rate?.sevenDay;
  const rl7Reset = frame.rl7Reset ?? rate?.sevenDayReset;
  const contextChanged = frame.ctx === undefined && ctx !== undefined;
  const contextPercentChanged =
    frame.ctxPct === undefined && ctxPct !== undefined;
  const fiveHourChanged =
    rate !== undefined &&
    (frame.rl5 === undefined || frame.rl5Reset === undefined);
  const sevenDayChanged =
    rate !== undefined &&
    (frame.rl7 === undefined || frame.rl7Reset === undefined);
  if (
    !contextChanged &&
    !contextPercentChanged &&
    !fiveHourChanged &&
    !sevenDayChanged
  )
    return frame;

  const fields = frame.fields === undefined ? undefined : { ...frame.fields };
  if (fields !== undefined) {
    if (contextChanged) delete fields["context-tokens"];
    if (contextPercentChanged) delete fields["context-percent"];
    if (fiveHourChanged) delete fields["claude-5h"];
    if (sevenDayChanged) delete fields["claude-7d"];
    if (rate !== undefined) delete fields["claude-label"];
  }

  return {
    ...frame,
    ...(fields === undefined ? {} : { fields }),
    ctx,
    ctxPct,
    rl5,
    rl5Reset,
    rl7,
    rl7Reset,
  };
}
