// PreToolUse gate (matcher: Grep|Bash) — ban UNCLASSIFIED direct search in an operational
// ccc-registered project. The ban is on raw search surfaces (including direct ccc search/grep)
// and obvious general-purpose-runtime reimplementations, not on rg or ccc as engines: the router
// invokes them only after the caller declares the query shape.
//
// FAIL CLOSED on hook errors. Outside a registered project, or when ccc is unavailable, stay
// silent: lexical search remains the only available local backend.
//
// VENDOR-NEUTRAL since 2026-10-01 (agents/hooks/hooks.toml → Claude Code AND Codex): it was
// registered for Claude only, so a Codex session searched raw in the same repos. Codex sends its
// shell calls as tool_name "Bash" + tool_input.command (lib.ts) and has no Grep tool, so the Bash
// branch is the whole gate there.

import { existsSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { attempt, errorMessage } from "./attempt.ts";
import { bashCwd, decidePre, findExe, readStdinJson } from "./lib.ts";
import { strAt } from "./narrow.ts";
import {
  coordinatorPath,
  insidePath,
  physicalPath,
  readPath,
  shellQuote,
} from "./read-path.ts";
import {
  type ParsedShell,
  type ShellCommand,
  effective,
  parseShell,
} from "./shell-syntax.ts";

const GREP_SEARCH =
  /(^|[|;&(]|&&|\|\||\bthen\b|\bdo\b)\s*(?:(?:sudo|command|time|nice)\s+|(?:\S*\/)?env(?:\s+[A-Za-z_]\w*=\S+)*\s+|timeout(?:\s+--\S+)*\s+\S+\s+)*(?:\S*\/)?(grep|egrep|fgrep|rg|ripgrep|ag|ack|ugrep)\b/u;
const GIT_GREP =
  /(^|[|;&(]|&&|\|\||\bthen\b|\bdo\b)\s*git(?:\s+-C\s+(?:"[^"]+"|'[^']+'|\S+))?\s+grep\b/u;
const CCC_SEARCH =
  /(^|[|;&(]|&&|\|\||\bthen\b|\bdo\b)\s*(?:(?:sudo|command|time|nice)\s+|(?:\S*\/)?env(?:\s+[A-Za-z_]\w*=\S+)*\s+|timeout(?:\s+--\S+)*\s+\S+\s+)*(?:\S*\/)?ccc\s+(search|grep)\b/u;
const FILE_ENUMERATION =
  /(^|[|;&(]|&&|\|\||\bthen\b|\bdo\b)\s*(sudo\s+|command\s+|time\s+)*(?:\S*\/)?(fd|fdfind|tree)\b|(^|[|;&(]|&&|\|\|)\s*(sudo\s+)*(?:\S*\/)?find\b/u;
const XARGS_SEARCH =
  /(^|[|;&(]|&&|\|\|)\s*xargs\b[^|;&]*(?:\S*\/)?(grep|egrep|fgrep|rg|ripgrep|ag|ack|ugrep)\b/u;
const NESTED_SHELL_SEARCH =
  /\b(?:ba|z|da)?sh\s+-c\s+(?:"[^"\n]*\b(?:grep|rg|ccc\s+(?:search|grep))\b|'[^'\n]*\b(?:grep|rg|ccc\s+(?:search|grep))\b)/u;
const INLINE_RUNTIME =
  /(^|[|;&(]|&&|\|\||\bthen\b|\bdo\b)\s*(?:uv\s+run(?:\s+--[^\s]+(?:=\S+)?)*\s+)?(?:\S*\/)?(python(?:3(?:\.\d+)?)?|node|bun|ruby|perl)\b[^|;&]*(?:\s-(?:c|e)\b|\s-\s*(?:$|<<)|<<)/u;
const FILE_SCAN_PRIMITIVE =
  /\b(?:os\.(?:walk|scandir|listdir)|Path\s*\([^)]*\)\.(?:r?glob)|glob\.(?:i?glob)|(?:readdir|readdirSync|opendir|opendirSync)\s*\(|Bun\.Glob|(?:fast-)?glob(?:Sync)?\s*\()/u;
// A single grep/rg over an already classified router stream is display filtering, not a
// second repository search. The accepted shape, every part optional except the router and the
// filter:
//   [cd <dir> &&] <router> <route> <args> [2>&1 | 2>/dev/null] | grep|rg [-F -i -v -w -n …] (-e PAT | -- PAT) [| head|tail [-n N | -N]]
// One pattern and NO file operand (the filter reads the router's stream, never the tree); no
// substitution, no other redirection, no further stage. A trailing head/tail only shortens what is
// shown. Widened 2026-10-01 (firedancer report): the deny message recommended this form while the
// gate rejected `2>&1`, `-e`, and `| head` — three denials in one day for following the advice.
const ROUTER_INVOCATION = String.raw`(?:rr|repo-retrieve|bun\s+(?:~\/\.claude\/hooks\/repo-retrieve\.ts|\/[^\s|;&]+\/repo-retrieve\.ts))`;
// A literal backtick for the String.raw patterns below: `\`` would reach the RegExp as an
// escaped backtick, which the u flag rejects (the hook then fails to load and denies everything).
const BT = "`";
const FILTER_PATTERN = String.raw`(?:'[^'\n]*'|"[^"${BT}$\n]*"|[^\s|;&<>${BT}$'"-][^\s|;&<>${BT}$'"]*)`;
const ROUTED_STREAM_FILTER = new RegExp(
  String.raw`^\s*(?:cd\s+(?:'[^'\n]*'|"[^"${BT}$\n]*"|[^\s;&|${BT}$]+)\s*&&\s*)?` +
    ROUTER_INVOCATION +
    String.raw`\s+(?:about|absent|text|regex|files|shape|exists|concept|battery|literal|exhaustive|structural|definition)\b[^|;&\n${BT}$<>]*` +
    String.raw`(?:\s2>(?:&1|\/dev\/null))?\s*` +
    String.raw`\|\s*(?:grep|rg)(?:\s+-[Fivwnc]+)*\s+(?:--|-e)\s+` +
    FILTER_PATTERN +
    String.raw`(?:\s*\|\s*(?:head|tail)(?:\s+-n\s*\d+|\s+-\d+)?)?\s*$`,
  "u",
);
// Resolved through the real path: the hook runs from ~/.agents/hooks (a symlink to this dir), and
// the router lives in tools/repo-retrieve/ of the repo, not beside the link.
const ROUTER = join(
  dirname(realpathSync(import.meta.path)),
  "..",
  "..",
  "tools",
  "repo-retrieve",
  "src",
  "repo-retrieve.ts",
);
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
  return `bun ${ROUTER}`;
})();

const SEARCH_PROGRAMS = new Set([
  "grep",
  "egrep",
  "fgrep",
  "rg",
  "ripgrep",
  "ag",
  "ack",
  "ugrep",
]);
const ENUMERATORS = new Set(["fd", "fdfind", "tree", "find"]);
const RUNTIMES = /^(?:python(?:3(?:\.\d+)?)?|node|bun|ruby|perl)$/u;
const ROUTES = new Set([
  "about",
  "absent",
  "text",
  "regex",
  "files",
  "shape",
  "exists",
  "concept",
  "battery",
  "literal",
  "exhaustive",
  "structural",
  "definition",
]);

// The documented display filter, by structure: [cd <dir> &&] <router> <route> … [2>&1|2>/dev/null]
// | grep|rg [-F -i -v -w -n -c] (-e PAT | -- PAT) [| head|tail [-n N | -N]] — one pattern, no file
// operand, nothing dynamic. The words are already unquoted, so `<`, `|` or `$` inside a quoted
// argument no longer matter (2026-10-06: `rr text '<x>' 2>&1 | grep -F -e '.ts:'` was denied).
function isRoutedStreamFilter(commands: ShellCommand[]): boolean {
  const rest = [...commands];
  if (rest.length > 0 && rest[0]?.words[0] === "cd") {
    const cd = rest.shift();
    if (cd === undefined || cd.words.length !== 2 || cd.dynamic) return false;
    if (rest[0]?.sep !== "&&") return false;
  }
  const router = rest[0];
  const filter = rest[1];
  if (router === undefined || filter === undefined || rest.length > 3)
    return false;
  const [head, route] =
    router.words[0] === "bun"
      ? [router.words[1] ?? "", router.words[2]]
      : [router.words[0] ?? "", router.words[1]];
  const routerOk =
    (/^(?:rr|repo-retrieve)$/u.test(head) ||
      (router.words[0] === "bun" &&
        /(?:^~\/\.claude\/hooks|^\/.*)\/repo-retrieve\.ts$/u.test(head))) &&
    route !== undefined &&
    ROUTES.has(route);
  if (!routerOk || router.dynamic || router.heredocs.length > 0) return false;
  if (
    !router.redirects.every(
      (r) =>
        (r.op === "2>&" && r.target === "1") ||
        (r.op === "2>" && r.target === "/dev/null"),
    )
  )
    return false;
  if (
    filter.sep !== "|" ||
    filter.dynamic ||
    filter.redirects.length > 0 ||
    filter.heredocs.length > 0
  )
    return false;
  const [prog = "", ...args] = filter.words;
  if (prog !== "grep" && prog !== "rg") return false;
  let k = 0;
  while (/^-[Fivwnc]+$/u.test(args[k] ?? "")) k++;
  if ((args[k] !== "-e" && args[k] !== "--") || args.length !== k + 2)
    return false;
  const tail = rest[2];
  if (tail === undefined) return true;
  const [tprog = "", ...targs] = tail.words;
  return (
    tail.sep === "|" &&
    !tail.dynamic &&
    tail.redirects.length === 0 &&
    (tprog === "head" || tprog === "tail") &&
    (targs.length === 0 ||
      (targs.length === 1 && /^-\d+$/u.test(targs[0] ?? "")) ||
      (targs.length === 2 &&
        targs[0] === "-n" &&
        /^\d+$/u.test(targs[1] ?? "")))
  );
}

function rawSearchBySyntax(parsed: ParsedShell, command: string): boolean {
  if (isRoutedStreamFilter(parsed.commands.filter((c) => !c.nested)))
    return false;
  return parsed.commands.some(
    (c) =>
      commandSearches(c, command) &&
      ((c.dynamic &&
        parsed.commands.some((step) => step.assignments.length > 0)) ||
        !fileScopedSearch(c)),
  );
}

function commandSearches(c: ShellCommand, command: string): boolean {
  const eff = effective(c);
  if (eff === undefined) return false;
  const { name, args } = eff;
  if (SEARCH_PROGRAMS.has(name) || ENUMERATORS.has(name)) return true;
  if (name === "ccc" && (args[0] === "search" || args[0] === "grep"))
    return true;
  const gitArgs = args[0] === "-C" ? args.slice(2) : args;
  if (name === "git" && gitArgs[0] === "grep") return true;
  if (
    name === "xargs" &&
    args.some((a) => SEARCH_PROGRAMS.has(a.replace(/^.*\//u, "")))
  )
    return true;
  const inline =
    RUNTIMES.test(name) &&
    (args.some((a) => /^-[ce]/u.test(a)) ||
      args.includes("-") ||
      c.heredocs.length > 0);
  if (!inline) return false;
  const text =
    args.includes("-") && c.heredocs.length === 0
      ? command
      : [...args, ...c.heredocs].join("\n");
  return FILE_SCAN_PRIMITIVE.test(text);
}

/** One nonrecursive grep/rg over explicit regular files is a file lookup, not a repo search. */
function fileScopedSearch(c: ShellCommand): boolean {
  const eff = effective(c);
  if (eff === undefined || (eff.name !== "grep" && eff.name !== "rg"))
    return false;
  if (eff.args.some(isRecursiveOption)) return false;
  const operands = searchOperands(c);
  return (
    operands.length > 0 &&
    operands.every((operand) => {
      const target = readPath(operand, c);
      return (
        target.resolved &&
        statSync(target.path, { throwIfNoEntry: false })?.isFile() === true
      );
    })
  );
}

function isRawSearch(command: string | undefined, cwd: string): boolean {
  if (command === undefined || command === "") return false;
  const parsed = parseShell(command, cwd);
  if (parsed !== undefined) return rawSearchBySyntax(parsed, command);
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

function startPath(payload: unknown): string {
  if (strAt(payload, "tool_name") === "Bash") return bashCwd(payload);

  const payloadCwd = strAt(payload, "cwd");
  const cwd =
    payloadCwd !== undefined && payloadCwd !== "" ? payloadCwd : process.cwd();
  const raw = strAt(payload, "tool_input", "path");
  if (raw === undefined || raw === "") return cwd;
  return isAbsolute(raw) ? raw : resolve(cwd, raw);
}

const GREP_VALUE_OPTIONS = new Set([
  "-e",
  "--regexp",
  "-f",
  "--file",
  "-m",
  "-A",
  "-B",
  "-C",
  "-g",
  "-t",
  "-T",
  "-M",
  "-j",
  "-d",
  "-D",
  "--max-count",
  "--glob",
  "--type",
  "--type-not",
  "--max-columns",
  "--threads",
  "--after-context",
  "--before-context",
  "--context",
  "--devices",
  "--directories",
  "--include",
  "--exclude",
  "--exclude-from",
  "--exclude-dir",
  "--color",
  "--colour",
  "--binary-files",
  "--label",
]);

function optionValue(args: string[], index: number): number {
  const arg = args[index] ?? "";
  if (GREP_VALUE_OPTIONS.has(arg)) return 1;
  if (/^--[^=]+=./u.test(arg)) return 0;
  if (/^-(?:e|f).+/u.test(arg)) return 0;
  return 0;
}

function isRecursiveOption(arg: string): boolean {
  return (
    arg === "--recursive" ||
    arg === "--dereference-recursive" ||
    arg === "-r" ||
    arg === "-R" ||
    (/[rR]/u.test(arg) && /^-[^-]/u.test(arg))
  );
}

/** File/directory operands searched by one parsed search command; empty means stdin. */
function searchOperands(c: ShellCommand): string[] {
  const eff = effective(c);
  if (eff === undefined) return [];
  const { name } = eff;
  let args = eff.args;
  if (name === "git") {
    if (args[0] === "-C") args = args.slice(2);
    return [c.cwd]; // git grep searches the worktree when no pathspec is given
  }
  if (name === "ccc" || name === "xargs" || RUNTIMES.test(name)) return [c.cwd];
  if (ENUMERATORS.has(name)) {
    if (name === "find") {
      const firstPredicate = args.findIndex((arg) =>
        /^(?:!|\(|-name|-iname|-path|-ipath|-type|-size|-mtime|-newer|-print|-exec|-delete|-maxdepth|-mindepth)$/u.test(
          arg,
        ),
      );
      const paths =
        firstPredicate === -1 ? args : args.slice(0, firstPredicate);
      const targets = paths.filter((arg) => arg !== "" && !arg.startsWith("-"));
      return targets.length > 0 ? targets : [c.cwd];
    }
    if (name === "fd" || name === "fdfind") {
      const positionals = args.filter((arg) => !arg.startsWith("-"));
      return positionals.length > 1 ? positionals.slice(1) : [c.cwd];
    }
    const paths = args.filter((arg) => !arg.startsWith("-"));
    return paths.length > 0 ? paths : [c.cwd];
  }
  if (!SEARCH_PROGRAMS.has(name)) return [c.cwd];

  let patternSeen = false;
  let endOptions = false;
  const paths: string[] = [];
  let recursive = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (!endOptions && arg === "--") {
      endOptions = true;
      continue;
    }
    if (!endOptions && arg.startsWith("-") && arg !== "-") {
      recursive = recursive || isRecursiveOption(arg);
      patternSeen =
        patternSeen ||
        arg === "-e" ||
        arg === "--regexp" ||
        arg === "-f" ||
        arg === "--file" ||
        /^-(?:e|f).+/u.test(arg) ||
        /^--(?:regexp|file)=/u.test(arg);
      const skip = optionValue(args, i);
      i += skip;
      continue;
    }
    if (arg === "-") continue;
    if (!patternSeen) patternSeen = true;
    else paths.push(arg);
  }
  const redirectedInput = c.redirects
    .filter((redirect) => redirect.op.startsWith("<") && redirect.target !== "")
    .map((redirect) => redirect.target);
  if (paths.length > 0 || redirectedInput.length > 0)
    return [...paths, ...redirectedInput];
  return recursive || (name !== "grep" && name !== "egrep" && name !== "fgrep")
    ? [c.cwd]
    : [];
}

function searchTargets(payload: unknown): string[] {
  if (strAt(payload, "tool_name") === "Grep") return [startPath(payload)];
  const command = strAt(payload, "tool_input", "command") ?? "";
  let cwd = strAt(payload, "cwd") ?? process.cwd();
  if (cwd === "") cwd = process.cwd();
  const parsed = parseShell(command, cwd);
  if (parsed === undefined) return [startPath(payload)];
  if (isRoutedStreamFilter(parsed.commands.filter((c) => !c.nested))) return [];
  const targets = parsed.commands.flatMap((c) => {
    if (!commandSearches(c, command)) return [];
    // Shell-local assignments are not the hook environment. Do not reuse its values after one.
    if (
      c.dynamic &&
      parsed.commands.some((step) => step.assignments.length > 0)
    )
      return [physicalPath(c.cwd)];
    if (fileScopedSearch(c)) return [];
    const root = registeredProject(c.cwd);
    return searchOperands(c).flatMap((operand) => {
      const target = readPath(operand, c);
      if (!target.resolved && !coordinatorPath(target.path))
        return [physicalPath(c.cwd)];
      if (root !== null && !insidePath(target.path, physicalPath(root)))
        return [];
      return [target.path];
    });
  });
  // A malformed router/filter pipeline is still a repository search attempt. Only the one
  // explicitly accepted stream-filter shape above is exempt; preserve the gate for other forms.
  const hasRouter = parsed.commands.some((c) => {
    const eff = effective(c);
    return (
      eff !== undefined && (eff.name === "rr" || eff.name === "repo-retrieve")
    );
  });
  const unroutedFilter = parsed.commands.some(
    (c) => commandSearches(c, command) && searchOperands(c).length === 0,
  );
  return targets.length === 0 && hasRouter && unroutedFilter
    ? [resolve(cwd)]
    : targets;
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

/** Concrete repair for the observed query, rather than a menu of placeholder commands. */
function searchPattern(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === "-e" || arg === "--regexp" || arg === "--") return args[i + 1];
    if (arg.startsWith("--regexp=")) return arg.slice(9);
    if (/^-e.+/u.test(arg)) return arg.slice(2);
    if (arg.startsWith("-")) i += optionValue(args, i);
    else return arg;
  }
  return undefined;
}

function rewrittenSearch(payload: unknown, project?: string): string {
  const command = strAt(payload, "tool_input", "command") ?? "";
  const parsed = parseShell(command, strAt(payload, "cwd") ?? process.cwd());
  const c = parsed?.commands.find(
    (segment) =>
      commandSearches(segment, command) && !fileScopedSearch(segment),
  );
  const eff = c === undefined ? undefined : effective(c);
  const scope =
    project === undefined ? "" : ` --project ${shellQuote(project)}`;
  if (eff !== undefined && ENUMERATORS.has(eff.name))
    return `${ROUTER_COMMAND} files '*'${scope}`;
  let query = strAt(payload, "tool_input", "pattern");
  if (eff !== undefined && SEARCH_PROGRAMS.has(eff.name))
    query = searchPattern(eff.args);
  return `${ROUTER_COMMAND} regex ${shellQuote(query ?? command)}${scope}`;
}

function main(): void {
  const payload = readStdinJson();
  if (payload === undefined) {
    // FATAL: the payload is not JSON, so no axis could be evaluated; fail closed with the one fix
    decidePre(
      "deny",
      "search-route: hook error while classifying search (invalid JSON payload) — failing closed. " +
        `Fix agents/hooks/enforce-search-route.ts in dotfiles before retrying raw search. Rewrite: ${ROUTER_COMMAND} files '*'.`,
    );
  }
  const tool = strAt(payload, "tool_name");
  if (tool !== "Grep" && tool !== "Bash") return;

  if (
    tool === "Bash" &&
    !isRawSearch(
      strAt(payload, "tool_input", "command"),
      strAt(payload, "cwd") ?? process.cwd(),
    )
  ) {
    return;
  }

  // **A governed repo owns its own search policy.** See `governedRepo` above — one act, one
  // authoritative judgment. This is checked before the ccc registration so a repo that is both
  // governed and ccc-registered falls to its own gate.
  const governed = governedRepo(startPath(payload));
  if (governed !== null && governed !== "") return;

  if (!cccIsAvailable()) return;
  let project: string | null = null;
  for (const target of searchTargets(payload)) {
    const candidate = registeredProject(target);
    if (candidate !== null) {
      project = candidate;
      break;
    }
  }
  if (project === null) return;

  if (!existsSync(ROUTER)) {
    // FATAL: without the router there is no route to advise, so the normal deny cannot be built.
    decidePre(
      "deny",
      `search-route: configuration fault — required router is missing at ${ROUTER}. ` +
        `Do not bypass this gate with Python, Node, shell loops, or another search ` +
        `implementation. Restore tools/repo-retrieve/src/repo-retrieve.ts in dotfiles, then retry. Rewrite: repo-retrieve files '*'.`,
    );
  }

  // SINGLE-AXIS: isRawSearch() is one boolean over alternative surfaces, not independent checks —
  // whichever surface matched, the caller owes the same single fix (declare a query shape).
  decidePre(
    "deny",
    `search-route: raw ${tool} search is disabled in operational ccc project ${project}. ` +
      `Rewrite: ${rewrittenSearch(payload, project)}. ` +
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
      `Fix agents/hooks/enforce-search-route.ts in dotfiles before retrying raw search. Rewrite: ${ROUTER_COMMAND} files '*'.`,
  );
}
process.exit(0);
