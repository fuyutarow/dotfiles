import { dirname } from "node:path";
import type { Context } from "./targets/index.ts";
import type { createBuildsTarget } from "./targets/builds.ts";

export async function buildsAction<T>(
  request: { id: string; path: string; fingerprint: string },
  deps: {
    target: ReturnType<typeof createBuildsTarget>;
    context: Context;
    identity: (path: string) => Promise<string>;
    device: (path: string) => Promise<number>;
    measure: (path: string) => Promise<T>;
    fail: (message: string) => never;
  },
) {
  const candidates = await deps.target.plan(deps.context);
  const original = candidates.find(
    (c) => c.id === request.id && c.path === request.path,
  );
  if (original === undefined)
    return {
      verdict: "changed",
      reason: "candidate disappeared",
      effect: "none",
    };
  const current = await deps.target.recheck(original, deps.context);
  if (current === null)
    return {
      verdict: "changed",
      reason: "candidate disappeared or changed scope",
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
    return deps.fail("cannot measure mounted build via parent filesystem");
  const before = await deps.measure(request.path);
  if ((await deps.identity(request.path)) !== request.fingerprint)
    return {
      verdict: "changed",
      reason: "fingerprint changed",
      effect: "none",
    };
  const result = await deps.target.act(current, deps.context);
  const after = await deps.measure(request.path);
  return {
    verdict: result.ok ? "completed" : "failed",
    reason: result.ok ? "build cleanup completed" : result.error,
    effect: "unlink",
    before,
    after,
    detail: result,
  };
}
