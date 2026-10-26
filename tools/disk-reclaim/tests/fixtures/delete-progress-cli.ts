import { main } from "../../src/reclaim.ts";
import { candidate } from "./fake-target.ts";
import type { Target } from "../../src/targets/index.ts";

const targets: Target[] = ["slow-delete", "next-delete"].map((name) => ({
  name,
  tier: "blind",
  available: () => ({ available: true, skip_reason: null }),
  plan: () => [{ ...candidate(name), path: null }],
  act: async (_candidate, ctx) => {
    if (name === "slow-delete") {
      ctx.reportProgress?.(name, "fixture-payload", 1, 25, false, "delete");
      await Bun.sleep(4300);
    }
    return { ok: true, bytes_freed: 100, error: null };
  },
}));
process.exitCode = await main(undefined, targets);
