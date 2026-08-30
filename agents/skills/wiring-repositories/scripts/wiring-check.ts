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
  for (const m of mise.matchAll(/^\s*#\s*wiring-check:\s*waive\s+(\S+)\s+--\s+(.+)$/gm)) {
    if (m[1] !== undefined && m[2] !== undefined) waived.set(m[1], m[2].trim());
  }
}

type Task = { readonly run: string; readonly alias: string[] };

/**
 * Top-level `[tasks.x]` / `[tasks."x:y"]` headers, with their RUN bodies isolated.
 *
 * Two things this must get right, both learned by being wrong (proof-of-fire, 2026-08-30):
 *
 * 1. **A `'''` run body can contain a line starting with `[`** — `[ -z "$files" ] && …` is
 *    ordinary shell. Reading that as a TOML section header silently truncates the parse, and
 *    every task after it disappears. The symptom is not an error; it is a check that quietly
 *    stops looking. So multi-line string state is tracked.
 * 2. **`description` is prose, not a call site.** A description naming `link-dots.sh` is not a
 *    task invoking it. Only the `run` value feeds path and toolchain detection.
 */
function miseTasks(src: string): Map<string, Task> {
  const out = new Map<string, Task>();
  let name: string | undefined;
  let run: string[] = [];
  let alias: string[] = [];
  let multi: string | undefined; // the ''' or """ currently open
  let inRun = false;

  const flush = (): void => {
    if (name !== undefined) out.set(name, { run: run.join("\n"), alias });
    run = [];
    alias = [];
    inRun = false;
  };

  for (const line of src.split("\n")) {
    if (multi !== undefined) {
      if (inRun) run.push(line);
      if (line.includes(multi)) {
        multi = undefined;
        inRun = false;
      }
      continue;
    }
    const header = /^\s*\[tasks\.(?:"([^"]+)"|([\w:.-]+))\]/.exec(line);
    if (header !== null) {
      flush();
      name = header[1] ?? header[2];
      continue;
    }
    if (/^\s*\[/.test(line)) {
      flush();
      name = undefined;
      continue;
    }
    if (name === undefined) continue;

    const kv = /^\s*(run|depends|alias)\s*=\s*(.*)$/.exec(line);
    if (kv !== null) {
      const key = kv[1];
      const rest = kv[2] ?? "";
      const open = /^('''|""")/.exec(rest);
      if (open !== null) {
        multi = open[1];
        inRun = key === "run";
        continue;
      }
      if (key === "alias") {
        for (const a of rest.matchAll(/["']([^"']+)["']/g)) {
          if (a[1] !== undefined) alias.push(a[1]);
        }
      } else {
        run.push(rest);
      }
      continue;
    }
    // continuation lines of a multi-line `depends = [` array
    if (/^\s*["']/.test(line)) run.push(line);
  }
  flush();

  // Aliases are call sites too: `mise run f` resolves via `alias = "f"` on the fmt task.
  for (const [, task] of [...out]) {
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
  return [...body.matchAll(/[\w./${}-]*[\w-]\.(?:ts|js|sh|jl|py|rs|toml|json)\b/g)]
    .map((m) => m[0]
      .replace(/\{\{\s*config_root\s*\}\}/g, root)
      .replace(/\$\{HOME\}|\$HOME/g, home))
    .filter((p) => !p.startsWith("http") && !/[${}]/.test(p));
}

/** undefined for a missing path OR a directory — readdir hands back both (proof-of-fire, 2026-08-30). */
async function readIf(path: string): Promise<string | undefined> {
  if (!existsSync(path) || !statSync(path).isFile()) return undefined;
  return await readFile(path, "utf8");
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
    const hasTools = /^\s*\[tools\]/m.test(mise);
    const runners = ["julia", "cargo", "uv", "bun", "python", "rustc", "node"];
    const used = [...new Set(runners.filter((r) =>
      [...tasks.values()].some((t) => new RegExp(`(^|[\\s"'|=])${r}\\b`).test(t.run))))];
    if (!hasTools && used.length > 0) {
      fail("ORDER-1", `mise.toml has no [tools] section, but task bodies run: ${used.join(", ")}. ` +
        `These resolve against ambient PATH — green here, different on another machine.`);
    }
  }

  // ORDER-2 — the task AND the script it runs must exist before anything binds to them.
  const hooksDir = join(root, ".githooks");
  if (existsSync(hooksDir)) {
    for (const entry of await readdir(hooksDir)) {
      const raw = (await readIf(join(hooksDir, entry))) ?? "";
      // A MENTION IS NOT A CALL. `echo "... run 'mise run f' manually"` names a task without
      // invoking it, and a hook's comment header names several. Reading either as a call site is
      // the failure this house has recorded three times over; this check reproduced it on its
      // first run against a third repo (proof-of-fire, 2026-08-30). Strip comments and quoted
      // spans before looking for call sites.
      const body = raw
        .split("\n")
        .map((l) => l.replace(/(^|\s)#.*$/, "$1"))
        .join("\n")
        .replace(/'[^'\n]*'|"[^"\n]*"/g, " ");
      for (const m of body.matchAll(/mise\s+run\s+([\w:.-]+)/g)) {
        const task = m[1];
        if (task === undefined) continue;
        if (!tasks.has(task)) {
          fail("ORDER-2", `.githooks/${entry} calls \`mise run ${task}\`, which mise.toml does not define. ` +
            `git reports nothing — commits pass ungated.`);
          continue;
        }
        for (const p of pathTokens(tasks.get(task)?.run ?? "", root)) {
          if (!existsSync(resolve(root, p))) {
            fail("ORDER-2", `.githooks/${entry} -> \`mise run ${task}\` -> missing file \`${p}\`. ` +
              `The chain resolves until the last link; nothing reports the break.`);
          }
        }
      }
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
  if (existsSync(hooksDir)) {
    for (const entry of await readdir(hooksDir)) {
      const raw = (await readIf(join(hooksDir, entry))) ?? "";
      if (raw === "") continue;
      const code = raw
        .split("\n")
        .map((l) => l.replace(/(^|\s)#.*$/, "$1"))
        .join("\n")
        .replace(/'[^'\n]*'|"[^"\n]*"/g, " ");
      // A hook that consumes git's positional arguments is EXEMPT. The rule's whole reason is
      // "runnable standalone as a task", and a body branching on $1/$2/$3 cannot be: those
      // values only exist because git invoked it. Narrowing the rule at its actual limit beats
      // reporting a defect whose fix would be worse than the finding.
      // Tested on the comment-stripped RAW body, not the quote-stripped one: `[ "$3" = "1" ]`
      // hides its positional inside quotes, and stripping quotes first erases the exemption's
      // own evidence (caught by proof-of-fire, 2026-08-30).
      const args = raw.split("\n").map((l) => l.replace(/(^|\s)#.*$/, "$1")).join("\n");
      if (/\$[123@*]|\$\{[123@*]/.test(args)) {
        notes.push(`.githooks/${entry} reads git's hook arguments, so the thin-wrapper rule does ` +
          `not apply — it cannot be run standalone as a task.`);
        continue;
      }
      const tells: string[] = [];
      if (/\b(for|while)\s/.test(code)) tells.push("a loop");
      if (/\bgit\s+(?!rev-parse)[a-z-]+/.test(code)) tells.push("git commands beyond rev-parse");
      if (tells.length > 0) {
        fail("HOOK-1", `.githooks/${entry} carries logic (${tells.join(", ")}). A hook is a thin ` +
          `wrapper; the body belongs in a \`hook:${entry}\` mise task. As written it is absent ` +
          `from \`mise tasks\`, unrunnable without git, and untestable.`);
      }
    }
  }

  // HOOK-2 — the commit filter must cover every language the repo declares.
  // A filter is an allowlist, so a language added later is silently uncovered. Nothing reports it.
  const langs = new Map<string, string>();
  const manifest = async (dir: string): Promise<void> => {
    for (const [file, ext] of [["Project.toml", "jl"], ["Cargo.toml", "rs"],
      ["pyproject.toml", "py"], ["ruff.toml", "py"], ["package.json", "ts"],
      ["tex-fmt.toml", "tex"]] as const) {
      if (existsSync(join(dir, file))) langs.set(ext, file);
    }
  };
  await manifest(root);
  for (const e of await readdir(root, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") {
      await manifest(join(root, e.name));
    }
  }
  if (langs.size > 0) {
    const filterSrc = [
      ...(await Promise.all((existsSync(hooksDir) ? await readdir(hooksDir) : [])
        .map((e) => readIf(join(hooksDir, e))))),
      tasks.get("hook:pre-commit")?.run ?? "",
    ].join("\n");
    const alt = /\\?\.\\?\(([a-z0-9|]+)\\?\)\$?/.exec(filterSrc);
    if (alt?.[1] !== undefined) {
      const covered = new Set(alt[1].split("|"));
      const missing = [...langs].filter(([ext]) => !covered.has(ext));
      if (missing.length > 0) {
        fail("HOOK-2", `the commit filter (${alt[1]}) does not cover ` +
          `${missing.map(([e, f]) => `.${e} (declared by ${f})`).join(", ")}. ` +
          `Those files are staged and committed without ever reaching the formatter.`);
      }
    }
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
    if (/^\s*-\s*['"]?\*\*\/\.\*/m.test(cccSettings)) {
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

  // JOINT — a repo-local hook file must be registered somewhere.
  if (settingsRaw !== undefined) {
    try {
      JSON.parse(settingsRaw) as unknown;
    } catch {
      fail("JOINT", `.claude/settings.json is not valid JSON — the whole repo-local hook set is inert.`);
    }
  }

  if (argv.flags.audit) {
    // The haystack must include SIBLING SOURCE, not just the two registries: a shared helper is
    // referenced by the hooks that import it, never by settings.json. Without this the audit
    // reports every lib.ts as inert (caught by proof-of-fire, 2026-08-30).
    const sources: string[] = [];
    for (const dir of [".claude/hooks", ".claude/tools", "scripts", ".githooks"]) {
      const abs = join(root, dir);
      if (!existsSync(abs)) continue;
      for (const f of await readdir(abs)) sources.push((await readIf(join(abs, f))) ?? "");
    }
    const haystack = [settingsRaw ?? "", mise ?? "", ...sources].join("\n");
    for (const dir of [".claude/hooks", ".claude/tools"]) {
      const abs = join(root, dir);
      if (!existsSync(abs)) continue;
      const inert = (await readdir(abs))
        .filter((f) => f.endsWith(".ts"))
        .filter((f) => !haystack.includes(f));
      if (inert.length > 0) {
        fail("INERT", `${dir}/: ${inert.length} file(s) referenced by neither .claude/settings.json ` +
          `nor mise.toml — ${inert.slice(0, 6).join(", ")}${inert.length > 6 ? ", …" : ""}. ` +
          `Laid, never fires, never retired.`);
      }
    }
  }

  for (const n of notes) process.stdout.write(`NOTE  ${n}\n`);
  for (const f of findings) process.stdout.write(`FAIL  [${f.tag}] ${f.msg}\n`);
  if (findings.length === 0) {
    process.stdout.write(`OK    wiring joint coherent${argv.flags.audit ? " (incl. inert audit)" : ""}\n`);
    process.stdout.write(`      This floor proves no INCOHERENCE. It does not prove any layer belongs here (S1).\n`);
  }
  process.exit(findings.length === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  process.stderr.write(`FATAL: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(2);
});
