// PreToolUse adapter: classification, project resolution and rewrite text live in repo-retrieve.

import { attempt, errorMessage } from "../../tools/shared/src/attempt.ts";
import { jsonText } from "../../tools/shared/src/zod.ts";
import { decideSearchRoute } from "../../tools/repo-retrieve/src/search-route.ts";

const result = await attempt(async () => {
  const text = await Bun.stdin.text();
  const parsed = jsonText.safeParse(text);
  const decision = decideSearchRoute({
    payload: parsed.success ? parsed.data : undefined,
  });
  if (decision !== undefined) {
    const { decidePre } = await import("./lib.ts");
    // SINGLE-AXIS: decideSearchRoute returns at most one verdict; its raw-search axis and its fatal cases
    // (non-JSON payload, missing router) are declared in tools/repo-retrieve/src/search-route.ts.
    decidePre("deny", decision.reason);
  }
});
if (!result.ok) {
  const decision = decideSearchRoute({
    payload: undefined,
    error: errorMessage(result.error),
  });
  if (decision !== undefined) {
    const { decidePre } = await import("./lib.ts");
    // FATAL: the hook itself failed, so no axis could be evaluated; fail closed with the one fix
    decidePre("deny", decision.reason);
  }
}
process.exit(0);
