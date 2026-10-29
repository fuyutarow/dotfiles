import { statfs } from "node:fs/promises";

export async function measureToolchain(path: string) {
  const s = await statfs(path);
  return {
    time: Temporal.Now.instant().toString(),
    source: "statfs",
    mount: null,
    filesystem: null,
    available_bytes: s.bavail * s.bsize,
    free_inodes: s.ffree,
    error: null,
  };
}
