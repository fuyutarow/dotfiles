import { basename, join } from "node:path";
import { stat } from "node:fs/promises";
import { fromAsyncThrowable } from "neverthrow";
import { errorMessage } from "../../shared/src/attempt.ts";
import { z } from "../../shared/src/zod.ts";

export type WorkspacePlan =
  | { ok: true; name: string; path: string }
  | { ok: false; error: string };

async function workspacePathExists(
  path: string,
): Promise<{ ok: true; exists: boolean } | { ok: false; error: string }> {
  const result = await fromAsyncThrowable(
    () => stat(path),
    (error) => error,
  )();
  if (result.isOk()) return { ok: true, exists: true };
  const missing = z
    .object({ code: z.literal("ENOENT") })
    .safeParse(result.error);
  return missing.success
    ? { ok: true, exists: false }
    : { ok: false, error: errorMessage(result.error) };
}

/** Choose a dispatch workspace path and reject any reuse before jj can attach it. */
export async function planWorkspace(
  repoRoot: string,
  nameHint: string | undefined,
  timestamp = Temporal.Now.instant().toString(),
): Promise<WorkspacePlan> {
  const hintedName = nameHint?.trim();
  const name =
    hintedName !== undefined && hintedName.length > 0
      ? hintedName
      : `agx-${timestamp.replaceAll(/[^0-9]/gu, "").slice(0, 14)}`;
  if (!/^[A-Za-z0-9_-]+$/u.test(name))
    return {
      ok: false,
      error: "--workspace name must use letters, numbers, _ or -",
    };
  const workspaceName = `${basename(repoRoot)}-arm-${name}`;
  const path = join(repoRoot, "..", workspaceName);
  const existing = await workspacePathExists(path);
  if (!existing.ok)
    return {
      ok: false,
      error: `cannot check workspace path: ${existing.error}`,
    };
  if (existing.exists)
    return { ok: false, error: `workspace path already exists: ${path}` };
  return { ok: true, name: workspaceName, path };
}
