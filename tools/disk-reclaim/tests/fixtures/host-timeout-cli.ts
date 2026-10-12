// Fixture binary: real CLI/SSH transport with a short probe budget.
import { fromAsyncThrowable } from "neverthrow";
import { main } from "../../src/reclaim.ts";
import { createHostTarget, createSshRunner } from "../../src/targets/host.ts";
const target = createHostTarget({
  runner: createSshRunner({ probeTimeoutMs: 5000 }),
});
const result = await fromAsyncThrowable(() => main(undefined, [target]))();
if (result.isErr()) process.stderr.write(`fixture: ${String(result.error)}\n`);
process.exit(result.isOk() ? result.value : 2);
