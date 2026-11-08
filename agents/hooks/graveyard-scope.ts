// Policy: which rip graveyard an agent's Bash may name. Pure — command text, cwd and env in;
// reasons out. The transport adapter is enforce-graveyard-scope.ts.
//
// Why a hook and not a PATH shim or a zsh function (owner decision 2026-11-08): shadowing `rip`
// was rejected. The standard command name stays untouched; disk-reclaim reclaims every graveyard
// that exists, and this rule stops an agent from CREATING a new one by naming it. The incident:
// a coordinator script ran `rip --graveyard <repo>/.graveyard-gc` on every land, and 36G piled up
// where no reclaim could see it.
//
// The declared graveyard is `${XDG_DATA_HOME:-$HOME/.local/share}/graveyard` (zsh/zshenv). Denied:
//   - `rip --graveyard X` / `rip --graveyard=X` where X is not the declared graveyard;
//   - `GRAVEYARD=X` / `RIP_GRAVEYARD=X` before rip, including `env NAME=X rip …`, when X is not
//     the declared graveyard, and the same assignment as a statement or as an `export` argument
//     (it would reach rip through the shell's environment);
//   - a command shell syntax cannot read, when it mentions both `rip` and `graveyard`.
// Passed: plain rip (the zsh env default is the declared graveyard), `--graveyard "$RIP_GRAVEYARD"`
// (and the `$GRAVEYARD` / `${…}` spellings), any value that resolves to the declared path, and rip
// flags that name no graveyard. A quoted `~` is a literal directory name; an unquoted `~` is home.
// Relative values resolve against the cwd the command runs in (after its `cd`s).
//
// Parsing is structural (parseShell): a quoted string or heredoc that merely mentions rip is data.

import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  effective,
  parseShell,
  type Effective,
  type ShellCommand,
} from "./shell-syntax.ts";

const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/u;
const GRAVEYARD_NAMES = new Set(["GRAVEYARD", "RIP_GRAVEYARD"]);
// Spellings that stand for the declared graveyard by name; the zsh env sets both to it.
const DECLARED_REFS = new Set([
  "$GRAVEYARD",
  "${GRAVEYARD}",
  "$RIP_GRAVEYARD",
  "${RIP_GRAVEYARD}",
]);
const DECLARING_BUILTINS = new Set([
  "export",
  "declare",
  "typeset",
  "readonly",
  "local",
]);

function homeDir(env: Record<string, string | undefined>): string {
  const home = env["HOME"];
  return home !== undefined && home !== "" ? home : homedir();
}

/** The graveyard zsh/zshenv declares; an empty XDG_DATA_HOME is unset, as in `:-`. */
export function declaredGraveyard(
  env: Record<string, string | undefined> = process.env,
): string {
  const xdg = env["XDG_DATA_HOME"];
  const base =
    xdg !== undefined && xdg !== ""
      ? xdg
      : join(homeDir(env), ".local", "share");
  return resolve(base, "graveyard");
}

/**
 * Whether a graveyard value written in a command lands on the declared graveyard. `tilde` is true
 * where the shell expands `~` (an unquoted word, a shell assignment) and false where it does not.
 */
function landsOnDeclared(
  text: string,
  tilde: boolean,
  cwd: string,
  declared: string,
  env: Record<string, string | undefined>,
): boolean {
  if (DECLARED_REFS.has(text)) return true;
  // A value the hook cannot know statically (`$X`, `$(…)`, backticks) is not proven declared.
  if (/[$`]/u.test(text)) return false;
  const path =
    tilde && (text === "~" || text.startsWith("~/"))
      ? join(homeDir(env), text.slice(1))
      : text;
  return resolve(cwd, path) === declared;
}

/** Index of the first word of a command's effective program, or the word count when none. */
function programStart(c: ShellCommand, eff: Effective | undefined): number {
  return eff === undefined
    ? c.words.length
    : c.words.length - eff.args.length - 1;
}

function assignmentViolations(
  assignments: readonly string[],
  c: ShellCommand,
  declared: string,
  env: Record<string, string | undefined>,
): string[] {
  return assignments.flatMap((word) => {
    const m = ASSIGNMENT.exec(word);
    if (m === null || !GRAVEYARD_NAMES.has(m[1] ?? "")) return [];
    const value = m[2] ?? "";
    return landsOnDeclared(value, true, c.cwd, declared, env)
      ? []
      : [`${m[1]}=${value} names a graveyard other than the declared one`];
  });
}

function ripViolations(
  c: ShellCommand,
  eff: Effective,
  declared: string,
  env: Record<string, string | undefined>,
): string[] {
  const base = c.words.length - eff.args.length;
  const reasons: string[] = [];
  const check = (text: string, tilde: boolean): void => {
    if (landsOnDeclared(text, tilde, c.cwd, declared, env)) return;
    reasons.push(
      `rip --graveyard ${text} names a graveyard other than the declared one`,
    );
  };
  const end = eff.args.indexOf("--");
  const options = end === -1 ? eff.args : eff.args.slice(0, end);
  for (let k = 0; k < options.length; k++) {
    const arg = options[k] ?? "";
    const value = options[k + 1];
    if (arg === "--graveyard" && value !== undefined) {
      check(value, (c.rawWords[base + k + 1] ?? "").startsWith("~"));
      k++;
    } else if (arg.startsWith("--graveyard=")) {
      // bash does not tilde-expand `--opt=~/x`: the value is literal.
      check(arg.slice("--graveyard=".length), false);
    }
  }
  return reasons;
}

function commandViolations(
  c: ShellCommand,
  declared: string,
  env: Record<string, string | undefined>,
): string[] {
  const eff = effective(c);
  const start = programStart(c, eff);
  // NAME=value words before the program (`env NAME=x rip`, `NAME=x rip`) and statement assignments.
  const prefixAssignments = c.words.slice(0, start);
  const reasons = assignmentViolations(
    [...c.assignments, ...prefixAssignments],
    c,
    declared,
    env,
  );
  if (eff === undefined) return reasons;
  if (DECLARING_BUILTINS.has(eff.name)) {
    reasons.push(
      ...assignmentViolations(
        eff.args.filter((a) => ASSIGNMENT.test(a)),
        c,
        declared,
        env,
      ),
    );
  }
  if (eff.name === "rip") reasons.push(...ripViolations(c, eff, declared, env));
  return reasons;
}

/**
 * Every way this command names a rip graveyard other than the declared one; [] when it does not.
 * Each reason is a complete sentence, so one decision can list them all.
 */
export function graveyardViolations(
  command: string,
  cwd: string,
  env: Record<string, string | undefined> = process.env,
): string[] {
  const declared = declaredGraveyard(env);
  const parsed = parseShell(command, cwd);
  if (parsed === undefined) {
    // Not sure of it: a command that could hide a rip graveyard is denied, not guessed at.
    return /\brip\b/u.test(command) && /graveyard/iu.test(command)
      ? [
          "the command is not readable shell syntax, so a rip graveyard in it cannot be checked",
        ]
      : [];
  }
  return parsed.commands.flatMap((c) => commandViolations(c, declared, env));
}
