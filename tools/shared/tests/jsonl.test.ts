import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  jsonlLines,
  JsonlLineReader,
  readJsonlTailSync,
} from "../src/jsonl.ts";
import { jsonOf, z } from "../src/zod.ts";

const scratch = mkdtempSync(join(tmpdir(), "shared-jsonl-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

test("bounded tail returns the same complete recent records as a full parse", () => {
  const path = join(scratch, "runs.jsonl");
  const Row = z.looseObject({ index: z.number(), text: z.string() });
  const rows = Array.from({ length: 100 }, (_, index) =>
    JSON.stringify({ index, text: "x".repeat(180) }),
  );
  writeFileSync(path, `${rows.join("\n")}\n`);

  const parseRows = (text: string) =>
    [...jsonlLines(text)].flatMap((line) => {
      const parsed = jsonOf(Row).safeParse(line);
      return parsed.success ? [parsed.data] : [];
    });
  const full = parseRows(readFileSync(path, "utf8"));
  const tail = readJsonlTailSync(path, 1_500);
  const recent = parseRows(tail.text);
  const streamed = [...new JsonlLineReader(path)];

  expect(tail.startOffset).toBeGreaterThan(0);
  expect(recent).toEqual(full.slice(-recent.length));
  expect(streamed).toEqual(rows);
});

test("tail stays within the byte window when one record is oversized", () => {
  const path = join(scratch, "oversized.jsonl");
  const oversized = "x".repeat(2_000);
  const rows = ["old", oversized];
  writeFileSync(path, `${rows.join("\n")}\n`);

  const tail = readJsonlTailSync(path, 200);

  expect(tail.text.length).toBeLessThanOrEqual(200);
  expect([...jsonlLines(tail.text)]).toEqual([]);
});
