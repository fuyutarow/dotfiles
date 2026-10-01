// PreToolUse gate (matcher: Bash), Codex only — enforce a repo's Claude Code Bash deny rules for
// Codex, so one declaration binds every agent CLI.
//
// A repo declares what agents may not run in ONE place, its `.claude/settings.json`:
//   "permissions": { "deny": ["Bash(git:*)", "Bash(command git:*)", "Bash(env git:*)"] }
// Claude Code enforces that natively. Codex never reads the file, so before 2026-10-01 a Codex
// session ran git in jj repos (dotfiles, firedancer) that ban it for agents. This hook reads the
// same rules and denies the same commands; Claude is not wired to it (hooks.toml vendors) —
// a second judgment over the same act would only print a second message.
//
// Matching, as Claude's: `Bash(<prefix>:*)` matches a command segment that is <prefix> or starts
// with "<prefix> "; `Bash(<exact>)` matches the segment exactly. Segments are split at shell
// operators (&& || ; | newline, subshell and substitution openers), so `cd x && git status` is
// caught. Other rule forms (paths, wildcards inside) are ignored here, not guessed at.
//
// Which repo: the nearest ancestor holding `.claude/settings.json`, from the session cwd AND
// from the cwd after the command's own `cd`s — a rule binds in the repo the session works in and
// in the repo the command steps into.
//
// FAIL CLOSED (run.sh --fail-closed): a hook error denies. An unreadable or malformed
// settings file is that repo's own fault and denies with its path.

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { attempt, errorMessage } from "./attempt.ts";
import { bashCwd, decidePre, readStdinJson } from "./lib.ts";

type Rule = { text: string; prefix: string; exact: boolean };

const SEGMENT_SPLIT = /&&|\|\||[;|\n]|\$\(|`|\(|\)/;

function settingsRoot(start: string): string | null {
  const st = statSync(start, { throwIfNoEntry: false });
  let current = resolve(
    st !== undefined && !st.isDirectory() ? dirname(start) : start,
  );
  while (true) {
    if (existsSync(join(current, ".claude", "settings.json"))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function bashRules(root: string): Rule[] {
  const path = join(root, ".claude", "settings.json");
  const deny = JSON.parse(readFileSync(path, "utf8"))?.permissions?.deny;
  if (deny === undefined) return [];
  if (!Array.isArray(deny))
    throw new Error(`${path}: permissions.deny is not a list`);
  const rules: Rule[] = [];
  for (const entry of deny) {
    const m = typeof entry === "string" ? /^Bash\((.+)\)$/.exec(entry) : null;
    const body = m?.[1];
    if (body === undefined) continue;
    if (body.endsWith(":*"))
      rules.push({ text: entry, prefix: body.slice(0, -2), exact: false });
    else if (!body.includes("*"))
      rules.push({ text: entry, prefix: body, exact: true });
  }
  return rules;
}

export function matchingRules(command: string, rules: Rule[]): Rule[] {
  const hit = new Set<Rule>();
  for (const raw of command.split(SEGMENT_SPLIT)) {
    const seg = raw.trim().replace(/\s+/g, " ");
    if (seg === "") continue;
    for (const r of rules)
      if (seg === r.prefix || (!r.exact && seg.startsWith(`${r.prefix} `)))
        hit.add(r);
  }
  return [...hit];
}

function jjAdvice(root: string, rules: Rule[]): string {
  if (
    !existsSync(join(root, ".jj")) ||
    !rules.some((r) => /\bgit\b/.test(r.prefix))
  )
    return "";
  return (
    ". This is a colocated jj repo: read with `jj st`, `jj diff`, `jj log`; record with " +
    '`mise run commit -- -m "<msg>" [--push] -- <path>...`; sync with `mise run pull` ' +
    "(driving-jujutsu skill). mise tasks may use git internally; agents do not."
  );
}

function main(): void {
  const payload = readStdinJson();
  if (payload?.tool_name !== "Bash") return;
  const command = payload?.tool_input?.command;
  if (typeof command !== "string" || command === "") return;

  const sessionCwd =
    typeof payload?.cwd === "string" && payload.cwd !== ""
      ? payload.cwd
      : process.cwd();
  const roots = new Set(
    [settingsRoot(sessionCwd), settingsRoot(bashCwd(payload))].filter(
      (r): r is string => r !== null,
    ),
  );
  const found: string[] = [];
  for (const root of roots) {
    const rules = matchingRules(command, bashRules(root));
    if (rules.length === 0) continue;
    found.push(
      `${root}/.claude/settings.json denies ${rules.map((r) => r.text).join(", ")} for agents` +
        jjAdvice(root, rules),
    );
  }
  if (found.length === 0) return;
  // BATCHED(rules, repos): every rule this command hits, in every repo it touches, in one denial —
  // the caller rewrites the command once instead of discovering the next rule on the retry.
  decidePre(
    "deny",
    `repo-deny: ${found.join(" | ")} ` +
      `(Claude enforces these rules natively; this hook applies them to Codex).`,
  );
}

const r = await attempt(main);
if (!r.ok) {
  // FATAL: the rules could not be read, so no command can be judged; fail closed with the error.
  decidePre(
    "deny",
    `repo-deny: could not evaluate the repo's Bash deny rules (${errorMessage(r.error)}) — ` +
      `failing closed. Fix that .claude/settings.json, or agents/hooks/enforce-repo-bash-deny.ts.`,
  );
}
process.exit(0);
