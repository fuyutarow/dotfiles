import {
  assess,
  loadStorageHeadroom,
  measureStorageUncached,
} from "../../shared/src/storage-headroom.ts";
import { statfs } from "node:fs/promises";
import { resolve } from "node:path";
import { fromAsyncThrowable } from "neverthrow";

export async function capacityProbe(path: string | undefined) {
  const measurement = path === undefined ? null : measureStorageUncached(path);
  const inode =
    path === undefined
      ? null
      : (
          await fromAsyncThrowable(async () => (await statfs(path)).ffree)()
        ).unwrapOr(null);
  const config = loadStorageHeadroom(
    resolve(import.meta.dir, "../../../agents/hooks/storage-headroom.toml"),
  );
  const drive = config.drives.find(
    (entry) => resolve(entry.path) === resolve(path ?? ""),
  );
  const assessment =
    drive === undefined || measurement === null
      ? null
      : assess(drive, measurement);
  process.stdout.write(
    `${JSON.stringify(measurement === null ? null : { ...measurement, free_inodes: inode, assessment, config_errors: config.errors })}\n`,
  );
}
