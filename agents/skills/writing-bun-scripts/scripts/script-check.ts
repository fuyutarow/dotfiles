// script-check.ts — mechanical floor for house Bun TypeScript scripts (writing-bun-scripts).
// Run: bun script-check.ts <file.ts ...>   Consumer: agent (verdict lines).
// Exit: 0 clean (WARNs allowed — they inform, they do not gate) / 1 any FAIL / 2 fatal.
//
// THIS IS NOT A SEMANTIC CHECK. It greps structure only, with declared heuristics
// (per-call windows, line-based comment stripping). It cannot judge: whether the declared
// consumer/envelope is right, exit-code discipline, whether a bash shim was classified
// correctly, timeout values, or test adequacy — those are BG1–BG4 judgment.
//
// Checks (owner: writing-bun-scripts SKILL.md gates; facts: references/bun-facts.md):
//   F1  node shebang            — bun honors `#!/usr/bin/env node` and would exec node
//   W8  any other shebang       — BG1: shebang only on binary-substituted fixtures
//   F2  CommonJS require        — scripts are ESM only (top-level await incompatible)
//   F3  external import         — bare import FAIL unless an ancestor package.json+bun.lock
//                                 (BG3 graduation, resolved on the file's REALPATH) declares it
//                                 at an EXACT version; ALWAYS FAIL inside hooks/ (they run
//                                 before any install); pinned inline import WARN (cwd trap);
//                                 computed dynamic WARN
//   F5  type-flag unguarded     — typeFlag() without an unknownFlags guard: unlike parseArgs
//                                 strict, it accepts unknown flags silently and exits 0
//   W11 type-flag Number        — a Number flag with no null check: bad input yields null, not
//                                 a throw, so the failure is silent
//   F4  child_process exec()    — string-shell; use Bun.$ or spawn array-form
//   W5  unbounded spawn         — per-call: no timeout:/signal: in the call window and no
//                                 `// bounded: <reason>` beside it
//   W6  setTimeout + kill       — hand-rolled timeout; native Bun.spawn timeout: exists
//   W7  unpinned bunx           — bunx staleness is real; pin pkg@x.y.z
//   W9  .killed as detector     — true after a clean exit; use AbortSignal.timeout + aborted
//   W10 sequential pipe drain   — stdout-then-stderr deadlocks; drain via Promise.all

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";

let failures = 0;
let warnings = 0;

function fail(file: string, message: string): void {
  process.stdout.write(`FAIL ${file}: ${message}\n`);
  failures += 1;
}

function warn(file: string, message: string): void {
  process.stdout.write(`WARN ${file}: ${message}\n`);
  warnings += 1;
}

// Split tokens so this file's own source does not trip its own scans (self-scan guard).
const BUNX = "bun" + "x";
const KILLED = "kill" + "ed";
const BUNX_PATTERN = new RegExp(`\\b${BUNX}\\b`);

const IMPORT_SPECIFIER =
  /(?:^|\s)(?:import|export)\s+[^"'()]*?from\s+["']([^"']+)["']|(?:^|\s)import\s+["']([^"']+)["']|import\s*\(\s*["'`]([^"'`$]+)["'`]\s*\)/g;
