// House-specific hard rule for THIS repo's own production Bun scripts (scripts/*.ts): no
// try/catch. `catch (e)` types `e` as unknown (TS gives no static guarantee about what a callee
// throws, and a function's signature never says WHETHER it throws) — exactly the two failure
// modes neverthrow's `Result<T, E>` makes visible in the type system instead of hidden at a
// runtime boundary. Wrap a throwing call with `fromThrowable()` and branch on the Result.
//
// What this does NOT ban:
//   - `try { } finally { }` with no catch clause — neither problem above applies (nothing is
//     typed as unknown, nothing is swallowed), and it legitimately can't be expressed as a
//     Result chain (see cache-clean.ts's runBunStep for the neverthrow-native replacement of
//     the try/finally this repo used to write for that same "always cleanup" shape).
//   - `promise.catch(...)` — Promise's own method, not this statement. BG1's mandated
//     `main().catch((err) => …)` entry pattern is exactly this and stays untouched.
//
// Scope: scripts/*.ts only (wired into mise.toml's `lint:no-try-catch`, called with that exact
// glob). Deliberately NOT agents/claude/hooks/** — BG3 hooks stay zero-dep forever (they run
// before any install), so they cannot import neverthrow and could never comply. Deliberately NOT
// agents/skills/**/scripts/** — a skill's own floor is writing-bun-scripts' script-check.ts; a
// house policy this narrow doesn't reach into skill content, which is forging-skills' territory.
//
// Escape hatch: a `// try-catch-exception: <reason>` comment within a few lines above the
// `catch` — same declared-not-silent shape as the house's existing `// bounded: <reason>`
// convention (BG2). For a genuinely foreign boundary (JSON.parse with no safe variant handy, an
// unavoidable top-level catch-all), declare it rather than silently exempting it.
//
// THIS IS STRUCTURE ONLY, same floor as writing-bun-scripts' script-check.ts: it greps, it does
// not parse. `catch` is scanned for as a bare keyword after stripping comments/strings/
// templates; a `try` statement can only occur where a STATEMENT is legal, never inside a
// template literal's `${...}` interpolation (an expression position) — so treating an entire
// backtick literal as opaque, without recursing into `${}`, can never hide a REAL try/catch. It
// can only ever hide the word "catch" appearing in literal template TEXT, an accepted floor
// false-negative.
//
// Usage: bun scripts/lint-no-try-catch.ts <file.ts ...>
// Exit: 0 clean / 1 any FAIL / 2 fatal (bad args, file not found handled as a FAIL not a fatal).

import { cli } from "cleye";

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new Error("refusing prototype-mutating option '--__proto__'");
  }
}

/**
 * Blanks out `//` line comments, `/* *​/` block comments, and `"…"`/`'…'`/`` `…` `` string and
 * template contents to spaces (newlines preserved, so byte offsets stay meaningful for line-
 * number reporting) — a bare keyword scan then runs on what remains.
 */
export function stripNonCode(source: string): string {
  const output = Array.from(source, (c) => (c === "\n" ? "\n" : " "));
  let i = 0;
  while (i < source.length) {
    const c = source[i] ?? "";
    const next = source[i + 1] ?? "";
    if (c === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (
        i < source.length &&
        !(source[i] === "*" && source[i + 1] === "/")
      ) {
        i += 1;
      }
      i = Math.min(i + 2, source.length);
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i += 1;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\") i += 1;
        i += 1;
      }
      i += 1;
      continue;
    }
    output[i] = c;
    i += 1;
  }
  return output.join("");
}

const CATCH_KEYWORD = /\bcatch\b/g;
const EXCEPTION_MARKER = /\/\/\s*try-catch-exception:\s*\S/;

export type CatchFinding = { line: number };

/** Every bare `catch` keyword in `source` that is NOT `promise.catch(` and has no declared
 * `// try-catch-exception:` marker within the 300 characters before it. */
export function findBannedCatches(source: string): CatchFinding[] {
  const code = stripNonCode(source);
  const findings: CatchFinding[] = [];
  for (const match of code.matchAll(CATCH_KEYWORD)) {
    const at = match.index ?? 0;
    let before = at - 1;
    while (before >= 0 && /\s/.test(code[before] ?? "")) before -= 1;
    if ((code[before] ?? "") === ".") continue; // promise.catch(...) — a different thing

    const context = source.slice(Math.max(0, at - 300), at);
    if (EXCEPTION_MARKER.test(context)) continue;

    findings.push({ line: source.slice(0, at).split("\n").length });
  }
  return findings;
}

async function checkFile(file: string): Promise<number> {
  const bunFile = Bun.file(file);
  if (!(await bunFile.exists())) {
    process.stdout.write(`FAIL ${file}: file not found\n`);
    return 1;
  }
  const source = await bunFile.text();
  const findings = findBannedCatches(source);
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
