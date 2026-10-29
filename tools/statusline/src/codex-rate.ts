import { join } from "node:path";
import { err, ok, type Result } from "neverthrow";
import type {
  CodexAccountRate,
  CodexCreditMemo,
} from "@dotfiles/shared/src/codex-subscription-usage.ts";
import { CREDIT_DELTA_WINDOW_MS } from "@dotfiles/shared/src/codex-subscription-usage.ts";

export type CodexRate = CodexAccountRate;
/** Account limits are shared across sessions, including a newly opened empty session. */
export async function readCodexRate(
  root = join(process.env["HOME"] ?? "", ".codex", "sessions"),
  _session?: string,
  nowMs = Temporal.Now.instant().epochMilliseconds,
  creditMemo?: CodexCreditMemo,
): Promise<Result<CodexRate | undefined, string>> {
  const { readCodexSubscriptionUsage } =
    await import("@dotfiles/shared/src/codex-subscription-usage.ts");
  const result = await readCodexSubscriptionUsage(
    root,
    nowMs,
    7 * 24 * 60 * 60 * 1000,
    true,
  );
  if (
    result.rate === undefined &&
    result.reason === "Codex rollout read failed"
  )
    return err("codex rate unavailable");
  const rate = result.rate;
  if (
    creditMemo === undefined ||
    creditMemo.computedAt > nowMs ||
    creditMemo.baseline.at > nowMs - CREDIT_DELTA_WINDOW_MS
  )
    return ok(rate);
  const current = rate ?? { windows: [], mtimeMs: nowMs };
  return ok({
    ...current,
    creditMemo,
    ...(current.credits === undefined
      ? {}
      : {
          creditChange: {
            delta:
              Number(current.credits) - Math.round(creditMemo.baseline.balance),
            spanMs: CREDIT_DELTA_WINDOW_MS,
          },
        }),
  });
}
