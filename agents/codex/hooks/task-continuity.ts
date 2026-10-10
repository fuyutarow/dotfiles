/** codex adapter; continuation semantics remain in the continuity skill. Fail open. */
import { handleCompactHook } from "../../skills/continuing-long-running-tasks/scripts/compact-hook";
import { attempt } from "../../hooks/attempt.ts";
import { hookJson, readBoundedStdinJson } from "./lib.ts";
import { parseJson } from "../../hooks/narrow.ts";

await attempt(() => {
  const output = handleCompactHook("codex", readBoundedStdinJson());
  if (output !== undefined)
    process.stdout.write(`${hookJson(parseJson(output))}\n`);
});
