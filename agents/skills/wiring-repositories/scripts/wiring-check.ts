// wiring-check — the deterministic floor for a repo's WIRING JOINT.
//
// **THIS IS NOT A SEMANTIC CHECK.** It cannot tell you whether a layer SHOULD be here — that is
// S1 ADMISSION, and it is judgment (SKILL.md). What it does is detect states that are internally
// incoherent, and it exists because **every state it detects is silent**: git prints nothing for
// a hook bound to a missing script, mise prints nothing for a task run against an ambient
// toolchain, and a search over an excluded directory returns NO_MATCH rather than an error.
//
// It reads `.claude/settings.json`, `mise.toml`, and `.githooks/` DIRECTLY and never searches for
// a filename. That is deliberate: the lexical search route does not descend into `.claude/`
// (references/layers.md §4), so a reference-by-search audit reports absence for files that are
// in fact registered.
//
// Exit: 0 clean, 1 findings, 2 FATAL.

import { existsSync, statSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { $ } from "bun";
import { cli } from "cleye";
import { jsonOf, jsonText, z } from "../../../hooks/zod.ts";

/** `.claude/settings.json` `permissions.deny`, the only part of the file JJ-2 reads. */
const DenyRulesSchema = z.object({ permissions: z.object({ deny: z.array(z.unknown()) }) });

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new Error(`unknown option '--${flag}'`);
  }
}

type Finding = { readonly tag: string; readonly msg: string };

const findings: Finding[] = [];
const notes: string[] = [];
const seen = new Set<string>();
/** Deduped: a body naming the same broken link three times is one defect, not three. */
const fail = (tag: string, msg: string): void => {
  if (seen.has(`${tag}\u0000${msg}`)) return;
  seen.add(`${tag}\u0000${msg}`);
  const why = waived.get(tag);
  if (why !== undefined) {
    notes.push(`WAIVED ${tag} — ${why}`);
    return;
  }
  findings.push({ tag, msg });
};

/** tag -> reason, from mise.toml. Read before any check runs; consulted by `fail`. */
const waived = new Map<string, string>();

/**
 * Waivers, in the form this house already uses for `mise-contract`:
 *
 *   # wiring-check: waive ORDER-4 -- why this repo decided otherwise
 *
 * A reason is REQUIRED; without one the line is inert and the finding stands. The point is a
 * signature, not silence. "We decided against it" and "we never decided" look identical from
 * outside, and S1 exists to tell them apart.
 */
