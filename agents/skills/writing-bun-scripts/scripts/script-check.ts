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
//   F3  external import         — unpinned bare import FAIL (incl. backtick dynamic import);
//                                 pinned inline import WARN (cwd trap); computed dynamic WARN
//   F4  child_process exec()    — string-shell; use Bun.$ or spawn array-form
//   W5  unbounded spawn         — per-call: no timeout:/signal: in the call window and no
//                                 `// bounded: <reason>` beside it
//   W6  setTimeout + kill       — hand-rolled timeout; native Bun.spawn timeout: exists
//   W7  unpinned bunx           — bunx staleness is real; pin pkg@x.y.z

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

// Split token so this file's own source does not trip its bunx scan (self-scan guard).
const BUNX = "bun" + "x";
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
      fail(file, `unpinned external dependency '${spec}' — BG3 ladder: builtin, pinned ${BUNX}, or graduate`);
    } else if (kind === "pinned") {
      warn(file, `pinned inline dependency '${spec}' — throws under any ancestor node_modules (facts §4); known-clean-cwd one-offs only`);
    }
  }
  if (COMPUTED_DYNAMIC_IMPORT.test(code)) {
    warn(file, "dynamic import with a computed specifier — floor cannot classify it; BG3 by hand");
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
