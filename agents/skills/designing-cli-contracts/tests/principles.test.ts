import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");
const triggers = await readFile(
  new URL("triggers.md", import.meta.url),
  "utf8",
);

test("the description and opening convey the current CLI decisions", () => {
  const [frontmatter, body] = skill.split("\n---\n").slice(0, 2);
  expect(frontmatter).toContain("Use XDG config, cache and state");
  expect(frontmatter).toContain(
    "flags > environment > project > user > system",
  );
  expect(frontmatter).toContain("Never claim unobserved effects succeeded");
  const opening = body?.split("## Contract")[0] ?? "";
  expect(opening).toContain("A CLI is a protocol");
  expect(opening).toContain(
    "Select conventions for consumers and compatibility",
  );
});

test("the CLI modes and configuration boundary remain discoverable", () => {
  for (const text of [
    "noninteractive",
    "diagnostic",
    "irreversible",
    "governing-configuration-systems",
    "legacy",
  ]) {
    expect(skill.toLowerCase()).toContain(text);
  }
  for (const text of [
    "CI prompt",
    "error and recovery",
    "undo or confirmation",
    "config paths",
    "sign this config",
  ]) {
    expect(triggers).toContain(text);
  }
});

test("retired skills are not routing destinations", async () => {
  const retired = [
    "designing-interactions",
    "designing-developer-diagnostics",
    "practicing-unix-philosophy",
    "designing-by-contract",
  ];
  const ledger = await readFile(
    new URL("forge-verification-ledger.md", import.meta.url),
    "utf8",
  );
  const current = ledger.split("## Historical record")[0];
  for (const name of retired) {
    expect(skill).not.toContain(name);
    expect(current).not.toContain(`Moved: ${name}`);
  }
  expect(skill).toContain("base-usecase-first");
});

test("conditional CLIG defaults retain attribution and source anchors", () => {
  expect(skill).toContain("CC BY-SA 4.0");
  for (const anchor of [
    "help",
    "documentation",
    "arguments-and-flags",
    "subcommands",
    "output",
    "interactivity",
    "signals",
    "configuration",
    "environment-variables",
  ]) {
    expect(skill).toContain(`https://clig.dev/#${anchor}`);
  }
});
