import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "../../shared/src/zod.ts";
import { decodedJson } from "./decode.ts";
import {
  parseReport,
  interimReturnWriter,
  parseReturn,
  renderReport,
  reportJsonSchema,
  withReportInstruction,
  WorkerReport,
} from "../src/report.ts";

const GOOD: WorkerReport = {
  summary: "s",
  changes: [{ path: "a.ts", what: "w" }],
  checks: [{ cmd: "bun test", exit: 0, result: "ok" }],
  for_coordinator: ["run it"],
  open: [],
};

const interimMessage = (text: string): string =>
  `\`\`\`agx-return\n${JSON.stringify({ interim: true, findings: [{ text }], evidence: [], impact_on_brief: "none", proposed_next: "continue", artifacts: [] })}\n\`\`\``;

describe("report", () => {
  test("stream interim journal retains checkpoints once and parsing chooses the last RETURN", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "agx-interim-journal-"));
    using _scratch = {
      [Symbol.dispose]: () => {
        rmSync(scratch, { recursive: true, force: true });
      },
    };
    const path = join(scratch, "worker", "interim.jsonl");
    const record = {
      findings: [],
      evidence: [],
      impact_on_brief: "none",
      proposed_next: "continue",
      artifacts: [],
    };
    const first = `\`\`\`agx-return\n${JSON.stringify({ ...record, interim: true })}\n\`\`\``;
    const final = `\`\`\`agx-return\n${JSON.stringify(record)}\n\`\`\``;
    const recordInterim = interimReturnWriter(path);
    await recordInterim(first);
    await recordInterim(first);
    await recordInterim(final);
    expect(readFileSync(path, "utf8").trim().split("\n")).toHaveLength(1);
    expect(parseReturn(`${first}\n${final}`)).toEqual({
      kind: "valid",
      record,
    });
    expect(parseReturn(`${final}\n${first}`)).toEqual({
      kind: "valid",
      record: { ...record, interim: true },
    });
  });
  test("queued async checkpoints flush in order before worker exit", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "agx-interim-flush-"));
    using _scratch = {
      [Symbol.dispose]: () => {
        rmSync(scratch, { recursive: true, force: true });
      },
    };
    const path = join(scratch, "worker", "interim.jsonl");
    const first = interimMessage("first");
    const second = interimMessage("second");
    const record = interimReturnWriter(path);
    const writes = [record(first), record(first), record(second)];
    await record.flush();
    await Promise.all(writes);
    expect(readFileSync(path, "utf8").trim().split("\n")).toEqual([
      JSON.stringify({ last_message: first }),
      JSON.stringify({ last_message: second }),
    ]);
  });
  test("RETURN accepts an optional boolean interim marker and rejects other values", () => {
    const record = {
      findings: [],
      evidence: [],
      impact_on_brief: "none",
      proposed_next: "continue",
      artifacts: [],
    };
    const fenced = (interim: unknown): string =>
      `\`\`\`agx-return\n${JSON.stringify({ ...record, interim })}\n\`\`\``;
    expect(parseReturn(fenced(true))).toEqual({
      kind: "valid",
      record: { ...record, interim: true },
    });
    expect(parseReturn(fenced(false))).toEqual({
      kind: "valid",
      record: { ...record, interim: false },
    });
    expect(parseReturn(fenced("true")).kind).toBe("invalid");
    expect(withReportInstruction("work")).toContain('set "interim": true');
  });
  test("a JSON message, a fenced one and a structured value all validate", () => {
    const text = JSON.stringify(GOOD);
    expect(parseReport(undefined, text)).toEqual({ ok: true, report: GOOD });
    expect(parseReport(undefined, `\`\`\`json\n${text}\n\`\`\``).ok).toBe(true);
    expect(parseReport(GOOD, "").ok).toBe(true);
  });

  test("parses the tagged RETURN record from a final message", () => {
    const record = {
      findings: [{ text: "Premise is false", fleet: true }],
      evidence: ["tests/a.test.ts"],
      impact_on_brief: "The requested method cannot establish the claim",
      proposed_next: "Choose between the two approaches",
      artifacts: ["notes.md"],
    };
    const message = `${JSON.stringify(GOOD)}\n\n\`\`\`agx-return\n${JSON.stringify(record)}\n\`\`\``;
    expect(parseReturn(message)).toEqual({ kind: "valid", record });
    expect(parseReport(undefined, message)).toEqual({ ok: true, report: GOOD });
  });

  test("names malformed RETURN blocks", () => {
    const parsed = parseReturn('```agx-return\n{"findings":[]}\n```');
    expect(parsed.kind).toBe("invalid");
    expect(
      parsed.kind === "invalid" ? parsed.error : "unexpected valid return",
    ).toContain("agx-return block has the wrong shape");
  });

  test("empty, non-JSON and wrong-shape messages are errors that say which", () => {
    const empty = parseReport(undefined, "  ");
    expect(empty).toEqual({
      ok: false,
      error: "the worker's final message is empty",
    });
    const prose = parseReport(undefined, "finished the task");
    expect(!prose.ok && prose.error).toContain("the final message is not JSON");
    const shape = parseReport(undefined, '{"summary":1}');
    expect(!shape.ok && shape.error).toContain("wrong shape");
    expect(!shape.ok && shape.error).toContain("summary");
  });

  test("the JSON schema is strict and the instruction carries the shape", () => {
    const schema = decodedJson(
      z.looseObject({
        required: z.array(z.string()),
        additionalProperties: z.literal(false),
      }),
      reportJsonSchema(),
    );
    expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(schema.required).toEqual([
      "summary",
      "changes",
      "checks",
      "for_coordinator",
      "open",
    ]);
    const prompt = withReportInstruction("Do it.\n");
    expect(prompt.startsWith("Do it.\n\n## Final report (required)")).toBe(
      true,
    );
    expect(prompt).toContain('"for_coordinator": [string]');
    expect(prompt).toContain(
      "contradicts the brief's premise, scope or method",
    );
    expect(prompt).toContain(
      "diverging outcomes the dispatcher should choose between",
    );
    expect(prompt).toContain("you are told the time box is ending");
    expect(prompt).toContain("`agx-return`");
  });

  test("renderReport prints every section, even empty ones", () => {
    const out = renderReport({ ...GOOD, changes: [] });
    for (const h of [
      "## Summary",
      "## Changes",
      "## Checks",
      "## For the coordinator",
      "## Open",
    ])
      expect(out).toContain(h);
    expect(out).toContain("(none)");
    expect(out).toContain("[exit 0] bun test — ok");
  });
});
