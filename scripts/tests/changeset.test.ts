import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ChangesetSchema,
  formatChangeset,
  parseChangeset,
  writeChangeset,
} from "../changeset.ts";

const root = join(import.meta.dir, "../..");
const temporary: string[] = [];
const fnoxNewlineChangeset =
  "bump: patch\n\nRemove exactly one output newline from fnox get before verification. Account for fnox stdin set trimming surrounding whitespace and disclose that normalization when it changes the source value; retain SHA-256 mismatch failures for stored byte changes.\n";

afterEach(() => {
  for (const path of temporary.splice(0))
    rmSync(path, { recursive: true, force: true });
});

test("formatChangeset round-trips through the shared schema parser", () => {
  const changeset = { bump: "minor" as const, entry: "Add relay support" };
  const parsed = parseChangeset(formatChangeset(changeset));
  expect(parsed.isOk()).toBe(true);
  if (parsed.isOk()) expect(parsed.value).toEqual(changeset);
  expect(ChangesetSchema.safeParse(changeset)).toMatchObject({
    success: true,
    data: changeset,
  });
});

test("the checked-in relay changeset bytes parse as one changeset", () => {
  const text = readFileSync(
    join(root, "tools/secrets-push/.changes/relay.md"),
    "utf8",
  );
  const parsed = parseChangeset(text);
  expect(parsed.isOk()).toBe(true);
  if (parsed.isOk())
    expect(parsed.value).toEqual({
      bump: "minor",
      entry:
        "Relay selected fnox secrets from local or SSH sources to SSH targets and verify each transfer by SHA-256.",
    });
});

test("the landed delimiter-less fnox newline changeset bytes parse", () => {
  const parsed = parseChangeset(fnoxNewlineChangeset);
  expect(parsed.isOk()).toBe(true);
  if (parsed.isOk())
    expect(parsed.value).toEqual({
      bump: "patch",
      entry:
        "Remove exactly one output newline from fnox get before verification. Account for fnox stdin set trimming surrounding whitespace and disclose that normalization when it changes the source value; retain SHA-256 mismatch failures for stored byte changes.",
    });
});

test.each([
  ["delimiters and blank line", "---\nbump: patch\n---\n\nFix issue\n"],
  ["no delimiters or blank line", "bump: patch\nFix issue\n"],
  ["delimiters without blank line", "---\nbump: patch\n---\nFix issue\n"],
  ["blank line without delimiters", "bump: patch\n\nFix issue\n"],
])("layout variant %s normalizes to the same changeset", (_name, text) => {
  const parsed = parseChangeset(text);
  expect(parsed.isOk()).toBe(true);
  if (parsed.isOk())
    expect(parsed.value).toEqual({ bump: "patch", entry: "Fix issue" });
});

test.each([
  ["two entry lines", "bump: patch\n\nFirst line\nSecond line\n"],
  ["unknown bump", "bump: huge\n\nEntry\n"],
  ["empty entry", "bump: patch\n\n\n"],
])("parser rejects %s", (_name, text) => {
  expect(parseChangeset(text).isErr()).toBe(true);
});

test("generator writes canonical changesets and makes duplicate slugs unique", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "changeset-generator-test-"));
  temporary.push(tempRoot);
  const changes = join(tempRoot, "tools", "sample", ".changes");
  mkdirSync(changes, { recursive: true });
  const first = writeChangeset(tempRoot, "sample", "patch", "Fix an issue");
  const second = writeChangeset(tempRoot, "sample", "patch", "Fix an issue");
  expect(first.isOk()).toBe(true);
  expect(second.isOk()).toBe(true);
  if (first.isOk() && second.isOk()) {
    expect(first.value).toBe("tools/sample/.changes/fix-an-issue.md");
    expect(second.value).toBe("tools/sample/.changes/fix-an-issue-2.md");
    expect(readFileSync(join(tempRoot, first.value), "utf8")).toBe(
      "---\nbump: patch\n---\n\nFix an issue\n",
    );
  }
});
