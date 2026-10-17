import assert from "node:assert/strict";
import { observed, renderField, type FieldState } from "./field-state.ts";

export const ROW_KINDS = [
  "prompt",
  "identity",
  "agent",
  "rate",
  "sys",
  "job",
  "agx",
  "dispatch-warning",
  "recover",
] as const;
export type RowKind = (typeof ROW_KINDS)[number];
export type DisplayRows = Record<RowKind, FieldState<string>>;
const LABELS = {
  prompt: "Prompt",
  identity: "Session",
  agent: "Agent",
  rate: "Rate:",
  sys: "Sys:",
  job: "Job:",
  agx: "agx",
  "dispatch-warning": "dispatch warning",
  recover: "recover",
} satisfies Record<RowKind, string>;

/** Row membership is fixed even when every source fails. Empty rows are never filtered. */
export function renderRows(rows: DisplayRows): string {
  return ROW_KINDS.flatMap((kind) => {
    const state = rows[kind];
    assert.ok(state !== undefined, `missing statusline row: ${kind}`);
    if (kind === "dispatch-warning" || kind === "recover") return [];
    if (kind === "agx") {
      const text =
        state.kind === "fresh" ? state.value : renderField("agx", state);
      assert.ok(text.trim() !== "", "empty statusline row: agx");
      return [text];
    }
    const nonempty =
      state.kind !== "unknown" && state.value.trim() === ""
        ? observed(undefined, "no observation")
        : state;
    const text = renderField(LABELS[kind], nonempty);
    assert.ok(text.trim() !== "", `empty statusline row: ${kind}`);
    return [text];
  }).join("\n");
}
