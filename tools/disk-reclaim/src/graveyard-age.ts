import { statfs } from "node:fs/promises";
import { dirname } from "node:path";
import { Result } from "@dotfiles/shared/src/result.ts";
import { z } from "@dotfiles/shared/src/zod.ts";
import { loadCollectionPolicy } from "#src/policy.ts";

const GIB = 1024 ** 3;

export type GraveyardAgePolicy = {
  minimumAgeMinutes: number;
  undoWindowMinutes: number;
};

const errorCode = (error: unknown): string | undefined => {
  const parsed = z.object({ code: z.string().optional() }).safeParse(error);
  return parsed.success ? parsed.data.code : undefined;
};

async function filesystemAvailableBytes(
  path: string,
): Promise<Result<number, unknown>> {
  let probePath = path;
  while (true) {
    const currentPath = probePath;
    const measured = await Result.tryPromise({
      try: () => statfs(currentPath),
      catch: (e: unknown) => e,
    });
    if (measured.isOk())
      return Result.ok(measured.value.bavail * measured.value.bsize);
    const code = errorCode(measured.error);
    if (code !== "ENOENT" && code !== "ENOTDIR")
      return Result.err(measured.error);
    const parent = dirname(probePath);
    if (parent === probePath) return Result.err(measured.error);
    probePath = parent;
  }
}

/** Resolve expiry and undo ages from the declared policy and the graveyard filesystem. */
export async function loadGraveyardAgePolicy(
  graveyardPath: string,
  options?: {
    availableBytes?: (path: string) => number | Promise<number>;
    policyPath?: string;
  },
): Promise<Result<GraveyardAgePolicy, unknown>> {
  const loaded = await loadCollectionPolicy(options?.policyPath);
  if (loaded.isErr()) return Result.err(loaded.error);

  const probe = options?.availableBytes;
  const available =
    probe === undefined
      ? await filesystemAvailableBytes(graveyardPath)
      : await Result.tryPromise({
          try: () => Promise.resolve().then(() => probe(graveyardPath)),
          catch: (e: unknown) => e,
        });
  if (available.isErr()) return Result.err(available.error);
  const availableBytes = available.value;
  if (!Number.isFinite(availableBytes) || availableBytes < 0)
    return Result.err(
      new Error("graveyard available-bytes probe returned an invalid value"),
    );

  const minimumAgeMinutes = loaded.value.graveyardMinAgeMinutesAt(
    availableBytes / GIB,
  );
  if (minimumAgeMinutes < loaded.value.undoWindowMinutes)
    return Result.err(
      new Error("graveyard minimum age must not undercut its undo window"),
    );

  return Result.ok({
    minimumAgeMinutes,
    undoWindowMinutes: loaded.value.undoWindowMinutes,
  });
}
