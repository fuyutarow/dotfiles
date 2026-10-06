// Stop hook: enforce the user's Japanese reply preference against the final assistant message.
// Safety: FAIL OPEN on every hook error (including unreadable/malformed transcripts), with one
// stderr line explaining the failure. A broken language check must never trap a session.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { attempt, errorMessage } from "../../hooks/attempt.ts";
import { arr, at, parseJson, str, strAt } from "../../hooks/narrow.ts";

const MIN_LETTERS = 40;
// WHY 0.3: allow Japanese prose that contains ordinary English identifiers while still catching
// a mostly-English answer; code and paths are removed before calculating the share.
const MIN_JAPANESE_SHARE = 0.3;
const BLOCK_REASON =
  "直前の返答が英語です。日本語で書き直してください（コードや識別子は原文のままで構いません）。";

function stderrLine(reason: string): void {
  process.stderr.write(
    `enforce-reply-language: ${reason.replaceAll(/\s+/gu, " ")}\n`,
  );
}

function finalAssistantText(transcript: string): string | Error {
  let lastText = "";
  for (const line of readFileSync(transcript, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    const entry = parseJson(line);
    if (entry === undefined) return new Error("malformed transcript line");
    if (strAt(entry, "type") !== "assistant") continue;

    const content = at(entry, "message", "content");
    const direct = str(content);
    lastText =
      direct ??
      (arr(content) ?? [])
        .flatMap((block) => {
          const text = strAt(block, "text");
          return strAt(block, "type") === "text" && text !== undefined
            ? [text]
            : [];
        })
        .join("\n");
  }
  return lastText;
}

function stripNonProse(text: string): string {
  const codeAndQuotes: string[] = [];
  let inFence = false;
  for (const line of text.split("\n")) {
    if (/^\s*```/u.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || /^\s*>/u.test(line)) continue;
    codeAndQuotes.push(line.replaceAll(/`[^`]*`/gu, ""));
  }

  return codeAndQuotes
    .join("\n")
    .replaceAll(/https?:\/\/\S+|www\.\S+/giu, " ")
    .replaceAll(
      /(?:~\/|\.\.?\/|\/)?(?:[\w.@+-]+\/)*[\w.@+-]+\.[A-Za-z0-9]{1,12}(?::\d+(?::\d+)?)?/gu,
      " ",
    );
}

function japaneseShare(text: string): { letters: number; share: number } {
  let japanese = 0;
  let latin = 0;
  for (const match of text.matchAll(
    /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]|\p{Script=Latin}/gu,
  )) {
    if (
      /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]$/u.test(match[0])
    )
      japanese += 1;
    else latin += 1;
  }
  const letters = japanese + latin;
  return { letters, share: letters === 0 ? 1 : japanese / letters };
}

async function main(): Promise<number> {
  const payload = parseJson(await Bun.stdin.text());
  if (at(payload, "stop_hook_active") === true) return 0;

  const home = process.env.HOME ?? homedir();
  const settingsPath = join(home, ".claude", "settings.json");
  if (!existsSync(settingsPath)) return 0;
  const settingsText = readFileSync(settingsPath, "utf8");
  const settings = parseJson(settingsText);
  if (settings === undefined) {
    stderrLine("check failed open: malformed ~/.claude/settings.json");
    return 0;
  }
  if (strAt(settings, "language") !== "japanese") return 0;

  const transcript = strAt(payload, "transcript_path");
  if (transcript === undefined || transcript === "") return 0;

  const text = finalAssistantText(transcript);
  if (text instanceof Error) {
    stderrLine(`check failed open: ${text.message}`);
    return 0;
  }
  const prose = stripNonProse(text);
  const { letters, share } = japaneseShare(prose);
  if (letters < MIN_LETTERS || share >= MIN_JAPANESE_SHARE) return 0;

  process.stdout.write(
    `${JSON.stringify({ decision: "block", reason: BLOCK_REASON })}\n`,
  );
  return 0;
}

const result = await attempt(main);
if (!result.ok) {
  stderrLine(`check failed open: ${errorMessage(result.error)}`);
  process.exit(0);
}
process.exit(result.value);
