// Test-only isolation: keep real /proc data for this fixture's fake workloads,
// excluding unrelated host stalls and other test sessions' reservation receipts.
// Production has no proc-root environment override.
import { mock } from "bun:test";
import * as fs from "node:fs/promises";
import { fromAsyncThrowable } from "neverthrow";

const readDirectory = fs.readdir;
const readFile = fs.readFile;
await mock.module("node:fs/promises", () => ({
  ...fs,
  readdir: async (path: string) => {
    const entries = await readDirectory(path);
    if (path !== "/proc") return entries;
    const runtime = process.env.XDG_RUNTIME_DIR;
    const selected = await Promise.all(
      entries.map(async (entry) => {
        if (!/^\d+$/u.test(entry)) return null;
        const env = await fromAsyncThrowable(() =>
          readFile(`/proc/${entry}/environ`, "utf8"),
        )();
        return env.isOk() &&
          env.value.split("\0").includes(`XDG_RUNTIME_DIR=${runtime}`)
          ? entry
          : null;
      }),
    );
    return selected.filter((entry) => entry !== null);
  },
}));
