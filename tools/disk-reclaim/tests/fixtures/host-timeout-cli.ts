// Fixture binary: real CLI/SSH transport with a short probe budget.
import { Result } from "@dotfiles/shared/src/result.ts";
import { main } from "#src/reclaim.ts";
import { createHostTarget, createSshRunner } from "#src/targets/host.ts";
const target = createHostTarget({
  runner: createSshRunner({ probeTimeoutMs: 5000 }),
});
const result = await Result.tryPromise({
  try: () => main(undefined, [target]),
  catch: (e: unknown) => e,
});
if (result.isErr()) process.stderr.write(`fixture: ${String(result.error)}\n`);
process.exit(result.isOk() ? result.value : 2);
