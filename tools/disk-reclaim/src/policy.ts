import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { err, ok, type Result } from "neverthrow";
import { attempt, errorMessage } from "../../shared/src/attempt.ts";
import { loadStorageHeadroom } from "../../shared/src/storage-headroom.ts";
import { z } from "../../shared/src/zod.ts";

const CacheRule = z
  .object({
    default_owner: z.string().min(1),
    ttl_days: z.number().positive(),
  })
  .strict();

const CollectionPolicyConfig = z
  .object({
    class_rules: z
      .object({
        ownerless_cache: CacheRule,
        deregistered_index_db: z
          .object({ ttl_days: z.number().positive() })
          .strict(),
      })
      .strict(),
  })
  .strict();

const ReclaimConfig = z
  .object({
    graveyard_min_age_hours: z.number().positive(),
    graveyard_pressure_undo_minutes: z.number().min(1),
    collection_policy: CollectionPolicyConfig,
  })
  .loose();

export class CollectionPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CollectionPolicyError";
  }
}

export type CollectionPolicy = {
  undoWindowMinutes: number;
  graveyardMinAgeHours: number;
  recoverHeadroomGiB: number;
  denyHeadroomGiB: number;
  stopFloorGiB: number;
  classRules: {
    ownerlessCache: { defaultOwner: string; ttlDays: number };
    deregisteredIndexDb: { ttlDays: number };
  };
  graveyardMinAgeMinutesAt(availableGiB: number): number;
};

const defaultPolicyPath = resolve(import.meta.dir, "../reclaim.toml");
const headroomPath = resolve(
  import.meta.dir,
  "../../../agents/hooks/storage-headroom.toml",
);

/** Load the declared collection policy and its authoritative drive thresholds. */
export async function loadCollectionPolicy(
  path: string = defaultPolicyPath,
): Promise<Result<CollectionPolicy, CollectionPolicyError>> {
  const file = await attempt(() => readFile(path, "utf8"));
  if (!file.ok)
    return err(
      new CollectionPolicyError(
        `collection policy: cannot read ${path}: ${errorMessage(file.error)}`,
      ),
    );

  const toml = await attempt(() => Bun.TOML.parse(file.value));
  if (!toml.ok)
    return err(
      new CollectionPolicyError(
        `collection policy: invalid TOML in ${path}: ${errorMessage(toml.error)}`,
      ),
    );

  const parsed = ReclaimConfig.safeParse(toml.value);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const field =
        issue.path.length === 0
          ? "collection_policy"
          : issue.path.map(String).join(".");
      return `${field}: ${issue.message}`;
    });
    return err(new CollectionPolicyError(issues.join("; ")));
  }

  const headroom = loadStorageHeadroom(headroomPath);
  if (headroom.errors.length > 0)
    return err(
      new CollectionPolicyError(
        `storage-headroom: ${headroom.errors.join("; ")}`,
      ),
    );
  const guest = headroom.drives.find((drive) => drive.name === "guest");
  const host = headroom.drives.find((drive) => drive.name === "host");
  if (
    guest?.recover_gib === undefined ||
    guest.recover_gib <= guest.deny_gib ||
    host?.stop_gib === undefined
  ) {
    return err(
      new CollectionPolicyError(
        "storage-headroom: drive.guest requires recover_gib above deny_gib and drive.host requires stop_gib",
      ),
    );
  }

  const undoWindowMinutes = parsed.data.graveyard_pressure_undo_minutes;
  const graveyardMinAgeMinutes = parsed.data.graveyard_min_age_hours * 60;
  if (graveyardMinAgeMinutes < undoWindowMinutes)
    return err(
      new CollectionPolicyError(
        "graveyard_min_age_hours: must be at least graveyard_pressure_undo_minutes",
      ),
    );
  const recoverHeadroomGiB = guest.recover_gib;
  const denyHeadroomGiB = guest.deny_gib;
  const {
    ownerless_cache: ownerlessCache,
    deregistered_index_db: deregisteredIndexDb,
  } = parsed.data.collection_policy.class_rules;

  return ok({
    undoWindowMinutes,
    graveyardMinAgeHours: parsed.data.graveyard_min_age_hours,
    recoverHeadroomGiB,
    denyHeadroomGiB,
    stopFloorGiB: host.stop_gib,
    classRules: {
      ownerlessCache: {
        defaultOwner: ownerlessCache.default_owner,
        ttlDays: ownerlessCache.ttl_days,
      },
      deregisteredIndexDb: { ttlDays: deregisteredIndexDb.ttl_days },
    },
    graveyardMinAgeMinutesAt(availableGiB) {
      if (availableGiB >= recoverHeadroomGiB) return graveyardMinAgeMinutes;
      if (availableGiB <= denyHeadroomGiB) return undoWindowMinutes;
      const position =
        (availableGiB - denyHeadroomGiB) /
        (recoverHeadroomGiB - denyHeadroomGiB);
      return (
        undoWindowMinutes +
        (graveyardMinAgeMinutes - undoWindowMinutes) * position
      );
    },
  });
}
