import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fromAsyncThrowable, fromThrowable } from "neverthrow";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";

export const RECOVERY_VERDICT_MAX_AGE_MS = 5 * 60 * 1000;

const VERDICT_PATH = join(
  homedir(),
  ".local/state/wsl-capacity-recover/latest-verdict.json",
);

const RecoveryVerdictSchema = z.object({
  schema: z.literal(1),
  verdict: z.enum(["OK", "HOLD"]),
  memory_emergency: z.boolean(),
  windows_available_mb: z.number().int().nonnegative().nullable(),
  recorded_at: z.string(),
});

export type RecoveryVerdict = z.infer<typeof RecoveryVerdictSchema>;

export type RecoveryVerdictAssessment = {
  kind: "allow" | "refuse";
  message: string;
};

/** Missing or stale records are advisory; fresh unsafe records block admission. */
export function assessRecoveryVerdict(
  text: string | undefined,
  nowMs = Temporal.Now.instant().epochMilliseconds,
): RecoveryVerdictAssessment {
  if (text === undefined) {
    return {
      kind: "allow",
      message:
        "RECOVER_VERDICT verdict=missing age=unknown windows_available_mb=unknown",
    };
  }

  const parsed = jsonOf(RecoveryVerdictSchema).safeParse(text);
  if (!parsed.success) {
    return {
      kind: "allow",
      message:
        "RECOVER_VERDICT verdict=invalid age=unknown windows_available_mb=unknown",
    };
  }

  const verdict = parsed.data;
  const recordedAt = fromThrowable(() =>
    Temporal.Instant.from(verdict.recorded_at),
  )();
  const recordedAtMs = recordedAt.isOk()
    ? recordedAt.value.epochMilliseconds
    : Number.NaN;
  const ageMs = nowMs - recordedAtMs;
  const memory = verdict.windows_available_mb ?? "unknown";
  if (
    !Number.isFinite(recordedAtMs) ||
    ageMs < 0 ||
    ageMs > RECOVERY_VERDICT_MAX_AGE_MS
  ) {
    const age =
      Number.isFinite(ageMs) && ageMs >= 0
        ? `${Math.floor(ageMs / 1000)}s`
        : "unknown";
    return {
      kind: "allow",
      message: `RECOVER_VERDICT verdict=${verdict.verdict} age=${age} windows_available_mb=${memory} status=stale`,
    };
  }

  const age = `${Math.floor(ageMs / 1000)}s`;
  const blocked = verdict.verdict === "HOLD" || verdict.memory_emergency;
  return {
    kind: blocked ? "refuse" : "allow",
    message: `RECOVER_VERDICT verdict=${verdict.verdict}${verdict.memory_emergency ? "+memory_emergency" : ""} age=${age} windows_available_mb=${memory}`,
  };
}

export async function readRecoveryVerdict(): Promise<string | undefined> {
  return (
    await fromAsyncThrowable(() => readFile(VERDICT_PATH, "utf8"))()
  ).unwrapOr(undefined);
}
