import { plan, loadConfig } from "../../src/engine.ts";
import type { Target } from "../../src/targets/index.ts";

const { config } = loadConfig();
if (config === null) process.exit(2);
const target: Target = {
  name: "fake-scanner",
  tier: "blind",
  available: () => ({ available: true, skip_reason: null }),
  plan: async () => {
    process.stdout.write("scanning\n");
    await new Promise(() => {});
    return [];
  },
  act: () => {
    process.exit(1);
  },
};
await plan([target], { context: { config, mode: "plan", log: () => {} } });
