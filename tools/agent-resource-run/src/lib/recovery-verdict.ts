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

export type RecoveryVerdictAssessment = {
  kind: "allow" | "refuse" | "cancelled";
  signal?: "SIGINT" | "SIGTERM";
  message: string;
  state?: "ok" | "hold" | "emergency";
  recordedAtMs?: number;
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
  let state: "emergency" | "hold" | "ok" = "ok";
  if (verdict.memory_emergency) state = "emergency";
  else if (verdict.verdict === "HOLD") state = "hold";
  return {
    kind: blocked ? "refuse" : "allow",
    state,
    recordedAtMs,
    message: `RECOVER_VERDICT verdict=${verdict.verdict}${verdict.memory_emergency ? "+memory_emergency" : ""} age=${age} windows_available_mb=${memory}`,
  };
}

export async function readRecoveryVerdict(
  path = VERDICT_PATH,
): Promise<string | undefined> {
  return (await fromAsyncThrowable(() => readFile(path, "utf8"))()).unwrapOr(
    undefined,
  );
}

/** Once a HOLD is observed, only a fresh OK can release it. */
export async function waitForRecoveryVerdict(
  waitSeconds: number,
  options: {
    read?: () => Promise<string | undefined>;
    progress?: (line: string) => void;
    pollMs?: number;
  } = {},
): Promise<RecoveryVerdictAssessment> {
  const read = options.read ?? readRecoveryVerdict;
  const progress =
    options.progress ?? ((line: string) => process.stderr.write(`${line}\n`));
  const controller = new AbortController();
  const onInt = () => {
    controller.abort("SIGINT");
  };
  const onTerm = () => {
    controller.abort("SIGTERM");
  };
  process.on("SIGINT", onInt);
  process.on("SIGTERM", onTerm);
  using _signals = {
    [Symbol.dispose]: () => {
      process.off("SIGINT", onInt);
      process.off("SIGTERM", onTerm);
    },
  };
  let assessment = assessRecoveryVerdict(await read());
  if (assessment.state !== "hold") return assessment;
  const heldAt = assessment.recordedAtMs ?? 0;
  const start = performance.now();
  const deadline = start + waitSeconds * 1000;
  let last = assessment;
  while (true) {
    const next =
      last.recordedAtMs === undefined
        ? "unknown"
        : Temporal.Instant.fromEpochMilliseconds(
            last.recordedAtMs + 60_000,
          ).toString();
    progress(
      `WAIT fresh OK ${assessment.message} next_expected_estimate=${next} (timer 1min, accuracy 15s; service duration varies)`,
    );
    if (controller.signal.aborted) {
      const detail = assessRecoveryVerdict(await read());
      return {
        kind: "cancelled",
        signal: controller.signal.reason === "SIGTERM" ? "SIGTERM" : "SIGINT",
        message: `WAIT cancelled ${detail.state === "hold" ? detail.message : last.message}; waited=${((performance.now() - start) / 1000).toFixed(3)}s`,
      };
    }
    const remaining = deadline - performance.now();
    if (remaining <= 0)
      return {
        kind: "refuse",
        message: `${assessment.message}; waited=${((performance.now() - start) / 1000).toFixed(3)}s`,
      };
    await new Promise<void>((resolve) => {
      const timer = setTimeout(
        done,
        Math.min(options.pollMs ?? 1000, remaining),
      );
      function done() {
        clearTimeout(timer);
        controller.signal.removeEventListener("abort", done);
        resolve();
      }
      controller.signal.addEventListener("abort", done, { once: true });
      if (controller.signal.aborted) done();
    });
    if (controller.signal.aborted) continue;
    assessment = assessRecoveryVerdict(await read());
    if (controller.signal.aborted) continue;
    if (assessment.state === "emergency") return assessment;
    if (
      assessment.state === "ok" &&
      (assessment.recordedAtMs ?? 0) >= heldAt &&
      performance.now() <= deadline
    )
      return assessment;
    if (performance.now() >= deadline)
      return {
        kind: "refuse",
        message: `${assessment.message}; waited=${((performance.now() - start) / 1000).toFixed(3)}s`,
      };
    if (assessment.state === "hold") last = assessment;
  }
}
