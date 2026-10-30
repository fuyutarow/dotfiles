import { expect, test } from "bun:test";

const skill = await Bun.file(new URL("../SKILL.md", import.meta.url)).text();

test("opening carries the three implementation principles and route", () => {
  const opening = skill.split("## Runtime and distribution")[0];
  expect(opening).toContain("Preserve the consumer's contract");
  expect(opening).toContain("independent of cwd and reproducible dependencies");
  expect(opening).toContain("bounded Bun primitives and evidence");
  expect(opening).toContain("designing-command-line-interfaces");
});

test("selection cases cover local work and adjacent owners", () => {
  const cases = skill.split("## Selection cases")[1];
  expect(cases).toContain("Convert a local Bash script to Bun TS");
  expect(cases).toContain("Refactor existing skill scripts");
  expect(cases).toContain("Add a hook detector");
  expect(cases).toContain("`wiring-mise-tasks`");
  expect(cases).toContain("`designing-command-line-interfaces`");
});
