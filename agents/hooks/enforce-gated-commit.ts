// PreToolUse gate (matcher: Bash), Claude and Codex — in a repository whose mise.toml defines a `commit` task
// (the gated commit, wiring-mise-tasks scripts/jj-commit.ts), deny a bare `jj commit`, `jj squash` or `jj split`.
//
// jj does not run Git hooks, so a bare `jj commit` skips hook:pre-commit entirely. On 2026-11-16..17 a firedancer
// session committed with bare `jj commit` for days: lint:module-versions never ran (loop_block/14 was rewritten in
// place, 6238e549 → 41cd3e18) and a failed generation:update was committed unnoticed. A repo `.claude/settings.json`
// deny rule cannot carry this rule: Claude applies the project's rules to every directory of the session, so it also
// blocked `jj commit` in retrospectives, whose README prescribes it. This hook binds only where the gate exists.
//
// Which repo: each command is judged where it runs — parseShell gives every command its own cwd (the session cwd moved
// by the `cd`s before it) and treats heredoc bodies and quoted words as data, so `cd ~/rrv2 && jj commit` in a session
// started in firedancer is judged in rrv2, and a test file written through a heredoc that mentions `jj commit` is not
// a commit. When the command cannot be parsed, the text is split at shell operators and judged at bashCwd (fail closed).
// `jj`, `command jj` and `env jj` are matched. The gated commit spawns jj from bun, not through this tool.
// FAIL CLOSED (run.sh --fail-closed): a hook error denies.
import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseShell } from "../../tools/shared/src/shell-syntax.ts";
import { attempt, errorMessage } from "./attempt.ts";
import { bashCwd, decidePre, readStdinJson } from "./lib.ts";
import { strAt } from "./narrow.ts";

const SEGMENT_SPLIT = /&&|\|\||[;|\n]|\$\(|`|\(|\)/u;
const BARE_COMMIT =
  /^(?:(?:command|env)\s+)?jj\s+(?:(?:--?\S+(?:\s+\S+)?)\s+)*?(commit|squash|split)(?:\s|$)/u;
const VERBS = new Set(["commit", "squash", "split"]);

/** The commit verb of one command's words (`jj [global flags] <verb>`), behind `command` or `env`. */
export function verbOfWords(words: readonly string[]): string | undefined {
  let i = 0;
  while (i < words.length && (words[i] === "command" || words[i] === "env"))
    i += 1;
  if (words[i] !== "jj") return undefined;
  for (let k = i + 1; k < words.length; k += 1) {
    const w = words[k] ?? "";
    if (w.startsWith("-")) continue;
    return VERBS.has(w) ? w : undefined;
  }
  return undefined;
}

/** Text fallback: the commit verb of the first segment that starts with jj. */
export function bareCommitVerb(command: string): string | undefined {
  for (const segment of command.split(SEGMENT_SPLIT)) {
    const match = BARE_COMMIT.exec(segment.trim());
    if (match !== null) return match[1];
  }
  return undefined;
}

/** Every (verb, cwd) pair of the command that commits: parsed commands, or the text fallback at bashCwd. */
export function commitSites(
  command: string,
  cwd: string,
  endCwd: string,
): { verb: string; cwd: string }[] {
  const parsed = parseShell(command, cwd);
  if (parsed === undefined) {
    const verb = bareCommitVerb(command);
    return verb === undefined ? [] : [{ verb, cwd: endCwd }];
  }
  return parsed.commands.flatMap((c) => {
    if (c.header) return [];
    const verb = verbOfWords(c.words);
    return verb === undefined ? [] : [{ verb, cwd: c.cwd }];
  });
}

async function isFile(path: string): Promise<boolean> {
  const result = await attempt(() => stat(path));
  return result.ok && result.value.isFile();
}

async function gatedRoot(start: string): Promise<string | null> {
  let current = resolve(start);
  while (true) {
    const mise = join(current, "mise.toml");
    if (await isFile(mise)) {
      const text = await readFile(mise, "utf8");
      return /^\[tasks\.commit\]\s*$/mu.test(text) ? current : null;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

type Outcome =
  | { kind: "deny"; message: string }
  | { kind: "error"; message: string }
  | null;

async function main(): Promise<Outcome> {
  const payload = readStdinJson();
  if (payload === undefined)
    return { kind: "error", message: "invalid JSON payload" };
  if (strAt(payload, "tool_name") !== "Bash") return null;
  const command = strAt(payload, "tool_input", "command");
  if (command === undefined || command === "") return null;
  const cwd = strAt(payload, "cwd");
  const sessionCwd = cwd !== undefined && cwd !== "" ? cwd : process.cwd();
  for (const site of commitSites(command, sessionCwd, bashCwd(payload))) {
    const root = await gatedRoot(site.cwd);
    if (root !== null)
      return {
        kind: "deny",
        message: `${root} has a gated commit task; bare \`jj ${site.verb}\` skips hook:pre-commit`,
      };
  }
  return null;
}

if (import.meta.main) {
  const r = await attempt(main);
  if (r.ok && r.value !== null && r.value.kind === "deny") {
    // SINGLE-AXIS: one question (does this command commit around the repo's gate?)
    decidePre(
      "deny",
      `gated-commit: ${r.value.message}. Commit through the gate: mise run commit -- -m '<message>' [--push] -- <path>...`,
    );
  } else if (r.ok && r.value !== null && r.value.kind === "error") {
    // FATAL: the command could not be judged; fail closed with the cause
    decidePre(
      "deny",
      `gated-commit: could not evaluate (${r.value.message}) — failing closed.`,
    );
  } else if (!r.ok) {
    // FATAL: the command could not be judged; fail closed with the cause
    decidePre(
      "deny",
      `gated-commit: could not evaluate (${errorMessage(r.error)}) — failing closed.`,
    );
  }
  process.exit(0);
}