function parseWaivers(mise: string): void {
  for (const m of mise.matchAll(/^\s*#\s*wiring-check:\s*waive\s+(\S+)\s+--\s+(.+)$/gmu)) {
    if (m[1] !== undefined && m[2] !== undefined) waived.set(m[1], m[2].trim());
  }
}

type Task = { readonly run: string; readonly alias: string[]; readonly deps: string[]; readonly hasRun: boolean; readonly raw: boolean };
type MiseRun = { readonly tasks: string[]; readonly swallowed: string[]; readonly serial: boolean };

/**
 * Top-level `[tasks.x]` / `[tasks."x:y"]` headers, with their RUN bodies isolated.
 *
 * Two things this must get right, both learned by being wrong (proof-of-fire, 2026-08-30):
 *
 * 1. **A `'''` run body can contain a line starting with `[`** — `[ -z "$files" ] && …` is
 *    ordinary shell. Reading that as a TOML section header silently truncates the parse, and
 *    every task after it disappears. The symptom is not an error; it is a check that quietly
 *    stops looking. So multi-line string state is tracked.
 * 2. **`description` is prose, not a call site.** A description naming `link-dots.ts` is not a
 *    task invoking it. Only the `run` value feeds path and toolchain detection.
 */
function miseTasks(src: string): Map<string, Task> {
  const out = new Map<string, Task>();
  let name: string | undefined;
  let run: string[] = [];
  let alias: string[] = [];
  let deps: string[] = [];
  let hasRun = false;
  let raw = false;
  let inDeps = false;
  let multi: string | undefined; // the ''' or """ currently open
  let inRun = false;

  const flush = (): void => {
    if (name !== undefined) out.set(name, { run: run.join("\n"), alias, deps, hasRun, raw });
    run = [];
    alias = [];
    deps = [];
    hasRun = false;
    raw = false;
    inDeps = false;
    inRun = false;
  };
  const takeDeps = (text: string): void => {
    for (const d of text.matchAll(/["']([^"']+)["']/gu)) if (d[1] !== undefined) deps.push(d[1]);
  };

  src.split("\n").forEach((line) => {
    const activeDelimiter = multi;
    if (activeDelimiter !== undefined && inRun) run.push(line);
    if (activeDelimiter !== undefined && line.includes(activeDelimiter)) {
        multi = undefined;
        inRun = false;
    }
    if (activeDelimiter !== undefined) {
      return;
    }
    const header = /^\s*\[tasks\.(?:"([^"]+)"|([\w:.-]+))\]/u.exec(line);
    if (header !== null) {
      flush();
      name = header[1] ?? header[2];
      return;
    }
    if (/^\s*\[/u.test(line)) {
      flush();
      name = undefined;
      return;
    }
    if (name === undefined) return;
    if (/^\s*raw\s*=\s*true\b/u.test(line)) raw = true;

    const kv = /^\s*(run|depends|alias)\s*=\s*(.*)$/u.exec(line);
    if (kv !== null) {
      const key = kv[1];
      const rest = kv[2] ?? "";
      inDeps = false;
      hasRun ||= key === "run";
      const isDepends = key === "depends";
      takeDeps(isDepends ? rest : "");
      inDeps = isDepends && !rest.includes("]");
      const open = /^('''|""")/u.exec(rest);
      const delim = open?.[1] ?? "";
      const after = rest.slice(delim.length);
        // A body that opens AND closes on one line (`run = '''cmd'''`) is not multi-line. Treating
        // it as open swallowed every task until the next triple quote — 150 lines of dotfiles'
        // mise.toml, `lint` and `fmt:check` among them (found 2026-09-22).
      if (open !== null && after.includes(delim) && key === "run")
        run.push(after.slice(0, after.indexOf(delim)));
      if (open !== null && after.includes(delim)) return;
      if (open !== null) {
        multi = delim;
        inRun = key === "run";
        return;
      }
      const values = Array.from(rest.matchAll(/["']([^"']+)["']/gu), (match) => match[1]).flatMap((value) => value === undefined ? [] : [value]);
      alias.push(...(key === "alias" ? values : []));
      run.push(...(key === "alias" ? [] : [rest]));
      return;
    }
    // continuation lines of a multi-line `depends = [` array
    const dependencyLine = /^\s*["']/u.test(line);
    if (dependencyLine) {
      run.push(line);
    }
    if (dependencyLine && inDeps) takeDeps(line);
    if (inDeps && line.includes("]")) inDeps = false;
  });
  flush();

  // Aliases are call sites too: `mise run f` resolves via `alias = "f"` on the fmt task.
  for (const [, task] of Array.from(out.entries())) {
    for (const a of task.alias) out.set(a, task);
  }
  return out;
}

/**
 * File-ish tokens a task body names, so a task bound to a missing script is detectable.
 *
 * Expansion is deliberate and incomplete. `{{config_root}}` and `$HOME`/`${HOME}` are the two
 * forms task bodies actually use here; anything still carrying `$` or `{` after that is a
 * computed path this floor cannot resolve, and is DROPPED rather than reported — a false
 * "missing file" trains the reader to ignore the check (proof-of-fire, 2026-08-30: `${HOME}`
 * was unhandled and produced two phantom findings against a file that exists).
 */
function pathTokens(body: string, root: string): string[] {
  const home = process.env["HOME"] ?? "";
  return [...body.matchAll(/[\w./${}~-]*[\w-]\.(?:ts|js|sh|jl|py|rs|toml|json)\b/gu)]
    .map((m) => m[0]
      .replaceAll(/\{\{\s*config_root\s*\}\}/gu, root)
      .replaceAll(/\$\{HOME\}|\$HOME/gu, home)
      .replace(/^~(?=\/)/u, home))
    .filter((p) => !p.startsWith("http") && !/[${}]/u.test(p));
}

/** undefined for a missing path OR a directory — readdir hands back both (proof-of-fire, 2026-08-30). */
async function readIf(path: string): Promise<string | undefined> {
  if (!existsSync(path) || !statSync(path).isFile()) return undefined;
  return readFile(path, "utf8");
}

function checkHookTask(entry: string, task: string, root: string, tasks: Map<string, Task>): void {
  if (!tasks.has(task)) {
    fail("ORDER-2", `.githooks/${entry} calls \`mise run ${task}\`, which mise.toml does not define. ` +
      `git reports nothing — commits pass ungated.`);
    return;
  }
  const paths = pathTokens(tasks.get(task)?.run ?? "", root);
  for (const path of paths) {
    if (existsSync(resolve(root, path))) continue;
    fail("ORDER-2", `.githooks/${entry} -> \`mise run ${task}\` -> missing file \`${path}\`. ` +
      `The chain resolves until the last link; nothing reports the break.`);
  }
}

function checkThinHook(entry: string, raw: string): void {
  if (raw === "") return;
  const code = raw
    .split("\n")
    .map((line) => line.replace(/(^|\s)#.*$/u, "$1"))
    .join("\n")
    .replaceAll(/'[^'\n]*'|"[^"\n]*"/gu, " ");
  const args = raw.split("\n").map((line) => line.replace(/(^|\s)#.*$/u, "$1")).join("\n");
  if (entry !== "pre-commit" && /\$[123@*]|\$\{[123@*]/u.test(args)) {
    notes.push(`.githooks/${entry} reads git's hook arguments, so the thin-wrapper rule does ` +
      `not apply — it cannot be run standalone as a task.`);
    return;
  }
  const tells: string[] = [];
  if (/\b(for|while)\s/u.test(code)) tells.push("a loop");
  if (/\bgit\s+(?!rev-parse)[a-z-]+/u.test(code)) tells.push("git commands beyond rev-parse");
  if (tells.length > 0) {
    fail("HOOK-1", `.githooks/${entry} carries logic (${tells.join(", ")}). A hook is a thin ` +
      `wrapper; the body belongs in a \`hook:${entry}\` mise task. As written it is absent ` +
      `from \`mise tasks\`, unrunnable without git, and untestable.`);
  }
}

const GATE_HOOKS = ["pre-commit", "pre-push"];
const GATE_VERBS: Record<string, Set<string>> = {
  "pre-commit": new Set(["fmt:staged", "lint"]),
  "pre-push": new Set(["fmt:check", "lint", "test", "check"]),
};

function walkTaskDependencies(name: string, tasks: Map<string, Task>, reached: Set<string>): void {
  if (reached.has(name)) return;
  reached.add(name);
  for (const dependency of tasks.get(name)?.deps ?? [])
    walkTaskDependencies(dependency, tasks, reached);
}

function checkGateTask(hook: string, gateTask: Task, tasks: Map<string, Task>): void {
  const stdinGate = hook === "pre-push" && gateTask.raw;
  if (gateTask.hasRun && !stdinGate) {
    fail("HOOK-1", `\`hook:${hook}\` has a run body. A gate task is depends-only over contract ` +
      `verbs (e.g. \`depends = ["fmt:staged", "lint"]\`); a body is a second gate that drifts from them.`);
  }
  const allowed = GATE_VERBS[hook] ?? new Set<string>();
  const offVerb = gateTask.deps.filter((dependency) => !allowed.has(dependency));
  if (offVerb.length > 0) {
    fail("HOOK-1", `\`hook:${hook}\` depends on ${offVerb.map((dependency) => `\`${dependency}\``).join(", ")} — not one of ` +
      `its gate verbs (${[...allowed].map((verb) => `\`${verb}\``).join(", ")}). A repo-specific check goes in a ` +
      `\`lint:*\` subtask so \`mise run lint\` runs it too.`);
  }
  if (gateTask.deps.length === 0 && !gateTask.hasRun && !stdinGate)
    fail("HOOK-1", `\`hook:${hook}\` depends on nothing — the gate gates nothing.`);
  if (hook === "pre-commit" && !gateTask.deps.includes("fmt:staged")) {
    fail("HOOK-1c", "`hook:pre-commit` does not depend on `fmt:staged` — the commit gate must fix " +
      "the staged files in place (wiring-mise-tasks `fmt:staged`), not leave formatting to a " +
      "whole-tree check.");
  }
  const reached = new Set<string>();
  if (hook === "pre-commit") {
    for (const dependency of gateTask.deps) walkTaskDependencies(dependency, tasks, reached);
  }
  if (hook === "pre-commit" && reached.has("fmt:check")) {
    fail("HOOK-1c", "`hook:pre-commit` reaches `fmt:check`, which checks the WHOLE tree: in a " +
      "shared checkout any session's unstaged or untracked work refuses every session's commit. " +
      "`fmt:staged` already covers what is being committed; keep `fmt:check` in `check` and pre-push.");
  }
}

function checkGateRun(hook: string, run: MiseRun, expected: string, tasks: Map<string, Task>): void {
  const wrong = run.tasks.filter((task) => task !== expected);
  if (wrong.length > 0) {
    fail("HOOK-1", `.githooks/${hook} runs ${wrong.map((task) => `\`${task}\``).join(", ")}. A gate hook ` +
      `runs exactly \`${expected}\`, declared in mise.toml as depends-only over contract verbs, ` +
      `so mise.toml alone says what the gate does.`);
  }
  if (!tasks.has(expected)) fail("HOOK-1", `.githooks/${hook} has no \`${expected}\` in mise.toml to run.`);
  const swallowedTasks = run.swallowed.filter(
    (task) => tasks.has(task) || Object.values(GATE_VERBS).some((verbs) => verbs.has(task)),
  );
  if (swallowedTasks.length > 0) {
    fail("HOOK-3", `.githooks/${hook}: \`mise run ${run.tasks[0]} ${swallowedTasks.join(" ")}\` passes ` +
      `${swallowedTasks.join(", ")} as ARGUMENTS to ${run.tasks[0]} — they never run, and the hook ` +
      `exits 0. Separate tasks with \`:::\`.`);
  }
  if (!run.serial) {
    fail("HOOK-3", `.githooks/${hook} runs mise without \`--jobs 1\`. mise 2026.9.12's parallel ` +
      `scheduler hung 3 of 6 runs of a failing aggregate and ignored SIGTERM (measured 2026-09-22) — ` +
      `a red gate must refuse, not hang the commit.`);
  }
}

async function auditWiring(root: string, mise: string | undefined, settingsRaw: string | undefined): Promise<void> {
  const sources: string[] = [];
  for (const dir of [".claude/hooks", ".claude/tools", "scripts", ".githooks"]) {
    const abs = join(root, dir);
    for (const file of existsSync(abs) ? await readdir(abs) : [])
      sources.push((await readIf(join(abs, file))) ?? "");
  }
  const haystack = [settingsRaw ?? "", mise ?? "", ...sources].join("\n");
  for (const dir of [".claude/hooks", ".claude/tools"]) {
    const abs = join(root, dir);
    const inert = (existsSync(abs) ? await readdir(abs) : [])
      .filter((file) => file.endsWith(".ts"))
      .filter((file) => !haystack.includes(file));
    if (inert.length > 0) {
      fail("INERT", `${dir}/: ${inert.length} file(s) referenced by neither .claude/settings.json ` +
        `nor mise.toml — ${inert.slice(0, 6).join(", ")}${inert.length > 6 ? ", …" : ""}. ` +
        `Laid, never fires, never retired.`);
    }
  }
}

async function main(): Promise<void> {
  const argv = cli({
    name: "wiring-check",
    flags: {
      repo: { type: String, description: "repo root (default: cwd)", default: "." },
      audit: { type: Boolean, description: "also report laid-but-inert wiring (S1 backwards)", default: false },
    },
    parameters: [],
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
  });
  // Cleye leaves excess positionals in `_` rather than refusing them, and this command takes
  // none — a stray argument means the caller expected a different interface (BG1).
  if (argv._.length > 0) {
    process.stderr.write(`unexpected argument: ${argv._[0]} (this command takes no positionals)\n`);
    process.exit(2);
  }
  const root = resolve(argv.flags.repo);
  if (!existsSync(join(root, ".git"))) {
    process.stderr.write(`FATAL: ${root} is not a git repository\n`);
    process.exit(2);
  }

  const mise = await readIf(join(root, "mise.toml"));
  if (mise !== undefined) parseWaivers(mise);
  const tasks = mise === undefined ? new Map<string, Task>() : miseTasks(mise);
  const settingsRaw = await readIf(join(root, ".claude/settings.json"));

  // ORDER-1 — pins before task bodies that run a toolchain.
  if (mise !== undefined) {
    const hasTools = /^\s*\[tools\]/mu.test(mise);
    const runners = ["julia", "cargo", "uv", "bun", "python", "rustc", "node"];
    const used = [...new Set(runners.filter((r) =>
      [...tasks.values()].some((t) => new RegExp(`(^|[\\s"'|=])${r}\\b`, "u").test(t.run))))];
    if (!hasTools && used.length > 0) {
      fail("ORDER-1", `mise.toml has no [tools] section, but task bodies run: ${used.join(", ")}. ` +
        `These resolve against ambient PATH — green here, different on another machine.`);
    }
  }

  // ---------------------------------------------------------------- `mise run` call sites
//
// Parsed, not pattern-matched. The first cut read `mise run --jobs 1 lint` as a call to a task
// named `--jobs` (found 2026-09-22 when the gate shim gained `--jobs 1`), and `mise run a b` as a
// call to both — but mise passes `b` as an ARGUMENT to `a` and never runs it. Only `:::` starts a
// second task. Getting that wrong is the difference between a gate and a gate-shaped no-op.
const RUN_FLAGS_WITH_VALUE = new Set(["-j", "--jobs", "-C", "--cd", "-E", "--env", "-o", "--output"]);

function miseRuns(body: string): MiseRun[] {
  const out: MiseRun[] = [];
  for (const m of body.matchAll(/mise\s+run\b([^\n]*)/gu)) {
    const toks = (m[1] ?? "").trim().split(/\s+/u).filter((t) => t !== "");
    const taskNames: string[] = [];
    const swallowed: string[] = [];
    let serial = false;
    let expectTask = true;
    let skipNext = false;
    let stopped = false;
    toks.forEach((t, index) => {
      if (stopped) return;
      if (skipNext) { skipNext = false; return; }
      if (t === ":::") {
        expectTask = true;
        return;
      }
      const option = t.startsWith("-");
      if (option && /^(-j|--jobs)(=1)?$/u.test(t) && (t.endsWith("=1") || toks[index + 1] === "1")) serial = true;
      if (option && RUN_FLAGS_WITH_VALUE.has(t)) skipNext = true;
      if (option) return;
      if (/^[;&|)]/u.test(t)) { stopped = true; return; }
      if (expectTask) {
        taskNames.push(t);
        expectTask = false;
      } else {
        swallowed.push(t);
      }
    });
    if (taskNames.length > 0) out.push({ tasks: taskNames, swallowed, serial });
  }
  return out;
}

// ORDER-2 — the task AND the script it runs must exist before anything binds to them.
  const hooksDir = join(root, ".githooks");
  for (const entry of existsSync(hooksDir) ? await readdir(hooksDir) : []) {
      const raw = (await readIf(join(hooksDir, entry))) ?? "";
      // A MENTION IS NOT A CALL. `echo "... run 'mise run f' manually"` names a task without
      // invoking it, and a hook's comment header names several. Reading either as a call site is
      // the failure this house has recorded three times over; this check reproduced it on its
      // first run against a third repo (proof-of-fire, 2026-08-30). Strip comments and quoted
      // spans before looking for call sites.
      const body = raw
        .split("\n")
        .map((l) => l.replace(/(^|\s)#.*$/u, "$1"))
        .join("\n")
        .replaceAll(/'[^'\n]*'|"[^"\n]*"/gu, " ");
      for (const task of miseRuns(body).flatMap((r) => r.tasks)) {
        checkHookTask(entry, task, root, tasks);
      }
  }

  // ORDER-3 — hooksPath must be set, and relative.
  const hooksPath = (await $`git -C ${root} config --get core.hooksPath`.nothrow().quiet().text()).trim();
  if (existsSync(hooksDir) && hooksPath === "") {
    fail("ORDER-3", `.githooks/ exists but core.hooksPath is unset — the hooks never run.`);
  }
  if (hooksPath !== "" && hooksPath.startsWith("/")) {
    fail("ORDER-3", `core.hooksPath is absolute (${hooksPath}) — it silently stops applying in any ` +
      `clone or worktree. Set it relative: \`git config core.hooksPath .githooks\`.`);
  }
  // resolve(), not join(): an absolute hooksPath must be tested as-is, or the two findings
  // compound into a false "does not exist" (caught by proof-of-fire, 2026-08-30).
  if (hooksPath !== "" && !existsSync(resolve(root, hooksPath))) {
    fail("ORDER-3", `core.hooksPath points at ${hooksPath}, which does not exist.`);
  }

  // HOOK-1 — a git hook is a THIN WRAPPER. The body belongs in a `hook:<name>` mise task.
  // Not style. Three consequences, each observed: a hook carrying logic is invisible to
  // `mise tasks`, cannot be run without git, and cannot be tested. The repos that follow it each
  // wrote the same reason independently; the one that does not is frozen at another repo's
  // superseded shape, having copied it once.
  for (const entry of existsSync(hooksDir) ? await readdir(hooksDir) : [])
    checkThinHook(entry, (await readIf(join(hooksDir, entry))) ?? "");

  // HOOK-1 (gate hooks) — pre-commit / pre-push exec `hook:<event>`, which mise.toml declares as
  // depends-only over CONTRACT VERBS. A gate with a body — in the task or in the shim — drifts
  // from the verbs it stands in for. Measured 2026-09-22 in dotfiles: `hook:pre-commit` formatted but
  // never linted, so five lint failures reached the integration branch in one day while
  // `mise run lint` would have refused each; it also re-`git add`-ed whole files after formatting,
  // sweeping the unstaged hunks of partially staged files into the commit. The verbs are the
  // wiring-mise-tasks contract, already resolved in every repo by its mise-contract gate.
  // (Supersedes HOOK-2's language-filter check: a filter only exists inside a bespoke body.)
  // HOOK-1c: the commit gate judges only what is being committed. `fmt:staged` fixes the staged
  // files in place (refusing any that also carry unstaged hunks); a whole-tree `fmt:check` there
  // refused every session's commit on any session's WIP — firedancer 2026-09-25, four blocks
  // across ~20 sessions, 10–20 min each. Whole-tree gates stay in `check` and pre-push.
  for (const hook of GATE_HOOKS) {
    // The gate is DECLARED in mise.toml as `hook:<event>` so one file answers "what runs at commit"
    // — and it is depends-only over contract verbs, so it cannot drift from them. A `run` body is
    // exactly what broke dotfiles on 2026-09-22 (formatted, re-staged, never linted).
    const gateTask = tasks.get(`hook:${hook}`);
    if (gateTask !== undefined) checkGateTask(hook, gateTask, tasks);
    const raw = existsSync(hooksDir) ? await readIf(join(hooksDir, hook)) : undefined;
    if (raw === undefined) continue;
    const code = raw
      .split("\n")
      .map((l) => l.replace(/(^|\s)#.*$/u, "$1"))
      .join("\n")
      .replaceAll(/'[^'\n]*'|"[^"\n]*"/gu, " ");
    // Everything the gate EXECUTES must be `mise run <verbs>`, or the shim's own plumbing (the
    // `command -v mise` guard, echo, exit). A direct `polysearch hook pre-commit` or
    // `soks-govern … author-check` is the same disease as a hook:* task: `mise run check` does not
    // run it, so the manual gate and the commit gate differ. Put it in a `lint:*` subtask.
    const PLUMBING = new Set(["mise", "command", "echo", "printf", "exit", "true", ":", "{", "}", "set"]);
    const SHELL = /^(if|then|else|elif|fi|for|while|do|done|case|esac|\[|\[\[|\]|\)|\(|!)$/u;
    const foreign = new Set<string>();
    const foreignHeads = code.split(/\n|&&|\|\||;/u)
      .map((stmt) => stmt.trim().replace(/^exec\s+/u, "").split(/\s+/u)[0] ?? "")
      .filter((head) => head !== "" && !PLUMBING.has(head) && !SHELL.test(head) && !/^[A-Za-z_]\w*=/u.test(head));
    for (const head of foreignHeads) foreign.add(head);
    if (foreign.size > 0) {
      fail("HOOK-1", `.githooks/${hook} executes ${[...foreign].map((c) => `\`${c}\``).join(", ")} ` +
        `directly. \`mise run check\` never runs that, so the commit gate and the manual gate differ. ` +
        `Move it into a \`lint:*\` (or \`check\`-reached) task and have the hook call the verbs.`);
    }
    const runs = miseRuns(code);
    if (runs.length === 0 && foreign.size === 0) {
      notes.push(`.githooks/${hook} executes nothing — it is bound but gates nothing.`);
    }
    for (const run of runs) checkGateRun(hook, run, `hook:${hook}`, tasks);
  }

  // S1, surfaced not enforced: gates defined but not bound to commit.
  // NOT a FAIL. A repo may deliberately keep its gates on-demand — formatting on every commit is
  // noisy in some repos, and prescribing a pre-commit here would be exactly the generous
  // scaffolding S1 exists to prevent. But "we never decided" and "we decided against" are
  // indistinguishable from the outside, and S1 says name which. So it is reported.
  if (existsSync(hooksDir)) {
    const bound = (await readdir(hooksDir)).includes("pre-commit");
    const gates = ["check", "lint", "fmt", "test"].filter((t) => tasks.has(t));
    if (!bound && gates.length > 0) {
      notes.push(`No pre-commit hook is bound, yet mise defines ${gates.join(", ")}. ` +
        `Those gates run only when someone remembers. If that is deliberate, say so where the ` +
        `layer was admitted; if it is an omission, this is the failure the layer prevents.`);
    }
  }

  // ORDER-4/5 — the index layer's two silent consequences.
  const cccSettings = await readIf(join(root, ".cocoindex_code/settings.yml"));
  if (cccSettings !== undefined) {
    if (/^\s*-\s*['"]?\*\*\/\.\*/mu.test(cccSettings)) {
      fail("ORDER-4", `.cocoindex_code/settings.yml excludes '**/.*' — every dotfile directory, ` +
        `.claude/ included, is invisible to semantic search. Searches answer NO_MATCH, which reads ` +
        `as absent. Decide this before registering; it shapes the index thereafter.`);
    }
    // The corpus policy and the index have OPPOSITE fates, and a blanket ignore gets one wrong.
    // settings.yml IS scaffold — it decides what the index can ever see — so it belongs in git.
    // Everything else under .cocoindex_code/ is a per-clone daemon artifact. The pattern that
    // separates them (measured in this house): `/.cocoindex_code/*` + `!/.cocoindex_code/settings.yml`.
    const tracked = async (p: string): Promise<boolean> =>
      (await $`git -C ${root} ls-files --error-unmatch -- ${p}`.nothrow().quiet()).exitCode === 0;
    if (!(await tracked(".cocoindex_code/settings.yml"))) {
      fail("ORDER-5", `.cocoindex_code/settings.yml is not tracked. The corpus policy decides what ` +
        `the index can ever see — it is scaffold, not a local artifact. Version it and ignore the ` +
        `rest: \`/.cocoindex_code/*\` + \`!/.cocoindex_code/settings.yml\`.`);
    }
    if (await tracked(".cocoindex_code/target_sqlite.db")) {
      fail("ORDER-5", `.cocoindex_code/target_sqlite.db is tracked — the local index is being committed.`);
    }
    notes.push(`The index itself is a per-clone artifact: a fresh clone is NOT searchable until ` +
      `whoever clones it registers the repo themselves. Say so when handing the repo over.`);
  }

  // JJ-2 — a colocated jj repo denies git to agents. jj runs no git hooks, and the commit gate is
  // `mise run commit` (JJ-1, verbs checked by mise-contract); an agent that can run `git commit`
  // writes history around that gate and around jj's bookmark, and nothing reports it.
  if (existsSync(join(root, ".jj"))) {
    const denied = ["Bash(git:*)", "Bash(command git:*)", "Bash(env git:*)"];
    const noRules: unknown[] = [];
    const parsedRules = jsonOf(DenyRulesSchema).safeParse(settingsRaw ?? "{}");
    const deny = parsedRules.success ? parsedRules.data.permissions.deny : noRules;
    const missing = denied.filter((rule) => !deny.includes(rule));
    if (missing.length > 0) {
      fail("JJ-2", `.jj/ exists but .claude/settings.json does not deny ${missing.join(", ")} — an ` +
        `agent's \`git commit\` bypasses the \`mise run commit\` gate and the jj bookmark, silently.`);
    }
  }

  // JOINT — a repo-local hook file must be registered somewhere.
  if (settingsRaw !== undefined && !jsonText.safeParse(settingsRaw).success)
    fail("JOINT", `.claude/settings.json is not valid JSON — the whole repo-local hook set is inert.`);

  if (argv.flags.audit) {
    await auditWiring(root, mise, settingsRaw);
  }

  for (const n of notes) process.stdout.write(`NOTE  ${n}\n`);
  for (const f of findings) process.stdout.write(`FAIL  [${f.tag}] ${f.msg}\n`);
  if (findings.length === 0) {
    process.stdout.write(`OK    wiring joint coherent${argv.flags.audit ? " (incl. inert audit)" : ""}\n`);
    process.stdout.write(`      This floor proves no INCOHERENCE. It does not prove any layer belongs here (S1).\n`);
  }
  process.exit(findings.length === 0 ? 0 : 1);
}

await main().catch((e: unknown) => {
  process.stderr.write(`FATAL: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(2);
});
