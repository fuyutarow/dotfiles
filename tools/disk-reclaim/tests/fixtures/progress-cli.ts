// Fixture binary: real parser/output with forty injected same-uid permission failures.
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { main } from "../../src/reclaim.ts";
import { collectProcesses } from "../../src/lib/procs.ts";
import { candidate } from "./fake-target.ts";
import { procFixture } from "./procs.ts";
import type { Target } from "../../src/targets/index.ts";

const root = process.env["RECLAIM_FIXTURE_ROOT"];
if (root === undefined) process.exit(2);
const denied = Array.from({ length: 40 }, (_, i) => `fd/${i + 10}`);
const fixture = procFixture(root, "worker", denied);
for (const fd of denied) symlinkSync("/elsewhere", join(fixture.base, fd));
const targets: Target[] = ["probe", "peer"].map((name) => ({
  name,
  tier: "blind",
  available: () => ({ available: true, skip_reason: null }),
  plan: async (ctx) => {
    ctx.reportActivity?.(name, "waiting for process inventory");
    if (process.env["RECLAIM_FIXTURE_ERROR"] === "1")
      return [candidate(name), candidate(name)];
    await Bun.sleep(process.env["RECLAIM_FIXTURE_SLOW"] === "1" ? 10000 : 150);
    const snapshot = collectProcesses({
      procRoot: fixture.procRoot,
      fs: fixture.fs,
      ...(ctx.reportProcessFailures === undefined
        ? {}
        : { diagnostics: ctx.reportProcessFailures }),
    });
    return [
      {
        ...candidate(name, "ASK"),
        reason: `process state unreadable: ${snapshot.openPaths(root).unknown.join("; ")}`,
      },
    ];
  },
  act: () => ({ ok: false, bytes_freed: null, error: "read-only fixture" }),
}));
if (process.env["RECLAIM_FIXTURE_ABORT"] === "1")
  setTimeout(() => {
    process.kill(process.pid, "SIGINT");
  }, 200);
process.exit(await main(undefined, targets));
