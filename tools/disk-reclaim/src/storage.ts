import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  assess,
  loadStorageHeadroom,
  measureStorage,
  type StorageMeasurement,
} from "../../shared/src/storage-headroom.ts";
import type { Headroom } from "./model.ts";

export function readHeadroom(
  options: { measure?: (path: string) => StorageMeasurement | null } = {},
): Headroom {
  const loaded = loadStorageHeadroom(
    resolve(import.meta.dir, "../../../agents/hooks/storage-headroom.toml"),
  );
  const drives: Headroom["drives"] = [];
  for (const drive of loaded.drives) {
    const path = resolve(drive.path);
    if (options.measure === undefined && !existsSync(path)) continue;
    const measurement = (options.measure ?? measureStorage)(path);
    if (measurement !== null)
      drives.push({
        label: drive.label,
        path,
        ...measurement,
        ...assess(drive, measurement),
      });
  }
  return { drives };
}
