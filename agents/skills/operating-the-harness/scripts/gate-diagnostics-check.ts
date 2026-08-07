// gate-diagnostics-check.ts — mechanical floor for the batched-diagnostics invariant in
// operating-the-harness §3.
// Run: bun gate-diagnostics-check.ts [<hooks-dir>]        default: $HOME/.claude/hooks
// Consumer: agent/human (verdict lines). Exit 0 clean / 1 findings / 2 environment-FATAL.
//
// THE INVARIANT. A PreToolUse gate that can fail on N INDEPENDENT axes must emit all N in one
// decision. Serial denial burns a turn per axis and teaches the caller that fixing one thing is
// enough. Independence is mechanical: does check B consume check A's output? No → batch them.
// Yes → poison (report A, suppress B's cascade).
//
// THIS IS NOT A SEMANTIC CHECK. It cannot see whether two checks are independent — that is the
// judgment the invariant asks for. What it does is force the judgment to be WRITTEN DOWN at every
// deny site, so adding a second axis cannot silently reintroduce serial denial. Every
// `decidePre("deny", …)` in an `enforce-*.ts` gate must carry one declaration within the 6 lines
// above it:
//
//   // FATAL: <why nothing else can be checked once this is true>
//   // SINGLE-AXIS: <why this gate can only fail one way>
//   // BATCHED(<axes>): <these independent axes are all reported in this one decision>
//
// A deny inside the trailing fail-closed `catch` is exempt — it reports the hook's own crash, not
// the caller's input. A file carrying a BATCHED declaration must additionally have a test proving
// the batching (a test title containing "ONE deny").
//
// What it CANNOT catch, and what judgment still owns:
//   - a declaration that is simply WRONG (two independent axes both marked SINGLE-AXIS, or a
//     recoverable check waved through as FATAL). The words are checked for presence, not truth.
//   - the same serialization inside ONE emitter — a batch that collects findings but returns
//     after the first.
//   - Stop-event detectors (`detect-*.ts`), which block through exit 2 + stderr rather than
//     decidePre. They are single-finding by construction today; if that changes, widen GATE_GLOB.

import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
// Bare specifier, not pinned inline: this tree is NOT zero-dep. It is symlinked (never
// mirrored/copied) into ~/.claude/skills by `mise run link:skills`, so the repo-root graduation
// project (package.json + bun.lock) governs it (BG3).
import { cli } from "cleye";

// PreToolUse gates only — the decidePre JSON channel. See the header note on detect-*.ts.
const GATE = /^enforce-.*\.ts$/;

// A declaration is two non-empty fields, like the LOW-EFFORT / RESOURCE-CLASS markers this repo
// already uses: the kind (with its parenthesised detail, where it takes one) and a reason.
const DECLARATION =
  /\/\/\s*(FATAL|SINGLE-AXIS|BATCHED\s*\(([^)]*)\))\s*:(.*)$/;

// How far above a deny site a declaration may sit. Generous enough for a guard + a blank line.
const LOOKBEHIND = 6;

// The proof obligation a BATCHED gate owes: a test that two axes come back in one decision.
const BATCH_TEST = "ONE deny";

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new Error(`unknown option '--${flag}'`);
  }
}

type Kind = "FATAL" | "SINGLE-AXIS" | "BATCHED";
type Finding = { file: string; line: number; problem: string };

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

// A deny site is `decidePre(` whose FIRST argument is the literal "deny". Both the one-line and
// the formatter's exploded form are matched; `decidePre("allow", …)` is not a gate decision.
function denyLines(source: string): number[] {
  const lines: number[] = [];
  const call = /\bdecidePre\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = call.exec(source)) !== null) {
    const head = source.slice(match.index + match[0].length).trimStart();
    if (!head.startsWith('"deny"') && !head.startsWith("'deny'")) continue;
    lines.push(source.slice(0, match.index).split("\n").length);
  }
  return lines;
}

// Everything from the LAST top-level `} catch` onward is the fail-closed handler.
function catchStart(source: string): number {
  const lines = source.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\}\s*catch\b/.test(lines[i])) return i + 1;
  }
  return Number.POSITIVE_INFINITY;
}

function declarationAbove(lines: string[], denyLine: number): Kind | null {
  const from = Math.max(0, denyLine - LOOKBEHIND);
  for (let i = denyLine - 1; i >= from; i--) {
    const match = DECLARATION.exec(lines[i]);
    if (match === null) continue;
    // Two non-empty fields: a bare marker is not a declaration.
    if (match[3].trim() === "") return null;
    if (match[1].startsWith("BATCHED")) {
      return (match[2] ?? "").trim() === "" ? null : "BATCHED";
    }
    return match[1] as Kind;
  }
  return null;
}

async function scan(file: string, testsDir: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const source = await readFile(file, "utf8");
  const lines = source.split("\n");
  const failClosed = catchStart(source);
  let batched = false;

  for (const line of denyLines(source)) {
    if (line >= failClosed) continue; // the hook's own crash, not the caller's input
    const kind = declarationAbove(lines, line);
    if (kind === null) {
      findings.push({
        file,
        line,
        problem:
          "undeclared deny — every deny site must carry `// FATAL: <why>`, " +
          "`// SINGLE-AXIS: <why>`, or `// BATCHED(<axes>): <why>` (two non-empty fields) " +
          "within the 6 lines above it, so a second axis cannot silently serialize denial",
      });
      continue;
    }
    if (kind === "BATCHED") batched = true;
  }

  if (!batched) return findings;

  const testFile = join(testsDir, `${basename(file, ".ts")}.test.ts`);
  if (!(await exists(testFile))) {
    findings.push({
      file,
      line: 1,
      problem: `declares BATCHED but has no test file at ${testFile}`,
    });
    return findings;
  }
  if (!(await readFile(testFile, "utf8")).includes(BATCH_TEST)) {
    findings.push({
      file,
      line: 1,
      problem:
        `declares BATCHED but ${basename(testFile)} has no batching test — add a case ` +
        `whose title contains "${BATCH_TEST}", asserting that two independent violations ` +
        "come back in a single decision naming both",
    });
  }
  return findings;
}

async function main(): Promise<number> {
  const parsed = cli(
    {
      name: "gate-diagnostics-check.ts",
      parameters: ["[hooks-dir]"],
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length > 1) {
    throw new Error(`unexpected argument '${parsed._[1]}'`);
  }
  const root = resolve(parsed._[0] ?? join(homedir(), ".claude", "hooks"));
  if (!(await exists(root))) {
    process.stderr.write(`FATAL: hooks directory not found: ${root}\n`);
    return 2;
  }

  const gates = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => !entry.isDirectory() && GATE.test(entry.name))
    .map((entry) => join(root, entry.name))
    .sort();
  if (gates.length === 0) {
    process.stdout.write(`RESULT: no enforce-*.ts gates under ${root}\n`);
    return 0;
  }

  const testsDir = join(root, "tests");
  const findings = (
    await Promise.all(gates.map((gate) => scan(gate, testsDir)))
  ).flat();
  if (findings.length === 0) {
    process.stdout.write(
      `GATE-DIAGNOSTICS PASS: ${gates.length} gate(s), every deny site declared\n`,
    );
    return 0;
  }

  for (const finding of findings) {
    process.stdout.write(
      `FAIL gate-diagnostics ${finding.file}:${finding.line}: ${finding.problem}\n`,
    );
  }
  process.stdout.write(
    `RESULT: ${findings.length} violation(s) across ${gates.length} gate(s)\n`,
  );
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    process.stderr.write(
      `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(2);
  });
