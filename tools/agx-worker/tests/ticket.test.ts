import { describe, expect, test } from "bun:test";
import {
  DEFAULT_TIMEOUT_S,
  DEFAULT_FIRST_RETURN_S,
  DEFAULT_RETURN_POLICY,
  globsOverlap,
  parseTicket,
  promiseBlock,
  verifyLine,
} from "../src/ticket.ts";
import { completeTicket, FIXTURE_PROPOSITION } from "./fixture-ticket.ts";

// The work ticket: TOML front matter between `+++` lines at the top of every brief.

const valid = (body: string): string =>
  completeTicket(`+++\nschema = 2\n${body}\n+++\nthe prose\n`);
const withProposition = (table: string): string =>
  `+++\nschema = 2\noutcome = "o"\nconsumer = "c"\nfirst_return = "r"\nwrites = []\nverify = []\n${table}\n+++\nthe prose\n`;

describe("parseTicket", () => {
  test("worker and first-return defaults are 600 and 360 seconds", () => {
    expect(DEFAULT_TIMEOUT_S).toBe(600);
    expect(DEFAULT_FIRST_RETURN_S).toBe(360);
    expect(DEFAULT_RETURN_POLICY).toBe("hard-blockers-only");
  });

  test("no front matter is invalid and names the skeleton command", () => {
    const r = parseTicket("RESOURCE-CLASS(NONCOMPUTE): x\n# task\n");
    expect(r.kind).toBe("invalid");
    expect(r.kind === "invalid" && r.reason).toContain(
      "pass it to agx worker run",
    );
  });

  test("a valid ticket: fields, defaults, and the prose without the front matter", () => {
    const r = parseTicket(
      valid('writes = ["a/**"]\nverify = ["bun test", "tsc"]'),
    );
    expect(r).toMatchObject({
      kind: "ticket",
      prose: "the prose\n",
      ticket: {
        schema: 2,
        writes: ["a/**"],
        verify: ["bun test", "tsc"],
        verify_timeout_s: 1200,
        first_return_s: 360,
        return_policy: "hard-blockers-only",
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

  test("requires_gpu explicitly marks a detached ticket's GPU need", () => {
    const parsed = parseTicket(valid("writes = []\nrequires_gpu = true"));
    expect(parsed.kind === "ticket" && parsed.ticket.requires_gpu).toBe(true);
  });

  test("premises are accepted", () => {
    const parsed = parseTicket(
      valid(
        'writes = []\npremises = ["file:src/next/cli.ts", "symbol:run", "symbol:main@src/**"]',
      ),
    );
    expect(parsed.kind).toBe("ticket");
    expect(parsed.kind === "ticket" && parsed.ticket.premises).toEqual([
      "file:src/next/cli.ts",
      "symbol:run",
      "symbol:main@src/**",
    ]);
  });

  test.each([
    ["not TOML", "+++\nwrites = [\n+++\nprose"],
    ["unterminated", "+++\nschema = 2\nwrites = []\nprose"],
    ["schema 1", valid("writes = []").replace("schema = 2", "schema = 1")],
    [
      "missing writes",
      `+++\nschema = 2\noutcome = "o"\nconsumer = "c"\nfirst_return = "r"\nverify = []\n${FIXTURE_PROPOSITION}\n+++\nprose`,
    ],
    [
      "missing verify without read_only_diagnostic",
      `+++\nschema = 2\noutcome = "o"\nconsumer = "c"\nfirst_return = "r"\nwrites = []\n${FIXTURE_PROPOSITION}\n+++\nprose`,
    ],
    ["missing outcome", valid("writes = []").replace(/^outcome = .*\n/mu, "")],
    [
      "missing proposition",
      valid("writes = []").replace(FIXTURE_PROPOSITION, ""),
    ],
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
    [
      "invalid return policy",
      valid('writes = []\nreturn_policy = "sometimes"'),
    ],
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

  test("read_only_diagnostic stands in for verify", () => {
    const r = parseTicket(
      `+++\nschema = 2\noutcome = "o"\nconsumer = "c"\nfirst_return = "r"\nwrites = []\nread_only_diagnostic = true\n${FIXTURE_PROPOSITION}\n+++\nprose`,
    );
    expect(r.kind === "ticket" && r.ticket.verify).toEqual([]);
  });

  test.each([
    [undefined, "hard-blockers-only"],
    ["hard-blockers-only", "hard-blockers-only"],
    ["any-contradiction", "any-contradiction"],
  ] as const)("return_policy %s parses as %s", (policy, expected) => {
    const field = policy === undefined ? "" : `return_policy = "${policy}"\n`;
    const parsed = parseTicket(valid(`writes = []\n${field}`));
    expect(parsed.kind).toBe("ticket");
    expect(parsed.kind === "ticket" && parsed.ticket.return_policy).toBe(
      expected,
    );
  });
});

describe("globsOverlap (segment-exact intersection)", () => {
  test.each([
    ["tools/agx-worker/**", "agents/models/roster.ts", false],
    ["tools/agx-worker/**", "tools/agx-worker/tests/a.ts", true],
    ["agents/**", "agents/models/roster.ts", true],
    ["**", "anything/at/all", true],
    ["a/b.ts", "a/b.ts", true],
    ["a/b.ts", "a/c.ts", false],
    ["a/*/x.ts", "a/b/y.ts", false],
    ["a/b/**", "a/bc/**", false],
    ["./a/b/", "a/b/c", true],
    ["src/*.ts", "docs/*.md", false],
    [
      "launcher/frame_integrity*.test.*",
      "launcher/designs/module-ledger.toml",
      false,
    ],
    [
      "launcher/frame_integrity*.test.*",
      "launcher/frame_integrity_v6.test.ts",
      true,
    ],
    ["src/*.ts", "src/sub/file.ts", false],
    ["src/**/file.ts", "src/file.ts", true],
    ["src/**/file.ts", "src/sub/file.ts", true],
    ["a/[ab].{ts,js}", "a/b.js", true],
    ["a/[ab].ts", "a/c.ts", false],
    ["a/[a-a].ts", "a/-.ts", false],
    ["a/[😀-😃].ts", "a/😁.ts", true],
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

describe("proposition", () => {
  test.each([
    [
      "decisive with graph_node",
      '[proposition]\nid = "D1"\nclaim = "c"\ndecides = "decisive"\nrefuted_by = "r"\ngraph_node = "n1"',
      true,
    ],
    [
      "infrastructure with serves",
      '[proposition]\nid = "I1"\nclaim = "c"\ndecides = "infrastructure"\nrefuted_by = "r"\nserves = ["D1"]',
      true,
    ],
    [
      "decisive without graph_node",
      '[proposition]\nid = "D1"\nclaim = "c"\ndecides = "decisive"\nrefuted_by = "r"',
      false,
    ],
    [
      "prerequisite with empty serves",
      '[proposition]\nid = "P1"\nclaim = "c"\ndecides = "prerequisite"\nrefuted_by = "r"\nserves = []',
      false,
    ],
    [
      "multi-line claim",
      '[proposition]\nid = "I1"\nclaim = """one\ntwo"""\ndecides = "infrastructure"\nrefuted_by = "r"\nserves = ["D1"]',
      false,
    ],
    [
      "unknown decides",
      '[proposition]\nid = "I1"\nclaim = "c"\ndecides = "nice-to-have"\nrefuted_by = "r"\nserves = ["D1"]',
      false,
    ],
    [
      "missing refuted_by",
      '[proposition]\nid = "I1"\nclaim = "c"\ndecides = "infrastructure"\nserves = ["D1"]',
      false,
    ],
    [
      "unknown key",
      '[proposition]\nid = "I1"\nclaim = "c"\ndecides = "infrastructure"\nrefuted_by = "r"\nserves = ["D1"]\nnote = "x"',
      false,
    ],
  ])("%s", (_name, table, ok) => {
    const r = parseTicket(withProposition(table));
    expect(r.kind).toBe(ok ? "ticket" : "invalid");
    if (!ok) expect(r.kind === "invalid" && r.reason).toContain("proposition");
  });

  test("the promise block opens with the recap", () => {
    const r = parseTicket(
      withProposition(
        '[proposition]\nid = "D1"\nclaim = "latest edition reaches the lineage best"\ndecides = "decisive"\nrefuted_by = "an arena below its best"\ngraph_node = "n1"',
      ),
    );
    expect(r.kind).toBe("ticket");
    if (r.kind !== "ticket") return;
    const block = promiseBlock(r.ticket, "/repo", "read-only", "token");
    expect(block.split("\n").slice(0, 3)).toEqual([
      "Proposition D1 (decisive): latest edition reaches the lineage best",
      "refuted_by: an arena below its best",
      "graph_node: n1",
    ]);
  });
});
