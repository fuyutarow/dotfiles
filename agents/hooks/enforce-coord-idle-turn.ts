// Claude Stop hook. Fail open on missing input, unavailable agx, or malformed output.
import { execFile } from "node:child_process";
import { attempt } from "./attempt.ts";
import { arr, at, parseJson, strAt } from "./narrow.ts";
import {
  hookStderr,
  readStdinJson,
  readTranscript,
  turnText,
} from "../claude/hooks/lib.ts";

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
  const entries = await readTranscript(path);
  // Tool results are user entries but do not start a new human turn.
  let start = 0;
  entries.forEach((entry, index) => {
    if (entry.type !== "user") return;
    const content = entry.message?.content;
    if (
      typeof content === "string" ||
      (arr(content) ?? []).some((block) => strAt(block, "type") === "text")
    )
      start = index + 1;
  });
  const dispatched = entries
    .slice(start)
    .some(
      (entry) =>
        entry.type === "assistant" &&
        (arr(entry.message?.content) ?? []).some(
          (block) =>
            strAt(block, "type") === "tool_use" &&
            strAt(block, "name") === "Bash" &&
            /\bagx\s+worker\s+dispatch\b/u.test(
              strAt(block, "input", "command") ?? "",
            ),
        ),
    );
  if (dispatched) return 0;
  const text = turnText(entries);
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
