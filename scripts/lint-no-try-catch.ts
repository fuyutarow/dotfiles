// House-specific hard rule for THIS repo's own production Bun scripts (scripts/*.ts): no
// try/catch. `catch (e)` types `e` as unknown (TS gives no static guarantee about what a callee
// throws, and a function's signature never says WHETHER it throws) — exactly the two failure
// modes neverthrow's `Result<T, E>` makes visible in the type system instead of hidden at a
// runtime boundary. Wrap a throwing call with `fromThrowable()` and branch on the Result.
//
// What this does NOT ban:
//   - `try { } finally { }` with no catch clause (a TryStatement whose `handler` is null) —
//     neither problem above applies, and it legitimately can't be expressed as a Result chain
//     (see reclaim-clean.ts's runBunStep for the neverthrow-native replacement of the try/finally
//     this repo used to write for the "always cleanup" shape).
//   - `promise.catch(...)` — a CallExpression, not a TryStatement at all. BG1's mandated
//     `main().catch((err) => …)` entry pattern stays untouched.
//
// Scope: scripts/*.ts only (wired into mise.toml's `lint:no-try-catch`). Deliberately NOT
// agents/claude/hooks/** (BG3 hooks stay zero-dep forever — cannot import neverthrow OR
// oxc-parser) and NOT agents/skills/**/scripts/** (a skill's own floor is writing-bun-scripts'
// script-check.ts; a house policy this narrow doesn't reach into skill content).
//
// Escape hatch: a `// try-catch-exception: <reason>` comment attached before the try statement —
// same declared-not-silent shape as the house's existing `// bounded: <reason>` convention (BG2).
//
// AST-BASED, not a text scan: oxc-parser (0.149.0, pinned, same "ox" project as oxlint) gives a
// real parse tree — a `TryStatement` node is a `TryStatement` node; a comment or string literal
// can never be mistaken for one. This replaces an earlier regex/comment-stripping version of
// this file that had to self-scan-guard its OWN source twice (a `catch` spelled out inside a
// regex literal, and inside that regex literal's own string form, both tripped the text scanner
// on itself) — a structural bug class a real parser makes impossible by construction.
//
// oxlint itself (the ox suite's linter) CANNOT express this rule: verified empirically against
// oxlint 1.82.0 — even with every rule category enabled (`-D all`), a bare
// `try { foo() } catch (e) { bar() }` produces zero diagnostics, and oxlint has no
// `no-restricted-syntax`-equivalent generic AST-selector escape hatch (its rules are native
// per-rule visitors, not a configurable selector engine like ESLint's). Hence this file uses the
// ox project's PARSER directly rather than its linter.
//
// Usage: bun scripts/lint-no-try-catch.ts <file.ts ...>
// Exit: 0 clean / 1 any FAIL (including a file that fails to parse) / 2 fatal (bad args).

import { parseSync } from "oxc-parser";
import { cli } from "cleye";

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new Error("refusing prototype-mutating option '--__proto__'");
  }
}

const EXCEPTION_MARKER = /try-catch-exception:\s*\S/;
// A declared marker must be a comment that ends this close (in characters) before the try
// statement it excuses — generous enough for a short explanatory paragraph, not so generous a
// marker at the top of the file would quietly excuse everything below it.
const MARKER_LOOKBACK_CHARS = 300;

export type CatchFinding = { line: number };
export type AnalysisResult = {
  parseErrors: string[];
  findings: CatchFinding[];
};

type AstNode = {
  type?: string;
  start?: number;
  handler?: unknown;
  [key: string]: unknown;
};
type Comment = { end: number; value: string };

function offsetToLine(source: string, offset: number): number {
  return source.slice(0, offset).split("\n").length;
}

/** Depth-first walk collecting every TryStatement node with a non-null `handler` (a real catch
 * clause, with or without a bound parameter) — `try { } finally { }` alone has `handler: null`
 * and is never collected. */
function collectCatchingTryStatements(node: unknown, out: AstNode[]): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectCatchingTryStatements(item, out);
    return;
  }
  const n = node as AstNode;
  if (n.type === "TryStatement" && n.handler != null) out.push(n);
  for (const key of Object.keys(n)) {
    if (key === "type") continue;
    collectCatchingTryStatements(n[key], out);
  }
}

/** Parses `source` (as `fileName`'s extension dictates — .ts/.tsx/.js all supported) and
 * reports every catching TryStatement lacking a nearby `// try-catch-exception:` marker. A
 * parse failure is reported via `parseErrors` instead of throwing. */
export function analyzeSource(
  fileName: string,
  source: string,
): AnalysisResult {
  const result = parseSync(fileName, source);
  if (result.errors.length > 0) {
    return { parseErrors: result.errors.map((e) => e.message), findings: [] };
  }

  const tryStatements: AstNode[] = [];
  collectCatchingTryStatements(result.program, tryStatements);

  const comments = result.comments as Comment[];
  const findings: CatchFinding[] = [];
  for (const stmt of tryStatements) {
    const at = stmt.start ?? 0;
    const hasMarker = comments.some(
      (c) =>
        c.end <= at &&
        at - c.end <= MARKER_LOOKBACK_CHARS &&
        EXCEPTION_MARKER.test(c.value),
    );
    if (hasMarker) continue;
    findings.push({ line: offsetToLine(source, at) });
  }
  return {
    parseErrors: [],
    findings: findings.sort((a, b) => a.line - b.line),
  };
}

async function checkFile(file: string): Promise<number> {
  const bunFile = Bun.file(file);
  if (!(await bunFile.exists())) {
    process.stdout.write(`FAIL ${file}: file not found\n`);
    return 1;
  }
  const source = await bunFile.text();
  const { parseErrors, findings } = analyzeSource(file, source);
  if (parseErrors.length > 0) {
    process.stdout.write(`FAIL ${file}: does not parse — ${parseErrors[0]}\n`);
    return 1;
  }
  for (const finding of findings) {
    process.stdout.write(
      `FAIL ${file}:${finding.line}: try/catch is banned in this repo's scripts — return a neverthrow Result instead (fromThrowable), or declare \`// try-catch-exception: <reason>\` if genuinely unavoidable\n`,
    );
  }
  return findings.length;
}

async function main(): Promise<void> {
  await cli(
    {
      name: "lint-no-try-catch",
      parameters: ["<file...>"],
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      help: {
        description:
          "Ban try/catch in this repo's scripts/*.ts (house policy; use neverthrow's Result instead). Pass one or more .ts files.",
      },
    },
    async ({ _: { file: files } }) => {
      let failures = 0;
      for (const file of files) failures += await checkFile(file);
      process.stdout.write(
        `try-catch-ban: FAIL=${failures} (files=${files.length})\n`,
      );
      process.exitCode = failures === 0 ? 0 : 1;
    },
    Bun.argv.slice(2),
  );
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(
      `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  });
}
