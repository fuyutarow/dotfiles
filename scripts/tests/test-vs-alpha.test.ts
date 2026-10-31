import { describe, expect, test } from "bun:test";
import { compareFailures, parseFailures } from "../test-vs-alpha";

describe("Bun JUnit failures", () => {
  test("uses file and nested suites, decodes errors and retains duplicates", () => {
    const xml = `<?xml version="1.0"?><testsuites failures="2"><testsuite name="a.test.ts" file="a.test.ts"><testsuite name="outer"><testsuite name="inner"><testcase name="case &amp; more" file="a.test.ts"><failure message="bad &lt;value&gt;&#10;details" /></testcase><testcase name="case &amp; more" file="a.test.ts"><failure message="second" /></testcase></testsuite></testsuite></testsuite></testsuites>`;
    expect(parseFailures(xml, 1)._unsafeUnwrap()).toEqual([
      { name: "a.test.ts > outer > inner > case & more", error: "bad <value>" },
      { name: "a.test.ts > outer > inner > case & more", error: "second" },
    ]);
  });
  test("refuses incomplete runs and module errors", () => {
    expect(parseFailures("", 1).isErr()).toBe(true);
    expect(
      parseFailures('<testsuites failures="1"></testsuites>', 1).isErr(),
    ).toBe(true);
    expect(
      parseFailures('<testsuites failures="0"></testsuites>', 1).isErr(),
    ).toBe(true);
  });
  test("accepts a clean run", () => {
    expect(
      parseFailures(
        '<testsuites failures="0"></testsuites>',
        0,
      )._unsafeUnwrap(),
    ).toEqual([]);
  });
  test("counts duplicate failures and allows fixed failures", () => {
    const a = { name: "file > same", error: "first" };
    const b = { name: "file > same", error: "second" };
    const fixed = { name: "file > fixed", error: "fixed" };
    expect(compareFailures([a, fixed], [a, b])).toEqual({
      added: [b],
      duplicates: true,
    });
    expect(compareFailures([a, b], [a]).added).toEqual([]);
  });
});
