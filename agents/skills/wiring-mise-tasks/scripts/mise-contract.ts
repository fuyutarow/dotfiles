import { existsSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { cli } from "cleye";
import { jsonText, z } from "../../../hooks/zod.ts";

// Cleye handles unknown options after parsing their raw spelling.

const hard = ["fmt", "f", "fmt:check", "lint", "test", "up", "check"];
const soft = ["setup", "i", "fmt:staged", "l", "t", "u", "c"];
// A colocated jj repo (a `.jj/` beside `.git/`) runs NO git hooks, so its commit gate and its
// post-merge step exist only as these two verbs (wiring-repositories JJ-1). Hard there; not
// checked in a git-only repo.
const jj = ["commit", "pull"];
const unknownArrayOrEmpty = z.unknown().transform((value) => {
  const parsed = z.array(z.unknown()).safeParse(value);
  return parsed.success ? parsed.data : [];
});

type Task = Readonly<{
  name: string;
  aliases: string[];
  source: string;
  depends: unknown[];
}>;

const TaskEntrySchema = z.object({
  name: z.string(),
  source: z.string(),
  aliases: unknownArrayOrEmpty,
  depends: unknownArrayOrEmpty,
});

function tasks(value: unknown): Task[] {
  const entries = z.array(z.unknown()).safeParse(value);
  if (!entries.success) return [];
  return entries.data.flatMap((entry) => {
    const parsed = TaskEntrySchema.safeParse(entry);
    if (!parsed.success) return [];
    return [
      {
        name: parsed.data.name,
        source: parsed.data.source,
        aliases: parsed.data.aliases.flatMap((alias) =>
          typeof alias === "string" ? [alias] : [],
        ),
        depends: parsed.data.depends,
      },
    ];
  });
}

async function miseTasks(
  root: string,
): Promise<{ tasks: Task[]; error?: string }> {
  // bounded: mise tasks ls exits promptly; env failures surface via captured stderr
  const child = Bun.spawn(["mise", "tasks", "ls", "--json"], {
    cwd: root,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
    killSignal: "SIGTERM",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) return { tasks: [], error: stderr };
  const decoded = jsonText.safeParse(stdout);
  if (!decoded.success) {
    return { tasks: [], error: "mise returned invalid JSON" };
  }
  return { tasks: tasks(decoded.data) };
}

function topLevelToml(source: string): string[] {
  const lines: string[] = [];
  let inBlock = false;
  for (const line of source.split("\n")) {
    const delimiters = (line.match(/'''|"""/gu) ?? []).length;
    if (inBlock) {
      inBlock = delimiters % 2 !== 1;
      continue;
    }
    if (delimiters % 2 === 1) {
      inBlock = true;
      continue;
    }
    lines.push(line);
  }
  return lines;
}

function waivers(lines: string[]): {
  active: Set<string>;
  reasonless: string[];
} {
  const active = new Set<string>();
  const reasonless: string[] = [];
  for (const line of lines) {
    const full = line.match(
      /^\s*#\s*mise-contract:\s*waive\s+(\S+)\s+--\s+.+$/u,
    )?.[1];
    if (full !== undefined) {
      active.add(full);
      continue;
    }
    const incomplete = line.match(
      /^\s*#\s*mise-contract:\s*waive\s+(\S+)/u,
    )?.[1];
    if (incomplete !== undefined) reasonless.push(incomplete);
  }
  const verbAliases: ReadonlyArray<readonly [string, string]> = [
    ["setup", "i"],
    ["fmt", "f"],
    ["lint", "l"],
    ["test", "t"],
    ["up", "u"],
    ["check", "c"],
  ];
  for (const [verb, alias] of verbAliases) {
    if (active.has(verb)) active.add(alias);
  }
  return { active, reasonless };
}

function dependencyName(value: unknown): string | undefined {
  if (Array.isArray(value))
    return typeof value[0] === "string" ? value[0] : undefined;
  return typeof value === "string" ? value.split(" ")[0] : undefined;
}

// --- C-A RUNTIME-DECLARED / C-B BODY-IS-DECLARATION (added 2026-07-25) -----------------
// Both come from one measured failure. `[tools]` pinning had been routed OUT of this skill
// as "model-native"; the consequence, censused across three repos on 2026-07-25, was that
// EVERY one of them invoked a runtime from a task body while declaring none of it — dotfiles
// and beateater had no [tools] section at all, qoed declared julia only. `mise run` then
// depends on whatever the machine happens to have, which is the exact opposite of what mise
// is for. The task graph's soundness is NOT separable from the runtime declaration: a body
// that says `bun x` is only correct if [tools] says bun.
//
// C-B is the same lesson one level down. cc:install-mcp was a ~40-line shell body that
// looped over jq output; it silently failed to prune anything, and no test existed because
// no test CAN exist for a body embedded in TOML. Bodies declare; logic lives in a script
// file where it can be imported and tested (writing-bun-scripts NO-NEW-BASH owns the rule,
// this is its mise boundary).

const BODY_MAX_LINES = 10;

// Runtime binaries whose presence a task body assumes. Key = binary in command position,
// value = the [tools] key that would declare it.
const RUNTIMES: Array<[RegExp, string]> = [
  [/(^|[|;&(]|&&|\|\|)\s*bunx?\b/mu, "bun"],
  [/(^|[|;&(]|&&|\|\|)\s*deno\b/mu, "deno"],
  [/(^|[|;&(]|&&|\|\|)\s*(node|npx)\b/mu, "node"],
  [/(^|[|;&(]|&&|\|\|)\s*(uv|uvx)\b/mu, "uv"],
  [/(^|[|;&(]|&&|\|\|)\s*julia\b/mu, "julia"],
  [/(^|[|;&(]|&&|\|\|)\s*cargo\b/mu, "rust"],
];

// Raw-text parse on purpose: we need the BODY of every task, and `mise tasks ls` reports
// names, not sources. Handles `run = '''…'''`, `run = "…"`, and `run = ['…', '…']`.
/**
 * Task `run` bodies, isolated. Multi-line-string aware, and that is load-bearing.
 *
 * The previous implementation split sections on the first `\n[`. A `'''` body whose line begins
 * with a shell test — `[ -z "$files" ] && …` — therefore ENDED its own section there, the closing
 * `'''` was never found, and the body vanished from the gate entirely. Proven 2026-08-30 with a
 * 14-line fixture: no over-length FAIL, and the runtime census counted one task instead of two.
 *
 * The gate was blind to precisely the bodies most likely to violate it — the ones carrying shell
 * control flow. Both checks below depend on this being right.
 */
function taskBodies(source: string): Array<{ name: string; body: string }> {
  const out: Array<{ name: string; body: string }> = [];
  let name: string | undefined;
  let body: string[] | undefined;
  let closer: string | undefined;

  for (const line of source.split("\n")) {
    if (closer !== undefined) {
      const handled = consumeTaskBodyLine(line, closer, name, body, out);
      body = handled.body;
      closer = handled.closer;
      continue;
    }
    const header = /^\s*\[tasks\.(?:"([^"]+)"|([A-Za-z0-9_:.-]+))\]/u.exec(
      line,
    );
    if (header !== null) {
      name = header[1] ?? header[2];
      continue;
    }
    if (/^\s*\[/u.test(line)) {
      name = undefined;
      continue;
    }
    if (name === undefined) continue;

    const run = /^\s*run\s*=\s*(.*)$/u.exec(line);
    if (run === null) continue;
    const rest = run[1] ?? "";
    const open = /^('''|""")/u.exec(rest);
    const single = /^(?:'([^']*)'|"([^"]*)")/u.exec(rest);
    if (open === null && single !== null) {
      out.push({ name, body: single[1] ?? single[2] ?? "" });
    }
    if (open === null) {
      continue;
    }
    closer = open[1];
    const tail = rest.slice(3);
    const end = tail.indexOf(closer ?? "");
    if (end !== -1) {
      out.push({ name, body: tail.slice(0, end) });
      closer = undefined;
      continue;
    }
    body = tail.trim() === "" ? [] : [tail];
  }
  return out;
}

function consumeTaskBodyLine(
  line: string,
  closer: string,
  name: string | undefined,
  body: string[] | undefined,
  out: Array<{ name: string; body: string }>,
): { closer: string | undefined; body: string[] | undefined } {
  const end = line.indexOf(closer);
  if (end === -1) {
    body?.push(line);
    return { body, closer };
  }
  if (end > 0) body?.push(line.slice(0, end));
  if (name !== undefined && body !== undefined)
    out.push({ name, body: body.join("\n") });
  return { body: undefined, closer: undefined };
}

/**
 * A body reduced to text that could actually RUN a command.
 *
 * Comments go, and so do `echo`/`printf` arguments. Measured 2026-08-30: a body whose only
 * mention of `uv` was inside `echo "... (uv tool install cocoindex-code)"` was reported as
 * invoking uv. The FAIL was then written into that repo's config as deliberate debt —
 * **a false positive institutionalised as intentional non-compliance.**
 *
 * Only echo/printf are stripped, not every quoted span. `sh -c "uv ..."` really does invoke uv,
 * and blanket quote-stripping would hide it. This is the mention-vs-action cut, drawn where the
 * mention actually lives.
 */
function commandText(body: string): string {
  return body
    .split("\n")
    .map((l) => l.replace(/(^|\s)#.*$/u, "$1"))
    .join("\n")
    .replaceAll(/\b(?:echo|printf)\b[^\n;]*/gu, " ");
}

/**
 * Shell control flow at command position, after comments and quoted spans are removed.
 *
 * Stripping first is not optional: a body that MENTIONS `if` inside an echo string is not
 * branching, and reading a mention as an action is the failure this house has recorded three
 * times against itself.
 *
 * `&&` and `||` are deliberately NOT tells. `cmd_a && cmd_b` is a fail-fast sequence, not logic,
 * and flagging it would fire on almost every benign body.
 */
function controlFlow(body: string): string[] {
  const code = body
    .split("\n")
    .map((l) => l.replace(/(^|\s)#.*$/u, "$1"))
    .join("\n")
    .replaceAll(/'[^'\n]*'|"[^"\n]*"/gu, " ");
  const at = "(?:^|[\\n;|&(]|\\bthen\\b|\\bdo\\b)\\s*";
  const tells: Array<[RegExp, string]> = [
    [new RegExp(`${at}if\\b`, "mu"), "if"],
    [new RegExp(`${at}for\\b`, "mu"), "for"],
    [new RegExp(`${at}while\\b`, "mu"), "while"],
    [new RegExp(`${at}until\\b`, "mu"), "until"],
    [new RegExp(`${at}case\\b`, "mu"), "case"],
    [new RegExp(`${at}\\[\\[?\\s`, "mu"), "a [ test"],
    [new RegExp(`${at}test\\s`, "mu"), "a test command"],
  ];
  return tells.filter(([re]) => re.test(code)).map(([, label]) => label);
}

function declaredTools(source: string): Set<string> {
  const m = /\[tools\]([\s\S]*?)(?=\n\[|$)/u.exec(source);
  const out = new Set<string>();
  if (m === null) return out;
  for (const line of (m[1] ?? "").split("\n")) {
    const k = /^\s*(?:"([^"]+)"|([A-Za-z0-9_.-]+))\s*=/u.exec(line);
    if (k !== null) out.add((k[1] ?? k[2] ?? "").toLowerCase());
  }
  return out;
}

// --- C-C MINOR-PINNED (added 2026-10-05) ----------------------------------------------------
// A runtime pinned to a patch ("1.4.0") is never bumped, so it goes stale, and with mise's
// auto_install it reinstalls that old release on use. Measured 2026-10-05: soks, OpenFactory/soks
// and polysearch-rs pinned bun 1.4.0, Coral-dpp and four DPP repos 1.2.22, qoed 1.3.14, and r99
// had 1.4.0 reinstalled beside 1.4.2. The owner's rule: bun is "1.4" everywhere, no exception.
// The house value lives in ONE place, the dotfiles mise.toml beside this skill; other tools only
// warn on a patch pin, since their owners choose the version.
const HOUSE_TOML = join(import.meta.dir, "..", "..", "..", "..", "mise.toml");
function toolPins(source: string): Map<string, string> {
  const m = /\[tools\]([\s\S]*?)(?=\n\[|$)/u.exec(source);
  const out = new Map<string, string>();
  for (const line of (m?.[1] ?? "").split("\n")) {
    const k = /^\s*(?:"([^"]+)"|([A-Za-z0-9_.-]+))\s*=\s*"([^"]*)"/u.exec(line);
    if (k !== null) out.set((k[1] ?? k[2] ?? "").toLowerCase(), k[3] ?? "");
  }
  return out;
}
async function checkPins(source: string): Promise<[number, number]> {
  let failures = 0;
  let warnings = 0;
  const house = existsSync(HOUSE_TOML)
    ? toolPins(await readFile(HOUSE_TOML, "utf8")).get("bun")
    : undefined;
  for (const [tool, pin] of toolPins(source)) {
    if (tool === "bun" && house !== undefined && pin !== house) {
      process.stdout.write(
        `FAIL  pin: bun = "${pin}" — the house pin is bun = "${house}" (a minor, tracking its newest patch); write bun = "${house}"\n`,
      );
      failures += 1;
    } else if (/^\d+\.\d+\.\d+$/u.test(pin)) {
      process.stdout.write(
        `WARN  pin: ${tool} = "${pin}" is a patch pin — it is never bumped and mise auto_install reinstalls it; pin the minor ("${pin.split(".").slice(0, 2).join(".")}")\n`,
      );
      warnings += 1;
    }
  }
  return [failures, warnings];
}

// Returns [failures, warnings] and prints its own lines, matching this script's style.
function checkBodies(source: string): [number, number] {
  let failures = 0;
  const warnings = 0;
  const bodies = taskBodies(source);
  const tools = declaredTools(source);

  const needed = new Map<string, string[]>();
  for (const { name, body } of bodies) {
    const cmd = commandText(body);
    recordRuntimeUsers(cmd, name, needed);
    const lines = body.split("\n").filter((l) => l.trim() !== "").length;
    if (lines > BODY_MAX_LINES) {
      process.stdout.write(
        `FAIL  body: task '${name}' has ${lines} lines (max ${BODY_MAX_LINES}) — ` +
          `a TOML-embedded body cannot be imported or tested; move the logic to a ` +
          `script file and leave a one-line launcher\n`,
      );
      failures += 1;
    }
    // Length is the weaker half of C-B and always was: the rule reads "over 10 non-blank lines,
    // OR any branching/parsing logic". Only the count was ever enforced, so a 4-line body with a
    // shell test passed. Measured 2026-08-30: exactly such a body broke a sibling gate's parser.
    const flow = controlFlow(body);
    if (flow.length > 0 && lines <= BODY_MAX_LINES) {
      process.stdout.write(
        `FAIL  body: task '${name}' branches in TOML (${flow.join(", ")}) — ` +
          `length is not the rule, testability is; a body with control flow cannot be ` +
          `imported or tested. Move it to a script file and leave a one-line launcher\n`,
      );
      failures += 1;
    }
  }

  for (const [tool, users] of needed) {
    if (tools.has(tool)) {
      process.stdout.write(
        `OK    tools: ${tool} declared (used by ${users.length} task(s))\n`,
      );
    } else {
      process.stdout.write(
        `FAIL  tools: task(s) ${users.join(" ")} invoke '${tool}' but [tools] does not ` +
          `declare it — mise run then depends on whatever the machine happens to have\n`,
      );
      failures += 1;
    }
  }
  return [failures, warnings];
}

function recordRuntimeUsers(
  command: string,
  taskName: string,
  needed: Map<string, string[]>,
): void {
  for (const [pattern, tool] of RUNTIMES) {
    if (!pattern.test(command)) continue;
    const users = needed.get(tool);
    if (users === undefined) needed.set(tool, [taskName]);
    else users.push(taskName);
  }
}

function reportJjTokens(
  tokens: string[],
  resolved: Set<string>,
  activeWaivers: Set<string>,
): number {
  let failures = 0;
  for (const token of tokens) {
    if (resolved.has(token)) {
      process.stdout.write(`OK    ${token} (jj repo)\n`);
      continue;
    }
    if (activeWaivers.has(token)) {
      process.stdout.write(`WAIVE ${token} (mise.toml waiver)\n`);
      continue;
    }
    process.stdout.write(
      `FAIL  ${token} — unresolved in a jj repo: jj runs no git hooks, so without it ` +
        `${token === "commit" ? "every commit skips hook:pre-commit" : "a fetch never runs hook:post-merge"} ` +
        `(template: templates/*.mise.toml [tasks.${token}])\n`,
    );
    failures += 1;
  }
  return failures;
}

async function check(
  rootInput: string,
): Promise<{ failures: number; environmentFailure: boolean }> {
  // Real path: mise reports each task's source by its real path, so a root reached through a
  // symlink (macOS /var -> /private/var, a linked checkout) otherwise matches none of its own
  // tasks and reads as "contract not adopted".
  // Messages keep the path the caller gave; only the source match uses the real path.
  const root = resolve(rootInput);
  const realRoot = existsSync(root) ? realpathSync(root) : root;
  if (!existsSync(root)) {
    process.stdout.write(`ENV cannot cd to ${rootInput}\n`);
    return { failures: 0, environmentFailure: true };
  }
  const listed = await miseTasks(root);
  if (listed.error !== undefined) {
    process.stdout.write(
      `ENV mise tasks ls failed in ${root}: ${listed.error}\n`,
    );
    if (listed.error.includes("not trusted"))
      process.stdout.write(
        `ENV   hint: run \`mise trust ${root}/mise.toml\` ([env] blocks need trust before mise lists tasks)\n`,
      );
    return { failures: 0, environmentFailure: true };
  }
  const local = listed.tasks.filter(
    (task) =>
      task.source.startsWith(`${realRoot}/`) ||
      task.source.startsWith(`${root}/`),
  );
  if (local.length === 0) {
    process.stdout.write(
      `FAIL  ${root}: no local mise tasks (contract not adopted)\n`,
    );
    return { failures: 1, environmentFailure: false };
  }
  const resolved = new Set(
    local.flatMap((task) => [task.name, ...task.aliases]),
  );
  const tomlPath = `${root}/mise.toml`;
  const waiver = existsSync(tomlPath)
    ? waivers(topLevelToml(await readFile(tomlPath, "utf8")))
    : { active: new Set<string>(), reasonless: [] };
  let failures = 0;
  let warnings = 0;
  for (const token of waiver.reasonless) {
    process.stdout.write(
      `WARN  waiver for '${token}' has no ' -- <reason>' — inert (reason is required)\n`,
    );
    warnings += 1;
  }
  for (const token of waiver.active) {
    if (![...hard, ...soft, ...jj].includes(token)) {
      process.stdout.write(
        `WARN  waiver names unknown token '${token}' — inert (not in the contract)\n`,
      );
      warnings += 1;
    }
  }
  for (const token of hard) {
    if (resolved.has(token)) process.stdout.write(`OK    ${token}\n`);
    else if (waiver.active.has(token))
      process.stdout.write(`WAIVE ${token} (mise.toml waiver)\n`);
    else {
      process.stdout.write(
        `FAIL  ${token} — unresolved: mise run ${token} would die with 'no task ${token} found'\n`,
      );
      failures += 1;
    }
  }
  for (const token of soft) {
    if (resolved.has(token)) process.stdout.write(`OK    ${token}\n`);
    else if (waiver.active.has(token)) process.stdout.write(`WAIVE ${token}\n`);
    else {
      process.stdout.write(`WARN  ${token} — unresolved (soft token)\n`);
      warnings += 1;
    }
  }
  if (existsSync(`${root}/.jj`))
    failures += reportJjTokens(jj, resolved, waiver.active);
  if (existsSync(tomlPath)) {
    const source = await readFile(tomlPath, "utf8");
    const [bodyFailures, bodyWarnings] = checkBodies(source);
    failures += bodyFailures;
    warnings += bodyWarnings;
    const [pinFailures, pinWarnings] = await checkPins(source);
    failures += pinFailures;
    warnings += pinWarnings;
  }

  // `hook:<event>` names mirror git's own hook file names 1:1 (.githooks/pre-commit ->
  // hook:pre-commit), so the hyphen is git's, not a separator. Exempt ONLY git's documented hook
  // names (githooks(5)); `hook:my-thing` still warns. Shape of these tasks: wiring-repositories HOOK-1.
  const GIT_HOOKS = new Set([
    "applypatch-msg",
    "pre-applypatch",
    "post-applypatch",
    "pre-commit",
    "pre-merge-commit",
    "prepare-commit-msg",
    "commit-msg",
    "post-commit",
    "pre-rebase",
    "post-checkout",
    "post-merge",
    "pre-push",
    "pre-receive",
    "update",
    "proc-receive",
    "post-receive",
    "post-update",
    "reference-transaction",
    "push-to-checkout",
    "pre-auto-gc",
    "post-rewrite",
    "sendemail-validate",
    "fsmonitor-watchman",
    "post-index-change",
  ]);
  const hyphens = local
    .map((task) => task.name)
    .filter((name) => name.includes("-"))
    .filter(
      (name) => !(name.startsWith("hook:") && GIT_HOOKS.has(name.slice(5))),
    );
  if (hyphens.length > 0) {
    process.stdout.write(
      `WARN  grammar: hyphen in task name (colon-only rule): ${hyphens.join(" ")}\n`,
    );
    warnings += 1;
  }
  const checkTask = local.find((task) => task.name === "check");
  if (checkTask?.depends.length === 0) {
    process.stdout.write(
      "WARN  grammar: check has empty depends (check = all-gates aggregate)\n",
    );
    warnings += 1;
  }
  const badDependencies = new Set<string>();
  for (const dependency of local.flatMap((task) => task.depends)) {
    const name = dependencyName(dependency);
    if (name !== undefined && !name.includes("*") && !resolved.has(name))
      badDependencies.add(name);
  }
  if (badDependencies.size > 0) {
    process.stdout.write(
      `WARN  grammar: depends reference unresolved task(s): ${[...badDependencies].join(" ")}\n`,
    );
    warnings += 1;
  }
  process.stdout.write(
    `—     mise-contract: ${failures} hard, ${warnings} warn (${root})\n`,
  );
  return { failures, environmentFailure: false };
}

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`FATAL: unknown option '--${flag}'\n`);
    process.exit(2);
  }
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "mise-contract.ts",
      parameters: ["[roots...]"],
      strictFlags: true,
        ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (Bun.which("mise") === null) {
    process.stdout.write("ENV mise not installed\n");
    process.exit(2);
  }
  let failures = 0;
  let environmentFailure = false;
  for (const root of parsed._.length === 0 ? ["."] : parsed._) {
    const result = await check(root);
    failures += result.failures;
    environmentFailure ||= result.environmentFailure;
  }
  let code: number;
  if (environmentFailure) code = 2;
  else if (failures === 0) code = 0;
  else code = 1;
  process.exit(code);
}

await main().catch((error) => {
  process.stderr.write(
    `ENV ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(2);
});
