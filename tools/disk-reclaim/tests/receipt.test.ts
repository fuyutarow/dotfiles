import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { readReceipts } from "../src/receipt.ts";
import { tempRoot } from "./fixtures/temp.ts";

test("readReceipts preserves deadline fields and reports unknown outcomes", () => {
  const dir = tempRoot("reclaim-receipt-");
  const receipt = {
    schema: 2,
    name: "run",
    target: "run",
    tier: "blind",
    command: ["disk-reclaim", "run"],
    host: "fixture-host",
    pid: 123,
    started: "2026-10-29T00:00:00Z",
    ended: "2026-10-29T00:00:00Z",
    exit: 1,
    free_before: 100,
    free_after: 100,
    output: null,
    actions: [],
  };
  const deadline = { ...receipt, outcome: "deadline", phase: "target plan" };
  const unknown = { ...receipt, outcome: "unexpected", phase: "action" };
  writeFileSync(
    join(dir, "log.jsonl"),
    [deadline, receipt, unknown]
      .map((line) => JSON.stringify(line))
      .join("\n") + "\n",
  );
  const result = readReceipts(10, dir);
  expect(result.receipts).toEqual([deadline, receipt]);
  expect(result.errors).toHaveLength(1);
  expect(result.errors[0]).toContain("log.jsonl:3:");
});
