import { describe, expect, test } from "bun:test";
import {
  DEFAULT_TIMEOUT_S,
  DEFAULT_FIRST_RETURN_S,
  globsOverlap,
  parseTicket,
  verifyLine,
} from "../src/ticket.ts";

// The work ticket: TOML front matter between `+++` lines at the top of a brief. A brief without one
// is legacy mode and must come back untouched.

const valid = (body: string): string =>
  `+++\nschema = 1\n${body}\n+++\nthe prose\n`;

describe("parseTicket", () => {
  test("worker and first-return defaults are 600 and 360 seconds", () => {
    expect(DEFAULT_TIMEOUT_S).toBe(600);
    expect(DEFAULT_FIRST_RETURN_S).toBe(360);
  });

  test("no front matter: legacy, the brief unchanged", () => {
    const text = "RESOURCE-CLASS(NONCOMPUTE): x\n# task\n";
    expect(parseTicket(text)).toEqual({ kind: "legacy", prose: text });
  });

  test("a valid ticket: fields, defaults, and the prose without the front matter", () => {
    const r = parseTicket(
      valid('writes = ["a/**"]\nverify = ["bun test", "tsc"]'),
    );
    expect(r).toMatchObject({
      kind: "ticket",
      prose: "the prose\n",
      ticket: {
        schema: 1,
        writes: ["a/**"],
        verify: ["bun test", "tsc"],
        verify_timeout_s: 1200,
        first_return_s: 360,
        capabilities: [],
      },
    });
  });

  test("optional fields are read", () => {
    const r = parseTicket(
      valid(
        'writes = []\nverify = ["x"]\nverify_timeout_s = 30\ntimeout_s = 3600\ntimeout_reason = "long compile and integration run"\ncapabilities = ["long-tool-loop"]',
      ),
    );
    expect(r).toMatchObject({
      kind: "ticket",
      ticket: {
        verify_timeout_s: 30,
        timeout_s: 3600,
        timeout_reason: "long compile and integration run",
        capabilities: ["long-tool-loop"],
      },
    });
  });

  test("premises are accepted for both ticket schemas", () => {
    for (const schema of [1, 2]) {
      const parsed = parseTicket(
        `+++\nschema = ${schema}\nwrites = []\npremises = ["file:src/main.ts", "symbol:run", "symbol:main@src/**"]\n+++\nprose`,
      );
      expect(parsed.kind).toBe("ticket");
      expect(parsed.kind === "ticket" && parsed.ticket.premises).toEqual([
        "file:src/main.ts",
        "symbol:run",
        "symbol:main@src/**",
      ]);
    }
  });

  test.each([
    ["not TOML", "+++\nwrites = [\n+++\nprose"],
    ["unterminated", "+++\nschema = 1\nwrites = []\nprose"],
    ["wrong schema", valid("writes = []\nschema = 2")],
    ["missing writes", valid('verify = ["x"]')],
    ["unknown key", valid("writes = []\nbogus = 1")],
    ["absolute write glob", valid('writes = ["/etc/**"]')],
    ["parent-escaping write glob", valid('writes = ["../x/**"]')],
    ["empty premise glob", valid('writes = []\npremises = ["symbol:run@"]')],
    ["empty verify command", valid('writes = []\nverify = [""]')],
    ["non-positive timeout", valid("writes = []\nverify_timeout_s = 0")],
    ["timeout below minimum", valid("writes = []\ntimeout_s = 59")],
    ["timeout above maximum", valid("writes = []\ntimeout_s = 14401")],
    ["extended timeout without reason", valid("writes = []\ntimeout_s = 601")],
    ["non-integer timeout", valid("writes = []\ntimeout_s = 60.5")],
  ])("invalid (%s) is refused with a reason", (_name, text) => {
    const r = parseTicket(text);
    expect(r.kind).toBe("invalid");
    expect(r.kind === "invalid" && r.reason !== "").toBe(true);
  });

  test("an extended ticket timeout is accepted only with a non-empty reason", () => {
    const accepted = parseTicket(
      valid(
        'writes = []\ntimeout_s = 1801\ntimeout_reason = "database migration"',
      ),
    );
    expect(accepted.kind).toBe("ticket");
    expect(accepted.kind === "ticket" && accepted.ticket.timeout_reason).toBe(
      "database migration",
    );
  });

  test.each([59, 361])("first_return_s rejects %s", (seconds) => {
    const r = parseTicket(valid(`writes = []\nfirst_return_s = ${seconds}`));
    expect(r.kind).toBe("invalid");
  });

  test("schema 2 accepts incomplete work fields for the remand grade", () => {
    expect(parseTicket("+++\nschema = 2\nwrites = []\n+++\nprose").kind).toBe(
      "ticket",
    );
  });
});

describe("globsOverlap (conservative literal-prefix rule)", () => {
  test.each([
    ["tools/agx/**", "agents/models/roster.ts", false],
    ["tools/agx/**", "tools/agx/tests/a.ts", true],
    ["agents/**", "agents/models/roster.ts", true],
    ["**", "anything/at/all", true],
    ["a/b.ts", "a/b.ts", true],
    ["a/b.ts", "a/c.ts", false],
    ["a/*/x.ts", "a/b/y.ts", true],
    ["a/b/**", "a/bc/**", false],
    ["./a/b/", "a/b/c", true],
    ["src/*.ts", "docs/*.md", false],
  ])("%s vs %s → %s (symmetric)", (a, b, expected) => {
    expect(globsOverlap(a, b)).toBe(expected);
    expect(globsOverlap(b, a)).toBe(expected);
  });
});

test("verifyLine lists the commands and tells the worker to run them in the foreground", () => {
  const line = verifyLine(["bun test", "tsc"]);
  expect(line).toContain("bun test");
  expect(line).toContain("tsc");
  expect(line).toContain("in the foreground");
  expect(line).toContain("do not background anything you need to see");
  expect(verifyLine([])).toBe("");
});
