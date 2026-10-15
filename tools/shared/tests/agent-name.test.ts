import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  agentNameFor,
  formatAgentName,
  isValidRole,
  parseAgentName,
  projectSlug,
} from "../src/agent-name.ts";

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
const parseRows = rows.flatMap(([kind, name, project, role, id]) =>
  kind === "parse" &&
  name !== undefined &&
  project !== undefined &&
  role !== undefined &&
  id !== undefined
    ? [{ name, project, role, id }]
    : [],
);

describe("vector table", () => {
  test("is non-empty in both kinds", () => {
    expect(formatRows.length).toBeGreaterThan(5);
    expect(parseRows.length).toBeGreaterThan(5);
  });

  for (const v of formatRows) {
    test(`format ${v.cwd} ${v.role} ${v.id}`, () => {
      expect(agentNameFor(v.cwd, v.role, v.id)).toBe(v.name);
      expect(v.name.split("_").length).toBe(2);
    });
  }

  for (const v of parseRows) {
    test(`parse ${v.name}`, () => {
      const parsed = parseAgentName(v.name);
      if (v.project === "-") expect(parsed).toBeNull();
      else
        expect(parsed).toEqual({
          project: v.project,
          role: v.role,
          id: v.id,
        });
    });
  }
});

describe("round trip", () => {
  test("parse(format(x)) returns the slug, role and id", () => {
    for (const v of formatRows) {
      const parsed = parseAgentName(v.name);
      expect(parsed).not.toBeNull();
      expect(formatAgentName(parsed ?? { project: "", role: "", id: "" })).toBe(
        v.name,
      );
    }
  });

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
