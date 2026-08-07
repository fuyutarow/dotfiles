// PreToolUse gate (matcher: Grep|Bash) — ban UNCLASSIFIED direct search in an operational
// ccc-registered project. The ban is on raw search surfaces (including direct ccc search/grep)
// and obvious general-purpose-runtime reimplementations, not on rg or ccc as engines: the router
// invokes them only after the caller declares the query shape.
//
// FAIL CLOSED on hook errors. Outside a registered project, or when ccc is unavailable, stay
// silent: lexical search remains the only available local backend. The router lives beside this
// hook, so the hook and its required entrypoint deploy as one linked directory.

import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { decidePre, findExe, readStdinJson } from "./lib.ts";

const GREP_SEARCH =
  /(^|[|;&(]|&&|\|\||\bthen\b|\bdo\b)\s*(?:(?:sudo|command|time|nice)\s+|(?:\S*\/)?env(?:\s+[A-Za-z_]\w*=\S+)*\s+|timeout(?:\s+--\S+)*\s+\S+\s+)*(?:\S*\/)?(grep|egrep|fgrep|rg|ripgrep|ag|ack|ugrep)\b/;
const GIT_GREP =
  /(^|[|;&(]|&&|\|\||\bthen\b|\bdo\b)\s*git(?:\s+-C\s+(?:"[^"]+"|'[^']+'|\S+))?\s+grep\b/;
const CCC_SEARCH =
  /(^|[|;&(]|&&|\|\||\bthen\b|\bdo\b)\s*(?:(?:sudo|command|time|nice)\s+|(?:\S*\/)?env(?:\s+[A-Za-z_]\w*=\S+)*\s+|timeout(?:\s+--\S+)*\s+\S+\s+)*(?:\S*\/)?ccc\s+(search|grep)\b/;
const FIND_SEARCH =
  /(^|[|;&(]|&&|\|\|)\s*(sudo\s+)*find\b[^|;&]*\s-(i?name|i?path|i?regex)\b/;
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
const ROUTER = join(import.meta.dir, "repo-search.ts");
const ROUTER_COMMAND = "bun ~/.claude/hooks/repo-search.ts";

function isRawSearch(command: unknown): boolean {
  if (typeof command !== "string" || command === "") return false;
  return (
    GREP_SEARCH.test(command) ||
    GIT_GREP.test(command) ||
    CCC_SEARCH.test(command) ||
    FIND_SEARCH.test(command) ||
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

function registeredProject(start: string): string | null {
  let current: string;
  try {
    current = statSync(start).isDirectory() ? start : dirname(start);
  } catch {
    current = start;
  }
  current = resolve(current);

  while (true) {
    if (existsSync(join(current, ".cocoindex_code", "settings.yml"))) {
      return current;
    }
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

  const project = registeredProject(startPath(payload));
  if (!project || !cccIsAvailable()) return;

  if (!existsSync(ROUTER)) {
    // FATAL: without the router there is no route to advise, so the normal deny cannot be built.
    decidePre(
      "deny",
      `search-route: configuration fault — required router is missing at ${ROUTER}. ` +
        `Do not bypass this gate with Python, Node, shell loops, or another search ` +
        `implementation. Restore/deploy ~/.claude/hooks/repo-search.ts, then retry.`,
    );
  }

  // SINGLE-AXIS: isRawSearch() is one boolean over alternative surfaces, not independent checks —
  // whichever surface matched, the caller owes the same single fix (declare a query shape).
  decidePre(
    "deny",
    `search-route: raw ${tool} search is disabled in operational ccc project ${project}. ` +
      `Declare the query shape through the guaranteed entrypoint ${ROUTER_COMMAND}: ` +
      `${ROUTER_COMMAND} concept --query '<unknown-name concept>'; ` +
      `${ROUTER_COMMAND} battery --query '<q1>' --query '<q2>' --query '<q3>' ` +
      `(absence/new implementation); ` +
      `${ROUTER_COMMAND} literal --query '<exact text>'; ` +
      `${ROUTER_COMMAND} exhaustive --query '<regex>'; ` +
      `${ROUTER_COMMAND} structural --query '<by-example pattern>'; ` +
      `${ROUTER_COMMAND} files --glob '<glob>'. ` +
      `Known-symbol definitions/references go to Serena. The router may choose rg; ` +
      `the forbidden act is unclassified search, not lexical search. This is a policy ` +
      `boundary: do not bypass it with Python, Node, shell loops, or another tool.`,
  );
}

try {
  main();
  process.exit(0);
} catch (error) {
  decidePre(
    "deny",
    `search-route: hook error while classifying search ` +
      `(${error instanceof Error ? error.message : String(error)}) — failing closed. ` +
      `Fix ~/.claude/hooks/enforce-search-route.ts before retrying raw search.`,
  );
}
