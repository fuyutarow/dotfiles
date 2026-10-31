import { access } from "node:fs/promises";
import { resolve } from "node:path";
import {
  assess,
  loadStorageHeadroom,
  measureStorage,
  type StorageMeasurement,
} from "@dotfiles/shared/src/storage-headroom.ts";
import type { Headroom } from "./model.ts";

export async function readHeadroom(
  options: { measure?: (path: string) => StorageMeasurement | null } = {},
): Promise<Headroom> {
  const loaded = loadStorageHeadroom(
    resolve(import.meta.dir, "../../../agents/hooks/storage-headroom.toml"),
  );
  const drives: Headroom["drives"] = [];
  for (const drive of loaded.drives) {
    const path = resolve(drive.path);
    const exists =
      options.measure !== undefined ||
      (await access(path).then(
        () => true,
        () => false,
      ));
    if (!exists) continue;
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
