// Collector integration fixtures explicitly sample before invoking the read-only renderer.
import { sample } from "../src/sampler.ts";
import { ClaudeStatuslineInputSchema } from "../src/adapters/claude-statusline.ts";
import { jsonOf } from "../src/zod.ts";
const parsed = await jsonOf(ClaudeStatuslineInputSchema).safeParseAsync(
  await Bun.stdin.text(),
);
await sample(parsed.success ? [parsed.data] : [], {
  liveAgxJobs: () => Promise.resolve(undefined),
});
