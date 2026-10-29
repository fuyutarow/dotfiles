import { main } from "../../src/reclaim.ts";
import { createRipExpiryTarget } from "../../src/targets/rip-expire.ts";

// Spend a deterministic stage budget after one real payload deletion. Each new
// CLI process recomputes record order; no expiry continuation file is involved.
let elapsed = 0;
const budgetMs = 60_000;
const { target } = createRipExpiryTarget({ budgetMs, clock: () => elapsed });
const bounded = {
  ...target,
  act: async (...args: Parameters<typeof target.act>) => {
    const result = await target.act(...args);
    elapsed += budgetMs;
    if (process.env["RECLAIM_TEST_CANCEL_AFTER_ONE"] === "1")
      process.emit("SIGTERM");
    return result;
  },
};
process.exitCode = await main(Bun.argv.slice(2), [bounded]);
