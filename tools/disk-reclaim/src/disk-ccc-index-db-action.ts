import { dirname } from "node:path";
import type { Context, Target } from "./targets/index.ts";

export async function cccIndexDbPreflight<T>(
  request: { id: string; path: string; fingerprint: string },
  deps: {
    target: Target;
    context: Context;
    identity: (path: string) => Promise<string>;
    device: (path: string) => Promise<number>;
    measure: (path: string) => Promise<T>;
    fail: (message: string) => never;
  },
) {
  let scanError: string | undefined;
  const context = {
    ...deps.context,
    reportPlanError: (error: string) => {
      scanError = error;
    },
  };
  const candidates = await deps.target.plan(context);
  if (scanError !== undefined) return deps.fail(scanError);
  const current = candidates.find(
    (c) => c.id === request.id && c.path === request.path,
  );
  if (current === undefined)
    return {
      verdict: "changed",
      reason: "candidate disappeared",
      effect: "none",
    };
  if (current.verdict !== "RECLAIM")
    return {
      verdict: current.verdict === "KEEP" ? "keep" : "unknown",
      reason: current.reason,
      effect: "none",
    };
  if (
    (await deps.device(request.path)) !==
    (await deps.device(dirname(request.path)))
  )
    return deps.fail("cannot measure mounted artifact via parent filesystem");
  const before = await deps.measure(request.path);
  if ((await deps.identity(request.path)) !== request.fingerprint)
    return {
      verdict: "changed",
      reason: "fingerprint changed",
      effect: "none",
    };
  return {
    verdict: "safe" as const,
    reason: current.reason,
    effect: "none" as const,
    candidate: current,
    before,
    context: context,
  };
}

export async function cccIndexDbAction<T>(
  request: Parameters<typeof cccIndexDbPreflight<T>>[0],
  deps: Parameters<typeof cccIndexDbPreflight<T>>[1],
) {
  const checked = await cccIndexDbPreflight(request, deps);
  if (checked.candidate === undefined || checked.context === undefined)
    return checked;
  const { candidate, before, context } = checked;
  const result = await deps.target.act(candidate, context);
  const after = await deps.measure(request.path);
  return {
    verdict: result.ok ? "completed" : "failed",
    reason: result.ok ? "index artifact removal completed" : result.error,
    effect: "unlink",
    before,
    after,
    detail: result,
  };
}
