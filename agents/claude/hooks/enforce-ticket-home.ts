import { readFile } from "node:fs/promises";
import {
  bashTicketWrites,
  isAgxTicket,
  ticketHomeViolation,
} from "../../../tools/shared/src/ticket-home.ts";
import { arr, at, str, strAt } from "../../hooks/narrow.ts";
import { decidePre, readStdinJson } from "./lib.ts";

async function currentText(path: string): Promise<string | null> {
  return Promise.try(() => readFile(path, "utf8")).then(
    (text) => text,
    () => null,
  );
}

function applyEdits(text: string, edits: readonly unknown[]): string | null {
  let result = text;
  for (const edit of edits) {
    const oldString = strAt(edit, "old_string");
    const newString = strAt(edit, "new_string");
    if (
      oldString === undefined ||
      newString === undefined ||
      oldString === "" ||
      !result.includes(oldString)
    )
      return null;
    result =
      at(edit, "replace_all") === true
        ? result.split(oldString).join(newString)
        : result.replace(oldString, () => newString);
  }
  return result;
}

function hasUnparsedTicketWrite(command: string): boolean {
  const ticket = /\+\+[+][\s\S]*?\bname\s*=[\s\S]*?\boutcome\s*=/u.test(
    command,
  );
  return ticket && /(?:>|\btee\b)/u.test(command);
}

function denyUnparsedTicketWrite(command: string): void {
  if (!hasUnparsedTicketWrite(command)) return;
  // FATAL: an unresolved Bash write target prevents checking the ticket's owning home.
  decidePre(
    "deny",
    "cannot determine the target of a Bash ticket write; use `tkt new <slug> --repo <repo>`",
  );
}

async function main(): Promise<void> {
  const payload = readStdinJson();
  const tool = strAt(payload, "tool_name");
  const input = at(payload, "tool_input");
  const cwd = strAt(payload, "cwd") ?? process.cwd();

  if (tool === "Bash") {
    const command = strAt(input, "command");
    if (command === undefined) return;
    const writes = bashTicketWrites(command, cwd);
    if (writes === undefined) {
      // SINGLE-AXIS: unsupported shell syntax is denied only when it visibly carries ticket TOML
      // and a write operator, so unrelated shell commands retain their normal behavior.
      denyUnparsedTicketWrite(command);
      return;
    }
    const reasons = await Promise.all(
      writes.map((write) => ticketHomeViolation(write.path, cwd)),
    );
    const reason = reasons.find((entry) => entry !== undefined);
    // SINGLE-AXIS: the only denial axis is a ticket-shaped write outside its owning home.
    if (reason !== undefined) decidePre("deny", reason);
    return;
  }

  if (tool !== "Write" && tool !== "Edit" && tool !== "MultiEdit") return;
  const path = strAt(input, "file_path");
  if (path === undefined || path === "") return;
  const before = await currentText(path);
  let after: string | null;
  if (tool === "Write") after = str(at(input, "content")) ?? null;
  else if (tool === "Edit")
    after = before === null ? null : applyEdits(before, [input]);
  else {
    const edits = arr(at(input, "edits"));
    after =
      before === null || edits === undefined ? null : applyEdits(before, edits);
  }
  if (after === null || !isAgxTicket(after)) return;
  const reason = await ticketHomeViolation(path, cwd);
  // SINGLE-AXIS: prose Markdown is outside this gate; only the agx front-matter shape is judged.
  if (reason !== undefined) decidePre("deny", reason);
}

await main();
