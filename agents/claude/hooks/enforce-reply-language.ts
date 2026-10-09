// Stop hook: enforce the user's Japanese reply preference across the current turn's assistant text.
// Safety: FAIL OPEN on every hook error (including unreadable/malformed transcripts), with one
// stderr line explaining the failure. A broken language check must never trap a session.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { attempt, errorMessage } from "../../hooks/attempt.ts";
import { arr, at, parseJson, str, strAt } from "../../hooks/narrow.ts";

const MIN_LETTERS = 40;
const MAX_BLOCKS_PER_TURN = 3;
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

function currentTurn(
  transcript: string,
): { texts: string[]; blocks: number } | Error {
  const entries: unknown[] = [];
  for (const line of readFileSync(transcript, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    const entry = parseJson(line);
    if (entry === undefined) return new Error("malformed transcript line");
    entries.push(entry);
  }

  let lastUser = -1;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (strAt(entry, "type") !== "user") continue;
    const content = arr(at(entry, "message", "content")) ?? [];
    const feedback = content.some(
      (block) => strAt(block, "text") === BLOCK_REASON,
    );
    if (
      !feedback &&
      !content.every((block) => strAt(block, "type") === "tool_result")
    )
      lastUser = index;
  }

  const texts: string[] = [];
  let blocks = 0;
  for (const entry of entries.slice(lastUser + 1)) {
    const content = at(entry, "message", "content");
    const contentBlocks = arr(content) ?? [];
    if (
      strAt(entry, "type") === "user" &&
      contentBlocks.some((block) => strAt(block, "text") === BLOCK_REASON)
    ) {
      blocks += 1;
      continue;
    }
    if (strAt(entry, "type") !== "assistant") continue;
    const direct = str(content);
    let textBlocks: string[];
    if (direct !== undefined) textBlocks = [direct];
    else
      textBlocks = contentBlocks.flatMap((block) => {
        const text = strAt(block, "text");
        return strAt(block, "type") === "text" && text !== undefined
          ? [text]
          : [];
      });
    texts.push(...textBlocks);
  }
  return { texts, blocks };
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

function proseSegments(text: string): string[] {
  const lines = text.split("\n");
  const segments: string[] = [];
  let current: string[] = [];
  let currentKind: "prose" | "list" | "table" | undefined;
  const flush = () => {
    if (current.length > 0) segments.push(current.join("\n"));
    current = [];
    currentKind = undefined;
  };

  for (const line of lines) {
    if (/^\s*#/u.test(line)) {
      flush();
      segments.push(line);
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    let kind: "prose" | "list" | "table" = "prose";
    if (/^\s*(?:[-+*]|\d+[.)])\s/u.test(line)) kind = "list";
    else if (/^\s*\|.*\|\s*$/u.test(line)) kind = "table";
    if (currentKind !== undefined && currentKind !== kind) flush();
    currentKind = kind;
    current.push(line);
  }
  flush();
  return segments;
}

function identifierHeavy(text: string): boolean {
  const tokens = text.match(/\p{Script=Latin}+/gu) ?? [];
  if (tokens.length === 0) return false;
  const identifiers = tokens.filter(
    (token) =>
      /[_\-./]/u.test(token) ||
      /[a-z][A-Z]/u.test(token) ||
      /^[A-Z]{2,}$/u.test(token),
  ).length;
  return identifiers / tokens.length >= 0.6;
}

async function main(): Promise<number> {
  const payload = parseJson(await Bun.stdin.text());
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

  const turn = currentTurn(transcript);
  if (turn instanceof Error) {
    stderrLine(`check failed open: ${turn.message}`);
    return 0;
  }
  if (turn.blocks >= MAX_BLOCKS_PER_TURN) {
    stderrLine("block cap reached for this turn");
    return 0;
  }
  const shouldBlock = turn.texts.some((text) => {
    const prose = stripNonProse(text);
    const { letters, share } = japaneseShare(prose);
    const segmentBlocks = proseSegments(prose).some((segment) => {
      if (identifierHeavy(segment)) return false;
      const result = japaneseShare(segment);
      return result.letters >= 120 && result.share < MIN_JAPANESE_SHARE;
    });
    return (
      (letters >= MIN_LETTERS && share < MIN_JAPANESE_SHARE) || segmentBlocks
    );
  });
  if (!shouldBlock) return 0;

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
