// bun test for scripts/lint-no-try-catch.ts — the house try/catch ban for this repo's
// scripts/*.ts.
import { describe, expect, test } from "bun:test";
import { findBannedCatches, stripNonCode } from "../lint-no-try-catch";

describe("stripNonCode", () => {
  test("blanks a line comment but keeps the newline, and the length", () => {
    const source = "a // catch\nb";
    const stripped = stripNonCode(source);
    expect(stripped.length).toBe(source.length);
    expect(stripped.split("\n")).toEqual(["a".padEnd(10, " "), "b"]);
    expect(stripped).not.toContain("catch");
  });

  test("blanks a block comment across lines, preserving length per line", () => {
    const source = "a /* catch\nstill */ b";
    const stripped = stripNonCode(source);
    expect(stripped.length).toBe(source.length);
    expect(stripped).not.toContain("catch");
    expect(stripped.endsWith("b")).toBe(true);
  });

  test("blanks a string literal's contents", () => {
    const stripped = stripNonCode('x("catch me")');
    expect(stripped.length).toBe('x("catch me")'.length);
    expect(stripped).not.toContain("catch");
  });

  test("blanks a template literal's contents", () => {
    const stripped = stripNonCode("x(`catch ${y}`)");
    expect(stripped.length).toBe("x(`catch ${y}`)".length);
    expect(stripped).not.toContain("catch");
  });

  test("real code outside comments/strings is preserved", () => {
    expect(stripNonCode("try { f() } catch (e) {}")).toBe(
      "try { f() } catch (e) {}",
    );
  });
});

describe("findBannedCatches", () => {
  test("flags a plain try/catch", () => {
    const findings = findBannedCatches(
      "function f() {\n  try {\n    g();\n  } catch (e) {}\n}",
    );
    expect(findings).toEqual([{ line: 4 }]);
  });

  test("flags a bindingless catch too", () => {
    const findings = findBannedCatches("try {\n  g();\n} catch {}\n");
    expect(findings).toEqual([{ line: 3 }]);
  });

  test("does NOT flag try/finally with no catch clause", () => {
    expect(findBannedCatches("try {\n  g();\n} finally {\n  h();\n}")).toEqual(
      [],
    );
  });

  test("does NOT flag promise.catch(...)", () => {
    expect(
      findBannedCatches("main().catch((err) => { report(err); });"),
    ).toEqual([]);
  });

  test("does NOT flag promise.catch(...) split across a newline before the dot", () => {
    expect(
      findBannedCatches("main()\n  .catch((err) => { report(err); });"),
    ).toEqual([]);
  });

  test("does NOT flag the word 'catch' inside a string or comment", () => {
    expect(findBannedCatches('const s = "please catch this";')).toEqual([]);
    expect(findBannedCatches("// catch this later\nconst x = 1;")).toEqual([]);
  });

  test("a declared // try-catch-exception: marker suppresses the finding", () => {
    const source =
      "// try-catch-exception: JSON.parse has no safe variant handy here\n" +
      "try {\n  JSON.parse(s);\n} catch (e) {}\n";
    expect(findBannedCatches(source)).toEqual([]);
  });

  test("a marker more than 300 chars back does not suppress a later catch", () => {
    const filler = "x".repeat(320);
    const source = `// try-catch-exception: too far back\n${filler}\ntry {\n  g();\n} catch (e) {}\n`;
    expect(findBannedCatches(source).length).toBe(1);
  });

  test("multiple catches in one file are all reported with correct line numbers", () => {
    const source =
      "try {\n  a();\n} catch (e) {}\n\ntry {\n  b();\n} catch (e) {}\n";
    expect(findBannedCatches(source)).toEqual([{ line: 3 }, { line: 7 }]);
  });

  test("clean file with zero catches -> empty", () => {
    expect(
      findBannedCatches("const x = 1;\nfunction f() { return x; }\n"),
    ).toEqual([]);
  });
});
