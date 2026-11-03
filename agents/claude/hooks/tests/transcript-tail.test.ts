// The bounded backward readers must return exactly what the full-file readers return, for any
// transcript shape: chunk-boundary splits, multi-byte text, malformed/blank lines, BOM, CRLF,
// lines longer than one read chunk, and turns with no human prompt.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "bun:test";
import {
  entryOf,
  textBlocks,
  type TranscriptEntry,
} from "../lib/transcript-tail.ts";
import { lastUserTextTail, turnTextTail } from "../lib.ts";
import { parseJson } from "../../../hooks/narrow.ts";

// Test-only full-file reference: the oracle the bounded readers must agree with. Not production code.
async function readTranscript(path: string): Promise<TranscriptEntry[]> {
  const content = await readFile(path, "utf8");
  const entries: TranscriptEntry[] = [];
  for (const line of content.split("\n")) {
    if (line.trim() === "") continue;
    const parsed = parseJson(line);
    if (parsed !== undefined) entries.push(entryOf(parsed));
  }
  return entries;
}

function turnText(entries: TranscriptEntry[]): string {
  const rel = entries.filter(
    (e) => e.type === "assistant" || e.type === "user",
  );
  let lastUser = -1;
  rel.forEach((e, i) => {
    if (e.type === "user") lastUser = i;
  });
  return rel
    .slice(lastUser + 1)
    .filter((e) => e.type === "assistant")
    .flatMap((e) => textBlocks(e.message?.content))
    .join("\n");
}

function lastUserText(entries: TranscriptEntry[]): string {
  const texts = entries
    .filter((e) => e.type === "user")
    .map((e) => textBlocks(e.message?.content).join("\n"))
    .filter((t) => t !== "");
  return texts.at(-1) ?? "";
}

const dir = mkdtempSync(join(tmpdir(), "transcript-tail-"));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

// Deterministic PRNG so failures reproduce.
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const WORDS = [
  "確認",
  "done",
  "PASS",
  "達成",
  "ファイル",
  "`code`",
  "\u{1F600}",
  "a",
  "説明",
];

function text(r: () => number, longChance: number): string {
  const long = r() < longChance;
  const n = long ? 2000 + Math.floor(r() * 40000) : 1 + Math.floor(r() * 12);
  const parts: string[] = [];
  for (let i = 0; i < n; i++)
    parts.push(WORDS[Math.floor(r() * WORDS.length)] ?? "");
  return parts.join(" ");
}

function userLine(r: () => number): string {
  const kind = r();
  if (kind < 0.4)
    return JSON.stringify({
      type: "user",
      message: { content: text(r, 0.05) },
    });
  if (kind < 0.6)
    return JSON.stringify({
      type: "user",
      message: { content: [{ type: "text", text: text(r, 0.05) }] },
    });
  if (kind < 0.7)
    return JSON.stringify({
      type: "user",
      message: { content: [{ type: "text", text: "" }] },
    });
  return JSON.stringify({
    type: "user",
    message: {
      content: [
        { type: "tool_result", tool_use_id: "t", content: text(r, 0.1) },
      ],
    },
  });
}

function assistantLine(r: () => number): string {
  const kind = r();
  if (kind < 0.15)
    return JSON.stringify({
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            name: "Bash",
            input: { command: "agx worker dispatch T-1" },
          },
        ],
      },
    });
  if (kind < 0.3)
    return JSON.stringify({
      type: "assistant",
      message: {
        content: [{ type: "tool_use", name: "Bash", input: { command: "ls" } }],
      },
    });
  if (kind < 0.4)
    return JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "thinking", thinking: text(r, 0) },
          { type: "text", text: text(r, 0.02) },
        ],
      },
    });
  return JSON.stringify({
    type: "assistant",
    message: { content: [{ type: "text", text: text(r, 0.02) }] },
  });
}

function otherLine(r: () => number): string {
  const pick = r();
  if (pick < 0.3) return "";
  if (pick < 0.5) return "{not json";
  if (pick < 0.6) return "\t  ";
  if (pick < 0.7) return JSON.stringify({ type: "last-prompt", leafUuid: "x" });
  return "42";
}

function build(seed: number, lines: number): string {
  const r = rng(seed);
  const out: string[] = [];
  for (let i = 0; i < lines; i++) {
    const pick = r();
    if (pick < 0.3) out.push(userLine(r));
    else if (pick < 0.85) out.push(assistantLine(r));
    else out.push(otherLine(r));
  }
  let body = out.join(r() < 0.5 ? "\n" : "\r\n");
  if (r() < 0.3) body = "﻿" + body;
  if (r() < 0.6) body += "\n";
  return body;
}

async function reference(path: string) {
  const entries = await readTranscript(path);
  return { turn: turnText(entries), user: lastUserText(entries) };
}

test("tail readers match full-file readers over randomized transcripts", async () => {
  for (let seed = 1; seed <= 60; seed++) {
    const lines = 1 + ((seed * 37) % 400);
    const path = join(dir, `t-${seed}.jsonl`);
    writeFileSync(path, build(seed, lines));
    const ref = await reference(path);
    expect({ seed, turn: await turnTextTail(path) }).toEqual({
      seed,
      turn: ref.turn,
    });
    expect({ seed, user: await lastUserTextTail(path) }).toEqual({
      seed,
      user: ref.user,
    });
  }
});

test("tail readers match on a line longer than several read chunks and across boundaries", async () => {
  const big = "説明 ".repeat(60_000); // ~300 KB of multi-byte text in one line
  const lines = [
    JSON.stringify({ type: "user", message: { content: "最初の依頼" } }),
    JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: big }] },
    }),
    JSON.stringify({
      type: "user",
      message: { content: [{ type: "tool_result", content: big }] },
    }),
    JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "末尾 PASS" }] },
    }),
  ];
  const path = join(dir, "big.jsonl");
  writeFileSync(path, lines.join("\n") + "\n");
  const ref = await reference(path);
  expect(await turnTextTail(path)).toBe(ref.turn);
  expect(await lastUserTextTail(path)).toBe(ref.user);
  expect(ref.user).toBe("最初の依頼");
});

test("empty and single-line files", async () => {
  const empty = join(dir, "empty.jsonl");
  writeFileSync(empty, "");
  expect(await turnTextTail(empty)).toBe("");
  expect(await lastUserTextTail(empty)).toBe("");
  const one = join(dir, "one.jsonl");
  writeFileSync(
    one,
    JSON.stringify({ type: "assistant", message: { content: "solo" } }),
  );
  expect(await turnTextTail(one)).toBe("solo");
});
