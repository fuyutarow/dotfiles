// Claude Stop hook. Fail open on missing input, unavailable agx, or malformed output.
import { execFile } from "node:child_process";
import { attempt } from "./attempt.ts";
import { arr, at, parseJson, strAt } from "./narrow.ts";
import {
  hookStderr,
  readStdinJson,
  readTranscriptTail,
  textBlocks,
  type TranscriptEntry,
} from "../claude/hooks/lib.ts";

// A human prompt: a user entry with string content or a text block. Tool results are user
// entries too, but they do not start a new human turn.
function isHumanPrompt(entry: TranscriptEntry): boolean {
  const content = entry.message?.content;
  return (
    typeof content === "string" ||
    (arr(content) ?? []).some((block) => strAt(block, "type") === "text")
  );
}

function dispatchesWorker(entry: TranscriptEntry): boolean {
  return (arr(entry.message?.content) ?? []).some(
    (block) =>
      strAt(block, "type") === "tool_use" &&
      strAt(block, "name") === "Bash" &&
      /\bagx\s+worker\s+dispatch\b/u.test(
        strAt(block, "input", "command") ?? "",
      ),
  );
}

// Reads backward from the end and stops at the current human prompt, so the cost follows the
// current turn, not the session. Returns whether this turn dispatched a worker, and the turn's
// assistant prose (assistant text after the last user-type entry; see turnText in lib.ts).
async function readCurrentTurn(
  path: string,
): Promise<{ dispatched: boolean; text: string }> {
  const pieces: string[][] = [];
  let seenUser = false;
  for await (const entry of readTranscriptTail(path)) {
    if (entry.type === "user" && isHumanPrompt(entry)) break;
    if (entry.type === "user") seenUser = true;
    if (entry.type !== "assistant") continue;
    if (dispatchesWorker(entry)) return { dispatched: true, text: "" };
    if (!seenUser) pieces.push(textBlocks(entry.message?.content));
  }
  return { dispatched: false, text: pieces.toReversed().flat().join("\n") };
}

async function main(): Promise<number> {
  const payload = readStdinJson();
  if (at(payload, "stop_hook_active") === true) return 0;
  const session = strAt(payload, "session_id");
  const path = strAt(payload, "transcript_path");
  if (
    session === undefined ||
    session === "" ||
    path === undefined ||
    path === ""
  )
    return 0;
  const { dispatched, text } = await readCurrentTurn(path);
  if (dispatched) return 0;
  if (
    text
      .split("\n")
      .some(
        (line) =>
          /\bworkers=0\b/u.test(line) &&
          (/\ball-closed\b/u.test(line) ||
            /\b(?:[01]\d|2[0-3]):[0-5]\d\s+[A-Za-z][A-Za-z0-9_+/-]*/u.test(
              line,
            )),
      )
  )
    return 0;
  const agx = Bun.which("agx");
  if (agx === null) return 0;
  const options = {
    encoding: "utf8" as const,
    timeout: 15_000,
    killSignal: "SIGKILL",
    maxBuffer: 4 * 1024 * 1024,
  };
  const result = await new Promise<string | null>((resolve) => {
    execFile(agx, ["worker", "ls", "--json"], options, (error, stdout) => {
      resolve(error === null ? stdout : null);
    });
  });
  if (result === null) return 0;
  const rows = parseJson(result);
  if (
    !Array.isArray(rows) ||
    rows.some(
      (row: unknown) =>
        typeof at(row, "state") !== "string" ||
        !(
          typeof at(row, "dispatcher_session") === "string" ||
          at(row, "dispatcher_session") === null
        ),
    )
  )
    return 0;
  const mine = rows.filter(
    (row: unknown) => at(row, "dispatcher_session") === session,
  );
  if (
    mine.length === 0 ||
    mine.some((row: unknown) => at(row, "state") === "running")
  )
    return 0;
  hookStderr(
    "base:coord 3.3: dispatch a worker or declare workers=0 with the next check time and time zone or all-closed.",
  );
  return 2;
}

const result = await attempt(main);
process.exit(result.ok ? result.value : 0);
