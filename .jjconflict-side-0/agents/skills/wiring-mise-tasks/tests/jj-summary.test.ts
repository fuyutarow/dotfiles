import { describe, expect, test } from "bun:test";
import { summaryPaths } from "../scripts/jj-summary.ts";

describe("summaryPaths", () => {
  test("a rename yields both sides; add/modify/delete yield their path; a copy only its target", () => {
    const summary = [
      "M agents/claude/README.md",
      "A agents/hooks/new.ts",
      "D old/gone.ts",
      "R agents/{claude => }/hooks/enforce-search-route.ts",
      "R {a.txt => b.txt}",
      "R src/{x => y/z}/f.ts",
      "C lib/{one => two}.ts",
      "",
    ].join("\n");
    expect(summaryPaths(summary)).toEqual([
      "agents/claude/README.md",
      "agents/hooks/new.ts",
      "old/gone.ts",
      "agents/claude/hooks/enforce-search-route.ts",
      "agents/hooks/enforce-search-route.ts",
      "a.txt",
      "b.txt",
      "src/x/f.ts",
      "src/y/z/f.ts",
      "lib/two.ts",
    ]);
  });
});
