// Fail open: report only when a natural Codex hook can resolve complete metadata for its exact
// session_id. PostToolUse retries during a long turn; Stop reasserts after the turn.
import { mkdir, open, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readBoundedStdinJson } from "./lib.ts";
import { strAt } from "../../hooks/narrow.ts";
import { jsonOf, z } from "../../hooks/zod.ts";
import { readCodexThreadStatus } from "../../../tools/statusline/src/adapters/codex-rollout.ts";
import {
  clearHerdrMetadata,
  reportToHerdr,
} from "../../../tools/statusline/src/identity.ts";
import { codexAgentName } from "./herdr-identity.ts";

const reportValue = (value: string | undefined) =>
  value === undefined || value === "" ? "unknown" : value;

const payload = readBoundedStdinJson();
const event = strAt(payload, "hook_event_name");
const threadId = strAt(payload, "session_id");
const STAMP = z.object({ pair: z.string(), at: z.number() });
const DEDUPE_MS = 30_000;

async function readStamp(path: string) {
  await using file = await open(path, "r");
  const buffer = Buffer.alloc(1025);
  const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
  if (bytesRead > 1024) return null;
  const parsed = jsonOf(STAMP).safeParse(
    buffer.subarray(0, bytesRead).toString("utf8"),
  );
  return parsed.success ? parsed.data : undefined;
}

async function reportRequestedSession(
  requestedThread: string,
  requestedEvent: string,
) {
  const session = await readCodexThreadStatus(requestedThread).catch(
    () => null,
  );
  if (session?.sessionId !== requestedThread) return;
  // Unknown Codex facts must replace metadata left by a previous Claude occupant too.
  const model = reportValue(session.model?.name);
  const effort = reportValue(session.effort);
  const name =
    session.cwd === undefined || session.cwd === ""
      ? undefined
      : codexAgentName(session.cwd, requestedThread);
  const key = new Bun.CryptoHasher("sha256")
    .update(
      JSON.stringify([
        process.env["HERDR_SOCKET_PATH"],
        process.env["HERDR_PANE_ID"],
        requestedThread,
      ]),
    )
    .digest("hex");
  const directory = join(
    tmpdir(),
    `dotfiles-codex-herdr-${process.getuid?.() ?? "user"}`,
  );
  const path = join(directory, `${key}.json`);
  const pair = JSON.stringify([model, effort, name]);
  const now = Temporal.Now.instant().epochMilliseconds;
  const previous = await readStamp(path).catch(() => null);
  if (
    requestedEvent === "PostToolUse" &&
    previous?.pair === pair &&
    now >= previous.at &&
    now - previous.at < DEDUPE_MS
  )
    return;
  await reportToHerdr(
    model,
    name,
    effort,
    "unknown",
    "codex",
    requestedThread,
    session.cwd,
  ).catch(() => {});
  await reportSessionId(requestedThread).catch(() => {});
  // Sender is best-effort; expire even unchanged stamps so a lost report retries.
  await mkdir(directory, { recursive: true, mode: 0o700 })
    .then(async () => {
      const temporary = `${path}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify({ pair, at: now }), {
        mode: 0o600,
      });
      await rename(temporary, path);
    })
    .catch(() => {});
}

const hasHerdrPane =
  process.env["HERDR_ENV"] === "1" &&
  process.env["HERDR_SOCKET_PATH"] !== undefined &&
  process.env["HERDR_SOCKET_PATH"] !== "" &&
  process.env["HERDR_PANE_ID"] !== undefined &&
  process.env["HERDR_PANE_ID"] !== "";

async function reportSessionId(sessionId: string) {
  const paneId = process.env["HERDR_PANE_ID"];
  const executable = Bun.which("herdr");
  if (paneId === undefined || paneId === "" || executable === null) return;
  const child = Bun.spawn(
    [
      executable,
      "pane",
      "report-agent-session",
      "--source",
      "dotfiles:codex-session",
      "--agent",
      "codex",
      "--agent-session-id",
      sessionId,
      paneId,
    ],
    {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      timeout: 2000,
      killSignal: "SIGTERM",
    },
  );
  await child.exited.catch(() => null);
}

// A pane can be reused before a new rollout exists (or even before Codex gives
// us a session id). Retire the old occupant's tokens at the start boundary.
if (event === "SessionStart" && hasHerdrPane)
  await clearHerdrMetadata().catch(() => {});

if (
  (event === "SessionStart" || event === "Stop" || event === "PostToolUse") &&
  threadId !== undefined &&
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(threadId) &&
  hasHerdrPane
) {
  await reportRequestedSession(threadId, event);
}
