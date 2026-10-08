import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  assess,
  loadStorageHeadroom,
  measureStorage,
  type Drive,
  type StorageMeasurement,
} from "../../shared/src/storage-headroom.ts";
type Headroom = {
  drives: {
    label: string;
    path: string;
    free: number;
    total: number | null;
    deny_line: number;
    warn_line: number | null;
    stop_line: number | null;
    state: "ok" | "warn" | "deny";
  }[];
};

export function headroom(
  options: {
    path?: string;
    policy?: string;
    measure?: (path: string) => StorageMeasurement | null;
    drives?: Drive[];
  } = {},
): { exit: number; headroom: Headroom; errors: string[] } {
  const loaded =
    options.drives === undefined
      ? loadStorageHeadroom(
          options.policy ??
            resolve(
              import.meta.dir,
              "../../../agents/hooks/storage-headroom.toml",
            ),
        )
      : { drives: options.drives, errors: [] };
  if (loaded.errors.length > 0)
    return { exit: 2, headroom: { drives: [] }, errors: loaded.errors };
  const measure = options.measure ?? measureStorage;
  const drives: Headroom["drives"] = [];
  const errors: string[] = [];
  // An explicit path uses guest policy on any filesystem, including external drives.
  const guest = loaded.drives.find((d) => d.path === "/");
  let selected = loaded.drives;
  if (options.path !== undefined)
    selected =
      guest === undefined
        ? []
        : [{ ...guest, label: options.path, path: resolve(options.path) }];
  if (selected.length === 0) errors.push("no guest drive policy for --path");
  for (const drive of selected) {
    const path = resolve(drive.path);
    if (
      options.path === undefined &&
      options.measure === undefined &&
      !existsSync(path)
    )
      continue;
    const measurement = measure(path);
    if (measurement === null) {
      errors.push(`cannot measure ${path}`);
      continue;
    }
    drives.push({
      label: drive.label,
      path,
      ...measurement,
      ...assess(drive, measurement),
    });
  }
  let exit = 0;
  if (drives.some((d) => d.state === "warn")) exit = 10;
  if (drives.some((d) => d.state === "deny")) exit = 11;
  if (errors.length > 0) exit = 2;
  return { exit, headroom: { drives }, errors };
}
