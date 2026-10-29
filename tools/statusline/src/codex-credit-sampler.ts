// The existing oneshot sampler alone refreshes history. Renders read its snapshot.
import { join } from "node:path";
import { readCodexRate } from "./codex-rate.ts";
import { codexCreditMemoFromSnapshot, type OwnerState } from "./owner-state.ts";
import {
  CREDIT_DELTA_WINDOW_MS,
  readCodexCreditBaseline,
  type CodexCreditMemo,
} from "@dotfiles/shared/src/codex-subscription-usage.ts";

export const CODEX_CREDIT_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
export const CODEX_CREDIT_REFRESH_BUDGET_MS = 5000;

/** Called once per sampler run, outside the 1,000 ms current-rate source. */
export async function sampleCodexRate(
  previous: OwnerState | undefined,
  root = join(process.env.HOME ?? "", ".codex", "sessions"),
  nowMs = Temporal.Now.instant().epochMilliseconds,
  refresh: (
    root: string,
    nowMs: number,
    signal: AbortSignal,
  ) => Promise<CodexCreditMemo | undefined> = readCodexCreditBaseline,
) {
  const prior = codexCreditMemoFromSnapshot(previous);
  let memo =
    prior !== undefined &&
    prior.computedAt <= nowMs &&
    prior.baseline.at <= nowMs - CREDIT_DELTA_WINDOW_MS
      ? prior
      : undefined;
  const fresh =
    memo !== undefined &&
    nowMs - memo.computedAt < CODEX_CREDIT_REFRESH_INTERVAL_MS;
  if (!fresh) {
    const signal = AbortSignal.timeout(CODEX_CREDIT_REFRESH_BUDGET_MS);
    const refreshed = await refresh(root, nowMs, signal).catch(() => null);
    if (!signal.aborted && refreshed !== undefined && refreshed !== null)
      memo = refreshed;
  }
  return readCodexRate(root, undefined, nowMs, memo);
}
