// PreToolUse gate (matcher: Grep|Bash) — ban UNCLASSIFIED direct search in an operational
// ccc-registered project. The ban is on raw search surfaces (including direct ccc search/grep)
// and obvious general-purpose-runtime reimplementations, not on rg or ccc as engines: the router
// invokes them only after the caller declares the query shape.
//
// FAIL CLOSED on hook errors. Outside a registered project, or when ccc is unavailable, stay
// silent: lexical search remains the only available local backend. The router lives beside this
// hook, so the hook and its required entrypoint deploy as one linked directory.

import { existsSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { attempt, errorMessage } from "../../hooks/attempt.ts";
import { decidePre, findExe, readStdinJson } from "./lib.ts";

const GREP_SEARCH =
  /(^|[|;&(]|&&|\|\||\bthen\b|\bdo\b)\s*(?:(?:sudo|command|time|nice)\s+|(?:\S*\/)?env(?:\s+[A-Za-z_]\w*=\S+)*\s+|timeout(?:\s+--\S+)*\s+\S+\s+)*(?:\S*\/)?(grep|egrep|fgrep|rg|ripgrep|ag|ack|ugrep)\b/;
const GIT_GREP =
  /(^|[|;&(]|&&|\|\||\bthen\b|\bdo\b)\s*git(?:\s+-C\s+(?:"[^"]+"|'[^']+'|\S+))?\s+grep\b/;
const CCC_SEARCH =
  /(^|[|;&(]|&&|\|\||\bthen\b|\bdo\b)\s*(?:(?:sudo|command|time|nice)\s+|(?:\S*\/)?env(?:\s+[A-Za-z_]\w*=\S+)*\s+|timeout(?:\s+--\S+)*\s+\S+\s+)*(?:\S*\/)?ccc\s+(search|grep)\b/;
const FILE_ENUMERATION =
  /(^|[|;&(]|&&|\|\||\bthen\b|\bdo\b)\s*(sudo\s+|command\s+|time\s+)*(?:\S*\/)?(fd|fdfind|tree)\b|(^|[|;&(]|&&|\|\|)\s*(sudo\s+)*(?:\S*\/)?find\b/;
const XARGS_SEARCH =
  /(^|[|;&(]|&&|\|\|)\s*xargs\b[^|;&]*(?:\S*\/)?(grep|egrep|fgrep|rg|ripgrep|ag|ack|ugrep)\b/;
const NESTED_SHELL_SEARCH =
  /\b(?:ba|z|da)?sh\s+-c\s+(?:"[^"\n]*\b(?:grep|rg|ccc\s+(?:search|grep))\b|'[^'\n]*\b(?:grep|rg|ccc\s+(?:search|grep))\b)/;
const INLINE_RUNTIME =
  /(^|[|;&(]|&&|\|\||\bthen\b|\bdo\b)\s*(?:uv\s+run(?:\s+--[^\s]+(?:=\S+)?)*\s+)?(?:\S*\/)?(python(?:3(?:\.\d+)?)?|node|bun|ruby|perl)\b[^|;&]*(?:\s-(?:c|e)\b|\s-\s*(?:$|<<)|<<)/;
const FILE_SCAN_PRIMITIVE =
  /\b(?:os\.(?:walk|scandir|listdir)|Path\s*\([^)]*\)\.(?:r?glob)|glob\.(?:i?glob)|(?:readdir|readdirSync|opendir|opendirSync)\s*\(|Bun\.Glob|(?:fast-)?glob(?:Sync)?\s*\()/;
const SIMPLE_CD = /(?:^|&&|;)\s*cd\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/g;
// A single grep/rg over an already classified router stream is display filtering, not a
// second repository search. The accepted shape, every part optional except the router and the
// filter:
//   [cd <dir> &&] <router> <route> <args> [2>&1 | 2>/dev/null] | grep|rg [-F -i -v -w -n …] (-e PAT | -- PAT) [| head|tail [-n N | -N]]
// One pattern and NO file operand (the filter reads the router's stream, never the tree); no
// substitution, no other redirection, no further stage. A trailing head/tail only shortens what is
// shown. Widened 2026-10-01 (firedancer report): the deny message recommended this form while the
// gate rejected `2>&1`, `-e`, and `| head` — three denials in one day for following the advice.
const ROUTER_INVOCATION = String.raw`(?:rr|repo-retrieve|bun\s+(?:~\/\.claude\/hooks\/repo-retrieve\.ts|\/[^\s|;&]+\/repo-retrieve\.ts))`;
const FILTER_PATTERN = String.raw`(?:'[^'\n]*'|"[^"\`$\n]*"|[^\s|;&<>\`$'"-][^\s|;&<>\`$'"]*)`;
const ROUTED_STREAM_FILTER = new RegExp(
  String.raw`^\s*(?:cd\s+(?:'[^'\n]*'|"[^"\`$\n]*"|[^\s;&|\`$]+)\s*&&\s*)?` +
    ROUTER_INVOCATION +
    String.raw`\s+(?:about|absent|text|regex|files|shape|exists|concept|battery|literal|exhaustive|structural|definition)\b[^|;&\n\`$<>]*` +
    String.raw`(?:\s2>(?:&1|\/dev\/null))?\s*` +
    String.raw`\|\s*(?:grep|rg)(?:\s+-[Fivwnc]+)*\s+(?:--|-e)\s+` +
    FILTER_PATTERN +
    String.raw`(?:\s*\|\s*(?:head|tail)(?:\s+-n\s*\d+|\s+-\d+)?)?\s*$`,
);
const ROUTER = join(import.meta.dir, "repo-retrieve.ts");
// What to tell the caller to type: the short PATH command when it resolves to THIS router (the
// package bin from `bun link`), else the long path that always exists beside this hook. Every deny
// used to print the long form, so agents copied `bun ~/.claude/hooks/repo-retrieve.ts …` forever
// although `repo-retrieve` was installed (2026-10-01, owner: 「ずっとこれに耐えるしかないの？？」).
const ROUTER_COMMAND = ((): string => {
  const isThisRouter = (name: string) => {
    const onPath = Bun.which(name);
    return (
      onPath !== null &&
      existsSync(ROUTER) &&
      realpathSync(onPath) === realpathSync(ROUTER)
    );
  };
  if (isThisRouter("rr")) return "rr";
  if (isThisRouter("repo-retrieve")) return "repo-retrieve";
  return "bun ~/.claude/hooks/repo-retrieve.ts";
})();

function isRawSearch(command: unknown): boolean {
  if (typeof command !== "string" || command === "") return false;
  if (ROUTED_STREAM_FILTER.test(command)) return false;
  return (
    GREP_SEARCH.test(command) ||
    GIT_GREP.test(command) ||
    CCC_SEARCH.test(command) ||
    FILE_ENUMERATION.test(command) ||
    XARGS_SEARCH.test(command) ||
    NESTED_SHELL_SEARCH.test(command) ||
    (INLINE_RUNTIME.test(command) && FILE_SCAN_PRIMITIVE.test(command))
  );
}

function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

function bashCwd(payload: any): string {
  const initial =
    typeof payload?.cwd === "string" && payload.cwd !== ""
      ? payload.cwd
      : process.cwd();
  const command =
    typeof payload?.tool_input?.command === "string"
      ? payload.tool_input.command
      : "";

  let current = resolve(initial);
  for (const match of command.matchAll(SIMPLE_CD)) {
    const raw = expandHome(match[1] ?? match[2] ?? match[3] ?? "");
    if (raw === "") continue;
    current = isAbsolute(raw) ? resolve(raw) : resolve(current, raw);
  }
  return current;
}

function startPath(payload: any): string {
  if (payload?.tool_name === "Bash") return bashCwd(payload);

  const cwd =
    typeof payload?.cwd === "string" && payload.cwd !== ""
      ? payload.cwd
      : process.cwd();
  const raw = payload?.tool_input?.path;
  if (typeof raw !== "string" || raw === "") return cwd;
  return isAbsolute(raw) ? raw : resolve(cwd, raw);
}

/**
 * **Governed repos are exempt: judgment lives in one place, and here it is not that place.**
 *
 * WHY (2026-09-01, the commissioner's ruling, after arms were measurably stuck):
 *   This hook denies Grep/Bash and directs the arm to `repo-retrieve.ts` — a large body of
 *   judgment living in a repo that declares no governance, invisible to the governed repo's
 *   own gate, registered under no protocol verb. **A repo cannot govern what it cannot see.**
 *   The arm was caught between the two: the governance layer could not lift this denial, and
 *   the denial's own route was returning NO_INDEX in a loop.
 *
 *   Where a repo declares governance (`rnd.config.json`), that repo's gate owns which searches
 *   are allowed. This one steps aside — **not because raw search became safe there, but because
 *   two judgments over the same act cannot both be authoritative.** Outside governed repos
 *   nothing changes: the ban stands exactly as before.
 */
function governedRepo(start: string): string | null {
  return findAncestorContaining(start, "rnd.config.json");
}

function registeredProject(start: string): string | null {
  return findAncestorContaining(start, ".cocoindex_code", "settings.yml");
}

// Shared ancestor walk for `governedRepo` and `registeredProject`: both look for a marker
// file, differing only in which one. `start` may be a file or directory, and may not exist —
// throwIfNoEntry:false then reports no stat, and the walk falls back to treating `start`
// itself as the starting point.
function findAncestorContaining(
  start: string,
  ...marker: string[]
): string | null {
  const st = statSync(start, { throwIfNoEntry: false });
  let current = start;
  if (st !== undefined && !st.isDirectory()) current = dirname(start);
  current = resolve(current);
  while (true) {
    if (existsSync(join(current, ...marker))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function cccIsAvailable(): boolean {
  return (
    findExe("ccc", [
      join(homedir(), ".local", "bin"),
      "/opt/homebrew/bin",
      "/usr/local/bin",
    ]) !== null
  );
}

function main(): void {
  const payload = readStdinJson();
  const tool = payload?.tool_name;
  if (tool !== "Grep" && tool !== "Bash") return;

  if (tool === "Bash" && !isRawSearch(payload?.tool_input?.command)) {
    return;
  }

  // **A governed repo owns its own search policy.** See `governedRepo` above — one act, one
  // authoritative judgment. This is checked before the ccc registration so a repo that is both
  // governed and ccc-registered falls to its own gate.
  if (governedRepo(startPath(payload))) return;

  const project = registeredProject(startPath(payload));
  if (!project || !cccIsAvailable()) return;

  if (!existsSync(ROUTER)) {
    // FATAL: without the router there is no route to advise, so the normal deny cannot be built.
    decidePre(
      "deny",
      `search-route: configuration fault — required router is missing at ${ROUTER}. ` +
        `Do not bypass this gate with Python, Node, shell loops, or another search ` +
        `implementation. Restore/deploy ~/.claude/hooks/repo-retrieve.ts, then retry.`,
    );
  }

  // SINGLE-AXIS: isRawSearch() is one boolean over alternative surfaces, not independent checks —
  // whichever surface matched, the caller owes the same single fix (declare a query shape).
  decidePre(
    "deny",
    `search-route: raw ${tool} search is disabled in operational ccc project ${project}. ` +
      `Declare the query shape through ${ROUTER_COMMAND}: ` +
      `${ROUTER_COMMAND} text '<exact text>'; ` +
      `${ROUTER_COMMAND} regex '<regex>'; ` +
      `${ROUTER_COMMAND} files '<glob>'; ` +
      `${ROUTER_COMMAND} about '<meaning, JA or EN>'; ` +
      `${ROUTER_COMMAND} absent -q '<p1>' -q '<p2>' -q '<p3>' (before claiming something does not exist); ` +
      `${ROUTER_COMMAND} exists '<what it does>' (before writing a new function); ` +
      `${ROUTER_COMMAND} shape '<code pattern by example>'. ` +
      `To filter displayed router output, pipe it to ONE grep/rg with one pattern (-e PAT or -- PAT) ` +
      `and no file operand, optionally followed by one head/tail, e.g. ` +
      `${ROUTER_COMMAND} text '<text>' 2>&1 | grep -F -e '<filter>' | head; ` +
      `filtered output is never an absence check. ` +
      `Known-symbol definitions/references go to Serena. The router may choose rg; ` +
      `the forbidden act is unclassified search, not lexical search. This is a policy ` +
      `boundary: do not bypass it with Python, Node, shell loops, or another tool.`,
  );
}

const r = await attempt(main);
if (!r.ok) {
  // FATAL: the hook itself failed, so no axis could be evaluated; fail closed with the one fix
  // (report the error) rather than guessing which checks would have fired.
  decidePre(
    "deny",
    `search-route: hook error while classifying search ` +
      `(${errorMessage(r.error)}) — failing closed. ` +
      `Fix ~/.claude/hooks/enforce-search-route.ts before retrying raw search.`,
  );
}
process.exit(0);
