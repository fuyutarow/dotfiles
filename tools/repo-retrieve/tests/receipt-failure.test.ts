import { expect, test } from "bun:test";
import { receiptFailure } from "#src/auto-reindex-receipt.ts";

const refused = {
  startedAt: "2026-11-25T20:09:00Z",
  pid: 1,
  requestedHead: "ae61",
  endedAt: "2026-11-25T20:10:03Z",
  exitCode: 4,
  stderrTail:
    "PLAN: 1194 files\nCHARGE: full rebuild\nPLAN REFUSED: a.json: dump/data candidate 155251 bytes > data-file limit 65536\nTop contributors (informational):\nsrc (.ts, text): 10 chunks\n",
};

test("a refused reindex at this HEAD is named by its refusal line, not its informational tail", () => {
  expect(receiptFailure(refused, "ae61")).toBe(
    "exit 4: PLAN REFUSED: a.json: dump/data candidate 155251 bytes > data-file limit 65536",
  );
});

test("a failure at another HEAD, a success, or no receipt is not this HEAD's failure", () => {
  expect(receiptFailure(refused, "b000")).toBeUndefined();
  expect(receiptFailure(refused, null)).toBeUndefined();
  expect(receiptFailure({ ...refused, exitCode: 0 }, "ae61")).toBeUndefined();
  expect(receiptFailure(undefined, "ae61")).toBeUndefined();
});

test("without a refusal line the last stderr line is the reason", () => {
  expect(
    receiptFailure(
      { ...refused, exitCode: 1, stderrTail: "x\ndaemon gone\n\n" },
      "ae61",
    ),
  ).toBe("exit 1: daemon gone");
});
