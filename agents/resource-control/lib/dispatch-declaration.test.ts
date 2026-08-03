import { describe, expect, test } from "bun:test";
import { resourceDeclarationResult } from "./dispatch-declaration.ts";

describe("dispatch resource declaration", () => {
  test("accepts one reasoned NONCOMPUTE declaration", () => {
    expect(
      resourceDeclarationResult(
        "RESOURCE-CLASS(NONCOMPUTE): read-only source inspection\ninspect files",
      ),
    ).toMatchObject({ ok: true, declaration: { kind: "noncompute" } });
  });

  test("accepts one absolute envelope declaration", () => {
    expect(
      resourceDeclarationResult(
        "RESOURCE-ENVELOPE(/tmp/job.resource.json): agent-resource-run only",
      ),
    ).toEqual({
      ok: true,
      declaration: { kind: "envelope", path: "/tmp/job.resource.json" },
    });
  });

  test("rejects relative, empty, and duplicate declarations", () => {
    expect(
      resourceDeclarationResult(
        "RESOURCE-ENVELOPE(job.resource.json): agent-resource-run only",
      ),
    ).toMatchObject({ ok: false });
    expect(
      resourceDeclarationResult("RESOURCE-CLASS(NONCOMPUTE): */"),
    ).toMatchObject({ ok: false });
    expect(
      resourceDeclarationResult(
        "RESOURCE-CLASS(NONCOMPUTE): read only\n" +
          "RESOURCE-CLASS(NONCOMPUTE): still read only",
      ),
    ).toMatchObject({ ok: false });
  });
});
