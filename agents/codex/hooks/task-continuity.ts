/** codex adapter; continuation semantics remain in the continuity skill. Fail open. */
import { Result } from "@dotfiles/shared/src/result.ts";
import { handleCompactHook } from "@dotfiles/skill-continuing-long-running-tasks/scripts/compact-hook";
import { hookJson, readBoundedStdinJson } from "#hooks/lib.ts";
import { parseJson } from "@dotfiles/hooks/narrow.ts";

await Result.tryPromise({
  try: async () => {
    const output = await handleCompactHook(
      "codex",
      await readBoundedStdinJson(),
    );
    if (output !== undefined)
      process.stdout.write(`${hookJson(parseJson(output))}\n`);
  },
  catch: (e: unknown) => e,
});
