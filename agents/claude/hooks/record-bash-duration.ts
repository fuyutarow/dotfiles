// PostToolUse (matcher: Bash), Claude only — closes the duration record enforce-background-waits
// opened for a foreground Bash call, so the next call of the same kind is judged by what it took.
// Observes only: never decides, never prints; a missing start (a background call, a call made
// before this hook existed) records nothing. See bash-durations.ts.

import { strAt } from "../../hooks/narrow.ts";
import { recordEnd, stateDir } from "./bash-durations.ts";
import { readStdinJson } from "./lib.ts";

const payload = readStdinJson();
const toolUseId = strAt(payload, "tool_use_id");
if (strAt(payload, "tool_name") === "Bash" && toolUseId !== undefined)
  recordEnd(stateDir(), toolUseId, Temporal.Now.instant().epochMilliseconds);
