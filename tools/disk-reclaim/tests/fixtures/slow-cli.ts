import { appendFileSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fromAsyncThrowable } from "neverthrow";
import type { Target } from "../../src/targets/index.ts";
import { main } from "../../src/reclaim.ts";
import { createLivenessSnapshot } from "../../src/liveness/facts.ts";

const procRoot = process.env.RECLAIM_UNIT_PROC_ROOT;
const ready = process.env.RECLAIM_SLOW_READY;
if (procRoot === undefined || ready === undefined) process.exit(2);
mkdirSync(dirname(ready), { recursive: true });
const itemPaths = [process.env.RECLAIM_ITEM_ONE, process.env.RECLAIM_ITEM_TWO];
const log = process.env.RECLAIM_ACT_LOG;
const target: Target = {
  name: "slow",
  tier: "blind",
  available: () => ({ available: true, skip_reason: null }),
  plan: async (ctx) => {
    if (process.env.RECLAIM_CANCEL_MODE === "delete")
      return itemPaths.flatMap((path, index) =>
        path === undefined
          ? []
          : [
              {
                id: `item-${index + 1}`,
                path,
                verdict: "RECLAIM" as const,
                reason: "fixture deletion",
                checks: [{ name: "fixture", ok: true, detail: "fixture" }],
                bytes: 1,
                bytes_kind: "estimate" as const,
                action: { kind: "delete" as const, argv: [path] },
                result: null,
              },
            ],
      );
    writeFileSync(ready, "scanning\n");
    const child = Bun.spawn(
      [process.execPath, "-e", "await Bun.sleep(30000)"],
      {
        stdout: "ignore",
        stderr: "ignore",
        ...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
      },
    );
    writeFileSync(`${ready}.pid`, `${child.pid}\n`);
    await child.exited;
    return [];
  },
  act: async (candidate) => {
    if (log === undefined || candidate.path === null)
      return { ok: false, bytes_freed: null, error: "fixture path missing" };
    appendFileSync(log, `${candidate.id}:start\n`);
    await Bun.sleep(500);
    unlinkSync(candidate.path);
    appendFileSync(log, `${candidate.id}:done\n`);
    return { ok: true, bytes_freed: 1, error: null };
  },
};
const args =
  process.env.RECLAIM_CANCEL_MODE === "delete"
    ? ["run", "slow", "--yes"]
    : ["plan", "slow", "--json"];
const result = await fromAsyncThrowable(() =>
  main(args, [target], {
    captureLiveness: (config) =>
      createLivenessSnapshot(config, { procs: { procRoot } }),
  }),
)();
if (result.isErr()) process.stderr.write(`fixture: ${String(result.error)}\n`);
process.exit(result.isOk() ? result.value : 2);