const COMPUTED_DYNAMIC_IMPORT = /import\s*\(\s*(?:`[^`]*\$\{|[A-Za-z_$])/;
const BOUNDED_NOTE = /\/\/\s*bounded:\s*\S/;

function classifySpecifier(spec: string): "builtin" | "relative" | "pinned" | "bare" {
  if (spec.startsWith("node:") || spec.startsWith("bun:") || spec === "bun") return "builtin";
  if (spec.startsWith(".") || spec.startsWith("/")) return "relative";
  // pinned: name@range or @scope/name@range (an @ after the first character)
  return spec.slice(1).includes("@") ? "pinned" : "bare";
}

// --- BG3 graduation resolution -------------------------------------------------------------
// A bare specifier is legal when a graduation project GOVERNS the file: the nearest ancestor
// package.json (walking the file's REALPATH, because skills are symlinked into ~/.claude/skills
// and Bun resolves through the link) that has a sibling bun.lock, declaring the dep at an EXACT
// version. A range pin (^ ~ * x) is not a pin — PINNED-OR-ABSENT.
type Graduation = { root: string; deps: Map<string, string> };
const graduationCache = new Map<string, Graduation | null>();

function findGraduation(fromFile: string): Graduation | null {
  let directory = dirname(realpathSync(fromFile));
  const seen: string[] = [];
  for (;;) {
    const cached = graduationCache.get(directory);
    if (cached !== undefined) {
      for (const d of seen) graduationCache.set(d, cached);
      return cached;
    }
    seen.push(directory);
    const manifest = join(directory, "package.json");
    if (existsSync(manifest) && existsSync(join(directory, "bun.lock"))) {
      let deps = new Map<string, string>();
      try {
        const parsed = JSON.parse(readFileSync(manifest, "utf8")) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        deps = new Map(
          Object.entries({ ...parsed.dependencies, ...parsed.devDependencies }),
        );
      } catch {
        deps = new Map();
      }
      const found: Graduation = { root: directory, deps };
      for (const d of seen) graduationCache.set(d, found);
      return found;
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  for (const d of seen) graduationCache.set(d, null);
  return null;
}

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

// A graduation project licenses bare imports only for code that STAYS inside it. Two classes
// leave and must remain zero-dep, because where they run there is no lockfile and no install:
//   1. hooks/ — run on every harness event, before any `mise run deps` on this machine;
//   2. any tree marked with a `.zero-dep` file — skills that are mirrored, persisted, or
//      degit-copied into other people's repos, and `templates/` shipped into deliverables.
// The marker is the escape hatch for (2) because "does this get distributed?" is not something
// a floor can infer from a path.
function zeroDepReason(file: string): string | null {
  const path = realpathSync(file).replaceAll("\\", "/");
  if (/(^|\/)(hooks|templates)\//.test(path)) {
    return "it lives under hooks/ or templates/ — that code runs where no install has happened";
  }
  let directory = dirname(path);
  for (;;) {
    if (existsSync(join(directory, ".zero-dep"))) {
      return `${directory}/.zero-dep marks this tree as distributed — it runs outside this repo's lockfile`;
    }
    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

// Line-based comment stripping: drops // lines and /* ... */ block interiors (heuristic —
// a string literal containing comment markers can confuse it; acceptable for a floor).
function codeLines(source: string): string {
  const kept: string[] = [];
  let inBlock = false;
  for (const line of source.split("\n")) {
    let text = line;
    if (inBlock) {
      const close = text.indexOf("*/");
      if (close === -1) continue;
      text = text.slice(close + 2);
      inBlock = false;
    }
    if (/^\s*\/\//.test(text)) continue;
    const open = text.indexOf("/*");
    if (open !== -1 && !text.slice(open + 2).includes("*/")) {
      text = text.slice(0, open);
      inBlock = true;
    }
    kept.push(text);
  }
  return kept.join("\n");
}

async function checkFile(file: string): Promise<void> {
  const bunFile = Bun.file(file);
  if (!(await bunFile.exists())) {
    fail(file, "file not found");
    return;
  }
  const source = await bunFile.text();
  const lines = source.split("\n");
  const code = codeLines(source);

  // F1 / W8 — shebang policy
  const shebang = lines[0]?.startsWith("#!") ? lines[0] : undefined;
  if (shebang !== undefined) {
    if (shebang.includes("node")) {
      fail(file, "shebang names node — bun honors it and executes node; use env bun or none (BG1)");
    } else {
      warn(file, "shebang present — legal only on a binary-substituted fixture (BG1); ordinary scripts run `bun <path>`");
    }
  }

  // F2 — CJS require
  // (messages below avoid the literal token sequences the detectors grep for,
  //  so this floor stays clean when run over its own source)
  if (/\brequire\s*\(/.test(code)) {
    fail(file, "CommonJS require — house scripts are ESM only (BG1)");
  }

  // F3 — import specifiers (static, side-effect, and dynamic incl. backtick literals)
  for (const match of code.matchAll(IMPORT_SPECIFIER)) {
    const spec = match[1] ?? match[2] ?? match[3];
    if (spec === undefined) continue;
    const kind = classifySpecifier(spec);
    if (kind === "bare") {
      const zeroDep = zeroDepReason(file);
      const graduation = zeroDep === null ? findGraduation(file) : null;
      const declared = graduation?.deps.get(spec);
      if (zeroDep !== null) {
        fail(
          file,
          `external dependency '${spec}' in a zero-dep tree — ${zeroDep} (BG3), graduation project or not`,
        );
      } else if (declared === undefined) {
        fail(
          file,
          `unpinned external dependency '${spec}' — BG3 ladder: builtin, pinned ${BUNX}, or graduate (no governing package.json+bun.lock declares it)`,
        );
      } else if (!EXACT_VERSION.test(declared)) {
        fail(
          file,
          `'${spec}' is declared as '${declared}' in ${graduation?.root}/package.json — a range is not a pin (PINNED-OR-ABSENT); use an exact version`,
        );
      }
    } else if (kind === "pinned") {
      warn(file, `pinned inline dependency '${spec}' — throws under any ancestor node_modules (facts §4); known-clean-cwd one-offs only`);
    }
  }
  if (COMPUTED_DYNAMIC_IMPORT.test(code)) {
    warn(file, "dynamic import with a computed specifier — floor cannot classify it; BG3 by hand");
  }

  // F5 / W11 — type-flag's two silent failures. It is not a drop-in for parseArgs `strict: true`:
  // an unknown flag lands in `unknownFlags` and the process still exits 0, and a malformed
  // Number lands as `null` rather than throwing. Both were measured, 2026-07-28.
  if (/\btypeFlag\s*\(/.test(code)) {
    if (!/\bunknownFlags\b/.test(code)) {
      fail(
        file,
        "typeFlag() without an unknownFlags guard — unknown flags are accepted silently and the process exits 0 (parseArgs strict threw); reject them explicitly",
      );
    }
    // F6 — a camelCase schema key silently becomes a SECOND accepted CLI spelling: declaring
    // `dryRun` makes both `--dry-run` and `--dryRun` valid, widening the contract compared with
    // parseArgs, which accepted only what was declared. Declaring the key in kebab removes the
    // alias entirely (measured 2026-07-28), and the unknownFlags guard then rejects it.
    // Heuristic: object keys immediately followed by `{ type:` anywhere in the file.
    for (const match of code.matchAll(/^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*\{\s*type:/gm)) {
      const key = match[1] ?? "";
      if (/[a-z][A-Z]/.test(key)) {
        fail(
          file,
          `type-flag schema key '${key}' is camelCase — it also registers '--${key}' as a valid flag, widening the CLI contract; declare it as the kebab spelling ('${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}') instead`,
        );
      }
    }

    if (/type:\s*Number\b/.test(code) && !/===\s*null|!==\s*null|\?\?|Number\.isFinite/.test(code)) {
      warn(
        file,
        "type-flag Number flag with no null/finite check — malformed input coerces to null, not a throw; validate before use",
      );
    }
  }

  // F4 — string-shell exec
  if (/child_process/.test(code) && /\b(?:exec|execSync)\s*\(/.test(code)) {
    fail(file, "child_process exec/execSync — string shell; use Bun.$ or spawn array-form (BG2)");
  }

  // W5 — per-call: spawn with no timeout:/signal: in its window and no bounded note beside
  // it. Scans SOURCE (not stripped code): the bounded note IS a comment; cost is that a
  // spawn call inside a block comment can still WARN — acceptable floor noise.
  let unbounded = 0;
  const spawnAt = [...source.matchAll(/Bun\.spawn(?:Sync)?\s*\(/g)].map((m) => m.index ?? 0);
  spawnAt.forEach((at, i) => {
    const end = Math.min(at + 400, spawnAt[i + 1] ?? source.length);
    const window = source.slice(at, end);
    // shorthand `signal,` / `signal }` counts: the house AbortSignal idiom passes a
    // shorthand property, not `signal:`
    if (/\b(?:timeout\s*:|maxBuffer\s*:|killSignal\s*:|signal\s*[:,}])/.test(window)) return;
    const before = source.slice(Math.max(0, at - 200), at);
    if (BOUNDED_NOTE.test(before) || BOUNDED_NOTE.test(window)) return;
    unbounded += 1;
  });
  if (unbounded > 0) {
    warn(file, `${unbounded} spawn call(s) without timeout:/signal: or a \`// bounded: <reason>\` beside the call — hangable? (BG2)`);
  }

  // W6 — hand-rolled timeout+kill where a native option exists
  if (/setTimeout\s*\(/.test(code) && /\.kill\s*\(/.test(code)) {
    warn(file, "hand-rolled setTimeout+kill — native Bun.spawn timeout:/killSignal: exists (facts §3, REFACTOR)");
  }

  // W7 — bunx without any visible version pin
  if (BUNX_PATTERN.test(code) && !/@\d/.test(code)) {
    warn(file, `${BUNX} call with no visible @x.y.z pin — ${BUNX} staleness is real (facts §5)`);
  }

  // W9 — the kill flag read as a kill/timeout detector. It is true after a CLEAN exit too, so
  // a branch on it fires on every run and misreports success as a timeout (facts §3, measured).
  // Token split so this file's own source does not trip the scan (self-scan guard, as BUNX).
  if (new RegExp(`\\.${KILLED}\\b`).test(code)) {
    warn(file, `\`.${KILLED}\` present — it is true after a clean exit; bound with AbortSignal.timeout and read \`sig.aborted\` (facts §3)`);
  }

  // W10 — sequential drain of a child's two pipes. Awaiting stdout to completion and THEN
  // stderr deadlocks the moment the child fills the pipe nobody is reading; the symptom is
  // your own timeout firing, which reads as "the child is slow" (facts §3).
  const drainsStdout = /new Response\(\s*[\w.]*\.stdout\s*\)/.test(code);
  const drainsStderr = /new Response\(\s*[\w.]*\.stderr\s*\)/.test(code);
  if (drainsStdout && drainsStderr && !/Promise\.all/.test(code)) {
    warn(file, "drains .stdout and .stderr but no Promise.all — sequential drain deadlocks on a full pipe (facts §3)");
  }
}

async function main(): Promise<void> {
  const files = Bun.argv.slice(2);
  if (files.length === 0) {
    throw new Error("usage: bun script-check.ts <file.ts ...>");
  }
  for (const file of files) await checkFile(file);
  process.stdout.write(
    `floor: FAIL=${failures} WARN=${warnings} (files=${files.length}) — structure only; BG1-BG4 judgment is not covered\n`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  process.stderr.write(`FATAL: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
