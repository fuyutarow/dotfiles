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
import { arr, at, str, strAt } from "./narrow.ts";
import { jsonOf, z } from "./zod.ts";

type Rule = { text: string; prefix: string; exact: boolean };

const SEGMENT_SPLIT = /&&|\|\||[;|\n]|\$\(|`|\(|\)/u;

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

// One deny entry as a rule; undefined for anything that is not a plain `Bash(...)` rule form.
function ruleOf(entry: unknown): Rule | undefined {
  const text = str(entry);
  const body =
    text === undefined ? undefined : /^Bash\((.+)\)$/u.exec(text)?.[1];
  if (text === undefined || body === undefined) return undefined;
  if (body.endsWith(":*"))
    return { text, prefix: body.slice(0, -2), exact: false };
  if (!body.includes("*")) return { text, prefix: body, exact: true };
  return undefined;
}

function bashRules(root: string): Rule[] | string {
  const path = join(root, ".claude", "settings.json");
  const parsed = jsonOf(z.unknown()).safeParse(readFileSync(path, "utf8"));
  if (!parsed.success)
    return `${path}: ${parsed.error.issues[0]?.message ?? "not valid JSON"}`;
  const deny = at(parsed.data, "permissions", "deny");
  if (deny === undefined) return [];
  const list = arr(deny);
  if (list === undefined) return `${path}: permissions.deny is not a list`;
  return list.flatMap((entry) => {
    const rule = ruleOf(entry);
    return rule === undefined ? [] : [rule];
  });
}

function hits(seg: string, rule: Rule): boolean {
  return (
    seg === rule.prefix || (!rule.exact && seg.startsWith(`${rule.prefix} `))
  );
}

export function matchingRules(command: string, rules: Rule[]): Rule[] {
  const hit = new Set<Rule>();
  for (const raw of command.split(SEGMENT_SPLIT)) {
    const seg = raw.trim().replaceAll(/\s+/gu, " ");
    if (seg === "") continue;
    for (const r of rules.filter((rule) => hits(seg, rule))) hit.add(r);
  }
  return [...hit];
}

function jjAdvice(root: string, rules: Rule[]): string {
  if (
    !existsSync(join(root, ".jj")) ||
    !rules.some((r) => /\bgit\b/u.test(r.prefix))
  )
    return "";
  return (
    ". This is a colocated jj repo: read with `jj st`, `jj diff`, `jj log`; record with " +
    '`mise run commit -- -m "<msg>" [--push] -- <path>...`; sync with `mise run pull` ' +
    "(driving-jujutsu skill). mise tasks may use git internally; agents do not."
  );
}

type MainOutcome =
  | { readonly kind: "deny"; readonly message: string }
  | { readonly kind: "error"; readonly message: string }
  | null;

function main(): MainOutcome {
  const payload = readStdinJson();
  if (payload === undefined)
    return { kind: "error", message: "invalid JSON payload" };
  if (strAt(payload, "tool_name") !== "Bash") return null;
  const command = strAt(payload, "tool_input", "command");
  if (command === undefined || command === "") return null;

  const cwd = strAt(payload, "cwd");
  const sessionCwd = cwd !== undefined && cwd !== "" ? cwd : process.cwd();
  const roots = new Set<string>();
  for (const root of [
    settingsRoot(sessionCwd),
    settingsRoot(bashCwd(payload)),
  ]) {
    if (root !== null) roots.add(root);
  }
  const found: string[] = [];
  for (const root of roots) {
    const loaded = bashRules(root);
    if (typeof loaded === "string") return { kind: "error", message: loaded };
    const rules = matchingRules(command, loaded);
    if (rules.length === 0) continue;
    found.push(
      `${root}/.claude/settings.json denies ${rules.map((r) => r.text).join(", ")} for agents` +
        jjAdvice(root, rules),
    );
  }
  if (found.length === 0) return null;
  // BATCHED(rules, repos): every rule this command hits, in every repo it touches, in one denial —
  // the caller rewrites the command once instead of discovering the next rule on the retry.
  return {
    kind: "deny",
    message:
      `repo-deny: ${found.join(" | ")} ` +
      `(Claude enforces these rules natively; this hook applies them to Codex).`,
  };
}

const r = await attempt(main);
if (r.ok && r.value !== null && r.value.kind === "deny") {
  // SINGLE-AXIS: one question (does a repo deny rule match?); every match is already joined above
  decidePre("deny", r.value.message);
} else if (r.ok && r.value !== null && r.value.kind === "error") {
  // FATAL: the rules could not be read, so nothing could be evaluated; fail closed with the cause
  decidePre(
    "deny",
    `repo-deny: could not evaluate the repo's Bash deny rules (${r.value.message}) — ` +
      `failing closed. Fix that .claude/settings.json, or agents/hooks/enforce-repo-bash-deny.ts.`,
  );
} else if (!r.ok) {
  // FATAL: the rules could not be read, so no command can be judged; fail closed with the error.
  decidePre(
    "deny",
    `repo-deny: could not evaluate the repo's Bash deny rules (${errorMessage(r.error)}) — ` +
      `failing closed. Fix that .claude/settings.json, or agents/hooks/enforce-repo-bash-deny.ts.`,
  );
}
process.exit(0);
