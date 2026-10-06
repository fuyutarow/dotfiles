import { expect, test } from "bun:test";
import { briefLabel } from "../state.ts";

// A worker's default label skips the dispatch declaration every brief starts with (Vast 2026-10-06:
// three Run rows all read "RESOURCE-CLASS(NONCOMPUTE): read").
test.each([
  [
    "RESOURCE-CLASS(NONCOMPUTE): edits only\n\n# Resolve one jj merge conflict\nbody",
    "Resolve one jj merge conflict",
  ],
  [
    "RESOURCE-ENVELOPE(/tmp/e.json): agent-resource-run only\n## Run R17\n",
    "Run R17",
  ],
  ["plain first line\nsecond", "plain first line"],
  ["RESOURCE-CLASS(NONCOMPUTE): only a declaration", ""],
])("%j → %j", (brief, label) => {
  expect(briefLabel(brief)).toBe(label);
});
