import { dirname } from "node:path";
import type { Context, Target } from "./targets/index.ts";
import { revalidateClean } from "./disk-clean-safety.ts";

export async function cleanPreflight<T>(
  request: { id: string; path: string; fingerprint: string },
  deps: {
    target: Target;
    context: Context;
    identity: (path: string) => Promise<string>;
    protection: (path: string) => string | null | Promise<string | null>;
    device: (path: string) => Promise<number>;
    measure: (path: string) => Promise<T>;
    fail: (message: string) => never;
    completedReason?: string;
  },
) {
  const candidates = await deps.target.plan(deps.context);
  const checked = await revalidateClean(
    candidates,
    request,
    deps.identity,
    deps.protection,
  );
  if (checked.candidate === null)
    return { verdict: checked.verdict, reason: checked.reason, effect: "none" };
  if (
    (await deps.device(request.path)) !==
    (await deps.device(dirname(request.path)))
  )
    return deps.fail("cannot measure mounted cache via parent filesystem");
  const before = await deps.measure(request.path);
  return {
    verdict: "safe" as const,
    reason: checked.candidate.reason,
    effect: "none" as const,
    candidate: checked.candidate,
    before,
    context: deps.context,
  };
}

export async function cleanAction<T>(
  request: Parameters<typeof cleanPreflight<T>>[0],
  deps: Parameters<typeof cleanPreflight<T>>[1],
) {
  const checked = await cleanPreflight(request, deps);
  if (checked.candidate === undefined || checked.context === undefined)
    return checked;
  const { candidate, before, context } = checked;
  const result = await deps.target.act(candidate, context);
  const after = await deps.measure(request.path);
  return {
    verdict: result.ok ? "completed" : "failed",
    reason: result.ok
      ? (deps.completedReason ?? "cache cleanup completed")
      : result.error,
    effect: "unlink",
    before,
    after,
    detail: result,
  };
}
