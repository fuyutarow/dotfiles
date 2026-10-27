// Test-only isolation: keep real /proc data for this fixture's fake workloads,
// excluding unrelated host stalls and other test sessions' reservation receipts.
// Production has no proc-root environment override.
import { mock } from "bun:test";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { fromAsyncThrowable } from "neverthrow";

const readDirectory = fs.readdir;
const readFile = fs.readFile;
const openDirectory = fs.opendir;
const fakeProcRoot = process.env.AGENT_RESOURCE_TEST_PROC_ROOT;
const fakeProcReads = process.env.AGENT_RESOURCE_TEST_PROC_READS;
let fakeProcReadCount = 0;
await mock.module("node:fs/promises", () => ({
  ...fs,
  readdir: async (path: string) => {
    let mappedPath = path;
    if (fakeProcRoot !== undefined && path === "/proc")
      mappedPath = fakeProcRoot;
    else if (fakeProcRoot !== undefined && path.startsWith("/proc/"))
      mappedPath = join(fakeProcRoot, path.slice("/proc/".length));
    const entries = await readDirectory(mappedPath);
    if (path === "/proc" && fakeProcRoot !== undefined) {
      fakeProcReadCount += 1;
      if (fakeProcReads !== undefined)
        await Bun.write(fakeProcReads, String(fakeProcReadCount));
      return entries;
    }
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
  readFile: async (path: string, options?: BufferEncoding) => {
    const mappedPath =
      fakeProcRoot !== undefined &&
      path.startsWith("/proc/") &&
      !path.startsWith("/proc/self/")
        ? join(fakeProcRoot, path.slice("/proc/".length))
        : path;
    return readFile(mappedPath, options);
  },
  opendir: (path: string) => {
    const mappedPath =
      fakeProcRoot !== undefined && path.startsWith("/proc/")
        ? join(fakeProcRoot, path.slice("/proc/".length))
        : path;
    return openDirectory(mappedPath);
  },
}));
