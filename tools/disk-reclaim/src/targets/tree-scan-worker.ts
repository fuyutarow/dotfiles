import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

declare var self: Worker;

self.addEventListener("message", (event: MessageEvent<{ path: string }>) => {
  let entries = 0;
  let bytes = 0;
  const visit = async (entry: string): Promise<void> => {
    const stat = await lstat(entry);
    entries++;
    bytes += stat.blocks * 512;
    if (entries % 128 === 0)
      self.postMessage({ kind: "progress", entries, bytes }, []);
    if (stat.isDirectory() && !stat.isSymbolicLink())
      for (const name of await readdir(entry)) await visit(join(entry, name));
  };
  visit(event.data.path).then(
    () => {
      self.postMessage({ kind: "done", entries, bytes }, []);
    },
    (error: unknown) => {
      self.postMessage({ kind: "error", message: String(error) }, []);
    },
  );
});
