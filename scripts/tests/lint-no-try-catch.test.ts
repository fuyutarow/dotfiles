// bun test for scripts/lint-no-try-catch.ts — the house try/catch ban for this repo's
// scripts/*.ts. AST-based (oxc-parser), not a text scan — see the file's own header for why.
import { describe, expect, test } from "bun:test";
import { analyzeSource } from "../lint-no-try-catch";

function findings(source: string): { line: number }[] {
  const result = analyzeSource("test.ts", source);
  expect(result.parseErrors).toEqual([]);
  return result.findings;
}

describe("analyzeSource", () => {
  test("flags a plain try/catch", () => {
    expect(
      findings("function f() {\n  try {\n    g();\n  } catch (e) {}\n}"),
    ).toEqual([{ line: 2 }]);
  });

  test("flags a bindingless catch too", () => {
    expect(findings("try {\n  g();\n} catch {}\n")).toEqual([{ line: 1 }]);
  });

  test("does NOT flag try/finally with no catch clause", () => {
    expect(findings("try {\n  g();\n} finally {\n  h();\n}")).toEqual([]);
  });

  test("does NOT flag promise.catch(...)", () => {
    expect(findings("main().catch((err) => { report(err); });")).toEqual([]);
  });

  test("does NOT flag promise.catch(...) split across a newline before the dot", () => {
    expect(findings("main()\n  .catch((err) => { report(err); });")).toEqual(
      [],
    );
  });

  test("does NOT flag the word 'catch' inside a string, comment, or regex literal", () => {
    expect(findings('const s = "please catch this";')).toEqual([]);
    expect(findings("// catch this later\nconst x = 1;")).toEqual([]);
    expect(findings("const re = /catch/;")).toEqual([]);
  });

  test("a declared // try-catch-exception: marker suppresses the finding", () => {
    const source =
      "// try-catch-exception: JSON.parse has no safe variant handy here\n" +
      "try {\n  JSON.parse(s);\n} catch (e) {}\n";
    expect(findings(source)).toEqual([]);
  });

  test("a marker more than 300 chars back does not suppress a later catch", () => {
    const filler = "const pad = 1;\n".repeat(30);
    const source = `// try-catch-exception: too far back\n${filler}try {\n  g();\n} catch (e) {}\n`;
    expect(findings(source).length).toBe(1);
  });

  test("multiple catches in one file are all reported with correct line numbers", () => {
    const source =
      "try {\n  a();\n} catch (e) {}\n\ntry {\n  b();\n} catch (e) {}\n";
    expect(findings(source)).toEqual([{ line: 1 }, { line: 5 }]);
  });

  test("clean file with zero catches -> empty", () => {
    expect(findings("const x = 1;\nfunction f() { return x; }\n")).toEqual([]);
  });

  test("a nested try/catch inside a try/finally is still flagged", () => {
    const source =
      "try {\n  try {\n    a();\n  } catch (e) {}\n} finally {\n  cleanup();\n}\n";
    expect(findings(source)).toEqual([{ line: 2 }]);
  });

  test("a file that fails to parse reports a parseError, not a crash", () => {
    const result = analyzeSource("broken.ts", "function f( {");
    expect(result.parseErrors.length).toBeGreaterThan(0);
    expect(result.findings).toEqual([]);
  });
});
