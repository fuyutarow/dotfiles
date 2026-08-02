import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cli } from "cleye";

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new Error(`unknown option '--${flag}'`);
  }
}

const hard = ["fmt", "f", "fmt:check", "lint", "test", "up", "check"];
const soft = ["setup", "i", "l", "t", "u", "c"];

type Task = Readonly<{
  name: string;
  aliases: string[];
  source: string;
  depends: unknown[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tasks(value: unknown): Task[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.name !== "string" ||
      typeof entry.source !== "string"
    )
      return [];
    return [
      {
        name: entry.name,
        source: entry.source,
        aliases: Array.isArray(entry.aliases)
          ? entry.aliases.filter(
              (alias): alias is string => typeof alias === "string",
            )
          : [],
        depends: Array.isArray(entry.depends) ? entry.depends : [],
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
  try {
    return { tasks: tasks(JSON.parse(stdout)) };
  } catch {
    return { tasks: [], error: "mise returned invalid JSON" };
  }
}

function topLevelToml(source: string): string[] {
  const lines: string[] = [];
  let inBlock = false;
  for (const line of source.split("\n")) {
    const delimiters = (line.match(/'''|"""/g) ?? []).length;
    if (!inBlock && delimiters % 2 === 1) {
      inBlock = true;
      continue;
    }
    if (inBlock) {
      if (delimiters % 2 === 1) inBlock = false;
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
      /^\s*#\s*mise-contract:\s*waive\s+(\S+)\s+--\s+.+$/,
    )?.[1];
    if (full !== undefined) active.add(full);
    else {
      const incomplete = line.match(
        /^\s*#\s*mise-contract:\s*waive\s+(\S+)/,
      )?.[1];
      if (incomplete !== undefined) reasonless.push(incomplete);
    }
  }
  for (const [verb, alias] of [
    ["setup", "i"],
    ["fmt", "f"],
    ["lint", "l"],
    ["test", "t"],
    ["up", "u"],
    ["check", "c"],
  ]) {
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
  [/(^|[|;&(]|&&|\|\|)\s*bunx?\b/m, "bun"],
  [/(^|[|;&(]|&&|\|\|)\s*deno\b/m, "deno"],
  [/(^|[|;&(]|&&|\|\|)\s*(node|npx)\b/m, "node"],
  [/(^|[|;&(]|&&|\|\|)\s*(uv|uvx)\b/m, "uv"],
  [/(^|[|;&(]|&&|\|\|)\s*julia\b/m, "julia"],
  [/(^|[|;&(]|&&|\|\|)\s*cargo\b/m, "rust"],
];

// Raw-text parse on purpose: we need the BODY of every task, and `mise tasks ls` reports
// names, not sources. Handles `run = '''…'''`, `run = "…"`, and `run = ['…', '…']`.
function taskBodies(source: string): Array<{ name: string; body: string }> {
  const out: Array<{ name: string; body: string }> = [];
  const re = /\[tasks\.(?:"([^"]+)"|([A-Za-z0-9_:.-]+))\]([\s\S]*?)(?=\n\[|$)/g;
  for (const match of source.matchAll(re)) {
    const name = match[1] ?? match[2] ?? "?";
    const section = match[3] ?? "";
    const triple = /run\s*=\s*'''([\s\S]*?)'''|run\s*=\s*"""([\s\S]*?)"""/.exec(
      section,
    );
    if (triple) {
      out.push({ name, body: triple[1] ?? triple[2] ?? "" });
      continue;
    }
    const single = /run\s*=\s*(?:'([^']*)'|"([^"]*)")/.exec(section);
    if (single) out.push({ name, body: single[1] ?? single[2] ?? "" });
  }
  return out;
}

function declaredTools(source: string): Set<string> {
  const m = /\[tools\]([\s\S]*?)(?=\n\[|$)/.exec(source);
  const out = new Set<string>();
  if (!m) return out;
  for (const line of m[1].split("\n")) {
    const k = /^\s*(?:"([^"]+)"|([A-Za-z0-9_.-]+))\s*=/.exec(line);
    if (k) out.add((k[1] ?? k[2] ?? "").toLowerCase());
  }
  return out;
}

// Returns [failures, warnings] and prints its own lines, matching this script's style.
function checkBodies(source: string): [number, number] {
  let failures = 0;
  const warnings = 0;
  const bodies = taskBodies(source);
  const tools = declaredTools(source);

  const needed = new Map<string, string[]>();
  for (const { name, body } of bodies) {
    for (const [re, tool] of RUNTIMES) {
      if (!re.test(body)) continue;
      const users = needed.get(tool);
      if (users === undefined) needed.set(tool, [name]);
      else users.push(name);
    }
    const lines = body.split("\n").filter((l) => l.trim() !== "").length;
    if (lines > BODY_MAX_LINES) {
      process.stdout.write(
        `FAIL  body: task '${name}' has ${lines} lines (max ${BODY_MAX_LINES}) — ` +
          `a TOML-embedded body cannot be imported or tested; move the logic to a ` +
          `script file and leave a one-line launcher\n`,
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

async function check(
  rootInput: string,
): Promise<{ failures: number; environmentFailure: boolean }> {
  const root = resolve(rootInput);
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
  const local = listed.tasks.filter((task) =>
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
    if (![...hard, ...soft].includes(token)) {
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
  if (existsSync(tomlPath)) {
    const [bodyFailures, bodyWarnings] = checkBodies(
      await readFile(tomlPath, "utf8"),
    );
    failures += bodyFailures;
    warnings += bodyWarnings;
  }

  const hyphens = local
    .map((task) => task.name)
    .filter((name) => name.includes("-"));
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
  process.exit(environmentFailure ? 2 : failures === 0 ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(
    `ENV ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(2);
});
