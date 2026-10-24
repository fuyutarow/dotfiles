// Released CLI compatibility, replacing tests of dotfiles-owned composition/storage.
import { expect, test } from "bun:test";
import { join } from "node:path";
import {
  DoctorFindings,
  DoctorStatus,
} from "../../tools/shared/src/doctor-record.ts";
import { jsonOf, z } from "../../tools/shared/src/zod.ts";

const fixtureText = await Bun.file(
  join(import.meta.dir, "fixtures/agx-status-schema1.json"),
).text();
const fixtureResult = jsonOf(DoctorStatus).safeParse(fixtureText);
const fixture = fixtureResult.success
  ? fixtureResult.data
  : expect.unreachable(fixtureResult.error.message);
const aggregateText = await Bun.file(
  join(import.meta.dir, "fixtures/agx-doctor-schema1.json"),
).text();
const aggregateResult = jsonOf(z.record(z.string(), z.unknown())).safeParse(
  aggregateText,
);
const aggregate = aggregateResult.success
  ? aggregateResult.data
  : expect.unreachable(aggregateResult.error.message);

test("recorded schema-1 CLI findings project owner counts and ignore unused fields", () => {
  expect(DoctorFindings.safeParse(aggregate)).toMatchObject({
    success: true,
    data: {
      schema: 1,
      kinds: { unjudged: 1 },
      lost: 0,
      complete: true,
      captured_at: 1700000000000,
    },
  });
  expect(fixture.findings?.total).toBe(1);
  expect(
    DoctorFindings.safeParse({
      ...aggregate,
      members: "unused additive data",
      findings: "unused by statusline",
    }).success,
  ).toBe(true);
});
test("additive fields and unknown finding strings survive both projections", () => {
  const findings = {
    ...aggregate,
    kinds: { "future.kind / arbitrary": 7 },
    future: true,
  };
  expect(DoctorFindings.safeParse(findings)).toMatchObject({
    success: true,
    data: { kinds: { "future.kind / arbitrary": 7 } },
  });
  expect(
    DoctorStatus.safeParse({
      ...fixture,
      future: true,
      findings: {
        ...fixture.findings,
        findings: [
          {
            tool: "future-tool",
            object: "future-object",
            finding: "future.kind / arbitrary",
            remedy: "inspect",
            extra: true,
          },
        ],
      },
    }),
  ).toMatchObject({
    success: true,
    data: { findings: { findings: [{ finding: "future.kind / arbitrary" }] } },
  });
});
test("null, incomplete and stale remain distinct from clean findings", () => {
  expect(DoctorStatus.safeParse({ schema: 1, findings: null })).toMatchObject({
    success: true,
    data: { findings: null },
  });
  expect(
    DoctorFindings.safeParse({ ...aggregate, complete: false, stale: true }),
  ).toMatchObject({ success: true, data: { complete: false, stale: true } });
});
test.each([0, 2, "1", undefined])(
  "unknown schema %s is rejected at each CLI boundary",
  (schema) => {
    expect(DoctorFindings.safeParse({ ...aggregate, schema }).success).toBe(
      false,
    );
    expect(DoctorStatus.safeParse({ ...fixture, schema }).success).toBe(false);
    expect(
      DoctorStatus.safeParse({
        ...fixture,
        findings: { ...fixture.findings, schema },
      }).success,
    ).toBe(false);
  },
);
