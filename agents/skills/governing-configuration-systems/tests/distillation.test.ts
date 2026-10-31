import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const skill = readFileSync(new URL("../SKILL.md", import.meta.url), "utf8");
const cases = readFileSync(new URL("triggers.md", import.meta.url), "utf8");

test("the opening carries the integrity, authority and target decisions", () => {
  const opening = skill.split("## Decisions")[0] ?? "";
  expect(opening).toMatch(/consumer and trust regime/u);
  expect(opening).toMatch(
    /exact bytes or (?:a|to a) named canonical value profile/u,
  );
  expect(opening).toMatch(/effective declaration and its authority/u);
  expect(opening).toMatch(/target actually consumes/u);
});

test("routing cases cover CLI sourcing and configuration integrity", () => {
  expect(cases).toContain(
    "Choose CLI flags, environment variables, precedence or XDG paths.",
  );
  expect(cases).toContain("designing-cli-contracts");
  expect(cases).toContain("Choose a signature boundary for a policy bundle.");
  expect(skill).toContain("base-usecase-first");
});
