// Fail open: report only when a natural Codex hook can resolve complete metadata for its exact
// session_id. SessionStart may precede turn_context; Stop is the later retry after the turn.
import { readBoundedStdinJson } from "./lib.ts";
import { strAt } from "../../hooks/narrow.ts";
import { readCodexThreadStatus } from "../../../tools/statusline/src/adapters/codex-rollout.ts";
import { reportToHerdr } from "../../../tools/statusline/src/identity.ts";

const reportValue = (value: string | undefined) =>
  value === undefined || value === "" ? "unknown" : value;

const payload = readBoundedStdinJson();
const event = strAt(payload, "hook_event_name");
const threadId = strAt(payload, "session_id");

if (
  (event === "SessionStart" || event === "Stop") &&
  threadId !== undefined &&
  /^[A-Za-z0-9_-]{1,128}$/u.test(threadId) &&
  process.env.HERDR_ENV === "1" &&
  process.env.HERDR_SOCKET_PATH !== undefined &&
  process.env.HERDR_SOCKET_PATH !== "" &&
  process.env.HERDR_PANE_ID !== undefined &&
  process.env.HERDR_PANE_ID !== ""
) {
  const session = await readCodexThreadStatus(threadId).catch(() => null);
  if (session?.sessionId === threadId) {
    await reportToHerdr(
      reportValue(session.model?.name),
      undefined,
      reportValue(session.effort),
      "unknown",
    ).catch(() => {});
  }
}
