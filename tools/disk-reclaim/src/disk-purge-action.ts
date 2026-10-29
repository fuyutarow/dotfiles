import type { RemoveTreeResult } from "./lib/remove-tree.ts";
import { cleanAction } from "./disk-clean-action.ts";
import { z } from "@dotfiles/shared/src/zod.ts";

type Dependencies<T> = Parameters<typeof cleanAction<T>>[1];

export async function purgeAction<T>(
  request: { id: string; path: string; fingerprint: string },
  deps: Dependencies<T>,
) {
  const removals: RemoveTreeResult[] = [];
  const action = await cleanAction(request, {
    ...deps,
    context: {
      ...deps.context,
      reportRemoval: (result) => {
        removals.push(result);
      },
    },
  });
  const refused = removals.flatMap((result) => result.refused);
  const errors = removals.flatMap((result) => result.errors);
  if (refused.length === 0 && errors.length === 0) return action;
  const noRemoval = removals.every((result) => result.entries_removed === 0);
  const actionDetail = z
    .looseObject({ detail: z.unknown().optional() })
    .safeParse(action);
  return {
    ...action,
    verdict: noRemoval && errors.length === 0 ? "keep" : "failed",
    effect: noRemoval ? "none" : "unlink",
    reason: [
      ...refused.map((item) => `${item.path}: ${item.reason}`),
      ...errors.map((item) => `${item.path}: ${item.error}`),
    ].join("; "),
    detail: {
      result: actionDetail.success ? (actionDetail.data.detail ?? null) : null,
      refused,
      errors,
    },
  };
}
