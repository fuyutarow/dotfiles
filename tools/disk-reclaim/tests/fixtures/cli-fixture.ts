// Fixture binary: real CLI parsing/registry/engine with an injected process filesystem.
import { main } from "../../src/reclaim.ts";
import { createLivenessSnapshot } from "../../src/liveness/facts.ts";
import { registry } from "../../src/targets/index.ts";
import { fromAsyncThrowable } from "neverthrow";

const procRoot = process.env.RECLAIM_UNIT_PROC_ROOT;
if (procRoot === undefined) {
  process.stderr.write("fixture requires RECLAIM_UNIT_PROC_ROOT\n");
  process.exit(2);
}
const result = await fromAsyncThrowable(() =>
  main(undefined, registry, {
    captureLiveness: (config) =>
      createLivenessSnapshot(config, { procs: { procRoot } }),
  }),
)();
if (result.isErr()) process.stderr.write(`fixture: ${String(result.error)}\n`);
process.exit(result.isOk() ? result.value : 2);
