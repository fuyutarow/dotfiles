import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { agentNameFor, isValidRole, projectSlug } from "../src/agent-name.ts";

const rows = readFileSync(
  join(import.meta.dir, "fixtures", "agent-name-vectors.tsv"),
  "utf8",
)
  .split("\n")
  .filter((line) => line !== "" && !line.startsWith("#"))
  .map((line) => line.split("\t"));

const formatRows = rows.flatMap(([kind, cwd, role, id, name]) =>
  kind === "format" &&
  cwd !== undefined &&
  role !== undefined &&
  id !== undefined &&
  name !== undefined
    ? [{ cwd, role, id, name }]
    : [],
);
describe("vector table", () => {
  test("contains format cases", () => {
    expect(formatRows.length).toBeGreaterThan(5);
  });

  for (const v of formatRows) {
    test(`format ${v.cwd} ${v.role} ${v.id}`, () => {
      expect(agentNameFor(v.cwd, v.role, v.id)).toBe(v.name);
      expect(v.name.split("_").length).toBe(2);
    });
  }
});

describe("round trip", () => {
  test("a project segment never contains an underscore", () => {
    for (const dir of ["a_b", "A__B", "a b", "a.b_c-d", "_x_"])
      expect(projectSlug(dir)).not.toContain("_");
  });
});

describe("isValidRole", () => {
  test("accepts a lowercase word, rejects `-`, `_`, uppercase and over-long", () => {
    expect(isValidRole("obs")).toBe(true);
    expect(isValidRole("a-b")).toBe(false);
    expect(isValidRole("a_b")).toBe(false);
    expect(isValidRole("OBS")).toBe(false);
    expect(isValidRole("a".repeat(13))).toBe(false);
  });
});
