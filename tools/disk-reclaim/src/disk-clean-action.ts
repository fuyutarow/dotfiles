import { dirname } from "node:path";
import type { Context, Target } from "./targets/index.ts";
import { revalidateClean } from "./disk-clean-safety.ts";

export async function cleanAction<T>(
  request: { id: string; path: string; fingerprint: string },
  deps: {
    target: Target;
    context: Context;
    identity: (path: string) => Promise<string>;
    protection: (path: string) => string | null;
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
  const result = await deps.target.act(checked.candidate, deps.context);
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
