import { describe, expect, test } from "bun:test";
import { inspectRegister } from "../retros-check.ts";

const row = {
  id: "lesson-one",
  first_seen: "2026-10-11",
  sources: ["memory"],
  principle: "Keep the record searchable.",
  enforcement: { type: "manual", locus: "README.md" },
  status: "open",
  recurrences: ["2026-10-11"],
};

describe("retros register", () => {
  test("accepts a valid register with an existing locus", async () => {
    expect(await inspectRegister({ lesson: [row] }, process.cwd())).toEqual([]);
  });

  test("rejects duplicate ids and missing loci", async () => {
    const findings = await inspectRegister(
      {
        lesson: [
          row,
          { ...row, enforcement: { type: "manual", locus: "absent" } },
        ],
      },
      process.cwd(),
    );
    expect(findings.map((finding) => finding.text)).toContain("duplicate id");
    expect(
      findings.some((finding) =>
        finding.text.includes("missing enforcement locus"),
      ),
    ).toBe(true);
  });

  test("rejects schema drift", async () => {
    expect(
      await inspectRegister({ lesson: [{ ...row, sources: ["other"] }] }),
    ).toHaveLength(1);
  });
});
