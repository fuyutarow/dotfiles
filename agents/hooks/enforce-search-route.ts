// PreToolUse adapter: classification, project resolution and rewrite text live in repo-retrieve.

import { errorMessage, Result } from "@dotfiles/shared/src/result.ts";
import { jsonText } from "@dotfiles/shared/src/zod.ts";
import { decideSearchRoute } from "@dotfiles/repo-retrieve/src/search-route.ts";

const result = await Result.tryPromise({
  try: async () => {
    const text = await new Response(Bun.stdin).text();
    const parsed = jsonText.safeParse(text);
    const decision = await decideSearchRoute({
      payload: parsed.success ? parsed.data : undefined,
    });
    if (decision !== undefined) {
      const { decidePre } = await import("#root/lib.ts");
      // SINGLE-AXIS: decideSearchRoute returns at most one verdict; its raw-search axis and its fatal cases
      // (non-JSON payload, missing router) are declared in tools/repo-retrieve/src/search-route.ts.
      decidePre("deny", decision.reason);
    }
  },
  catch: (e: unknown) => e,
});
if (result.isErr()) {
  const decision = await decideSearchRoute({
    payload: undefined,
    error: errorMessage(result.error),
  });
  if (decision !== undefined) {
    const { decidePre } = await import("#root/lib.ts");
    // FATAL: the hook itself failed, so no axis could be evaluated; fail closed with the one fix
    decidePre("deny", decision.reason);
  }
}
process.exit(0);
