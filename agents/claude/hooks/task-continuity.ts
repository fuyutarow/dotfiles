/** claude adapter; continuation semantics remain in the continuity skill. Fail open. */
import { Result } from "../../../tools/shared/src/result.ts";
import { handleCompactHook } from "../../skills/continuing-long-running-tasks/scripts/compact-hook";
import { hookJson, readBoundedStdinJson } from "./lib.ts";
import { parseJson } from "../../hooks/narrow.ts";

await Result.tryPromise({
  try: async () => {
    const output = await handleCompactHook(
      "claude",
      await readBoundedStdinJson(),
    );
    if (output !== undefined)
      process.stdout.write(`${hookJson(parseJson(output))}\n`);
  },
  catch: (e: unknown) => e,
});
