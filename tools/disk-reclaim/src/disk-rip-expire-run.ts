import type { Context, Target } from "./targets/index.ts";
import type { Candidate } from "./model.ts";

export async function runRipExpiry(deps: {
  target: Target;
  context: Context;
  fingerprint: (path: string) => Promise<string>;
  measure: () => Promise<{
    time: string;
    source: string;
    mount: null;
    filesystem: null;
    available_bytes: number;
    free_inodes: number | null;
    error: null;
  }>;
  stopOnError: boolean;
}) {
  const { target, context } = deps;
  const candidates = await target.plan(context);
  const before = await deps.measure();
  const items = [];
  let stopped = false;
  for (const candidate of candidates) {
    const item: {
      id: string;
      target: string;
      path: string | null;
      verdict: string;
      reason: string;
      fingerprint: string | null;
      effect: string;
      logical_bytes: number | null;
      allocated_bytes: null;
      eligible_at: null;
      error: string | null;
      detail: { checks: Candidate["checks"]; action: unknown };
    } = {
      id: candidate.id,
      target: "rip-expire",
      path: candidate.path,
      verdict: "unknown",
      reason: candidate.reason,
      fingerprint: null,
      effect: "none",
      logical_bytes: null,
      allocated_bytes: null,
      eligible_at: null,
      error: null,
      detail: { checks: candidate.checks, action: null },
    };
    items.push(item);
    if (candidate.verdict === "KEEP") {
      item.verdict = "keep";
      continue;
    }
    if (candidate.verdict !== "RECLAIM" || candidate.path === null) {
      item.verdict = candidate.path === null ? "unknown" : "ask";
      continue;
    }
    if (stopped) {
      item.reason = "not attempted after earlier failure or yield";
      continue;
    }
    item.fingerprint = await deps.fingerprint(candidate.path);
    const checked = await target.recheck?.(candidate, context);
    if (checked === undefined || checked === null) {
      item.verdict = "changed";
      item.reason = "candidate no longer available";
      continue;
    }
    if (checked.verdict !== "RECLAIM") {
      item.verdict = checked.verdict === "KEEP" ? "keep" : "ask";
      item.reason = checked.reason;
      continue;
    }
    if ((await deps.fingerprint(candidate.path)) !== item.fingerprint) {
      item.verdict = "changed";
      item.reason = "payload changed during revalidation";
      continue;
    }
    item.effect = "unlink";
    const action = await target.act(checked, context);
    item.detail.action = action;
    item.logical_bytes = action.bytes_freed;
    item.verdict =
      action.ok && (action.skipped?.length ?? 0) === 0 ? "completed" : "failed";
    item.reason = action.ok
      ? "expiry completed"
      : (action.error ?? "expiry refused or failed");
    if ((action.skipped?.length ?? 0) > 0) {
      item.verdict = "partial";
      item.reason = "foreign-owned entries retained";
    }
    if (
      context.foregroundLockYielded?.() === true ||
      (deps.stopOnError && item.verdict !== "completed")
    )
      stopped = true;
  }
  await target.finish?.(context);
  const after = await deps.measure();
  return { items, before, after };
}
