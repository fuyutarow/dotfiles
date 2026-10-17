// Compatibility coverage for legacy enriched rows; production uses owner facts only.
import { ok } from "neverthrow";
import { buildDataframe } from "../src/build-dataframe.ts";
import { COLLECTOR_SOURCES } from "../src/collector-sources.ts";
import { ClaudeStatuslineInputSchema } from "../src/adapters/claude-statusline.ts";
import { agxRouteRunsAsync } from "../src/dispatch-runs.ts";
import { render } from "../src/format.ts";
import { jsonOf } from "../src/zod.ts";
const data = jsonOf(ClaudeStatuslineInputSchema).safeParse(
  await Bun.stdin.text(),
);
if (!data.success) process.exit(2);
process.stdout.write(
  render(
    await buildDataframe(data.data, {
      sources: {
        ...COLLECTOR_SOURCES,
        routes: async (sessionId) =>
          ok(await agxRouteRunsAsync(process.env, sessionId, true)),
      },
    }),
  ),
);
