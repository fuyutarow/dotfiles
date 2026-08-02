// scope-check.ts — mechanical floor for P3 (scope) in operating-the-harness.
// Run: bun scope-check.ts [<user-scope-root>]      default root: $HOME/.claude
// Consumer: agent/human (verdict lines). Exit 0 clean / 1 findings / 2 environment-FATAL.
//
// THIS IS NOT A SEMANTIC CHECK. It answers exactly one greppable question: does a file at
// USER scope hardcode an absolute path that points OUTSIDE user scope? That is the machine
// half of P3 — a rule naming one repo, registered globally.
//
// What it CANNOT catch, and what judgment still owns:
//   - a repo-specific rule that names its repo by something other than a path (a project
//     name in prose, an env var, a canon filename). P3 still forbids it; only a human or a
//     semantic pass sees it.
//   - the reverse error — a cross-project rule buried in ONE repo's .claude/, so every other
//     repo silently lacks it.
//   - whether a user-scope rule that IS legitimately global is worth its per-event cost.
//     §5 item 8 owns that budget question; this script never prices anything.
//
// Scope of the walk is deliberately narrow — `settings*.json` plus `hooks/` — so the check
// never wanders into `~/.claude/skills` (a symlink farm into the dotfiles repo) and never
// scans itself.

import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
// Bare specifier, not pinned inline: this tree is NOT zero-dep. It is symlinked (never
// mirrored/copied) into ~/.claude/skills by `mise run link:skills`, so the repo-root graduation
// project (package.json + bun.lock) governs it — Bun resolves through the symlink to this
// file's realpath and finds that root from any cwd (BG3).
import { cli } from "cleye";

const HOME = homedir();

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new Error(`unknown option '--${flag}'`);
  }
}

// An absolute path literal under the user's home directory. `~/…` and `$HOME/…` forms are
// deliberately NOT matched: they are portable and are the spelling P3 asks for.
const HOME_ABS = new RegExp(`(?:/Users|/home)/[^/\\s"']+/[^\\s"'\`)\\]}]+`, "g");

type Finding = { file: string; line: number; path: string };

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

// Files whose realpath lands inside the user-scope root are that root's OWN plumbing —
// `~/.claude` is commonly a symlink into a dotfiles repo, so its realpath is legitimate.
async function allowedPrefixes(root: string): Promise<string[]> {
  const prefixes = [root];
  try {
    const { realpath } = await import("node:fs/promises");
    prefixes.push(await realpath(root));
    for (const sub of ["hooks", "settings.json"]) {
      const p = join(root, sub);
      if (await exists(p)) prefixes.push(await realpath(p));
    }
  } catch {
    // realpath failure is not fatal: fall back to the literal root only.
  }
  return prefixes;
}

async function collect(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const name of ["settings.json", "settings.local.json"]) {
    const p = join(root, name);
    if (await exists(p)) files.push(p);
  }
  const hooks = join(root, "hooks");
  if (await exists(hooks)) {
    for (const entry of await readdir(hooks, { withFileTypes: true })) {
      if (entry.isDirectory()) continue;
      if (/\.(ts|js|sh|mjs)$/.test(entry.name)) files.push(join(hooks, entry.name));
    }
  }
  return files;
}

async function scan(file: string, allowed: string[]): Promise<Finding[]> {
  const findings: Finding[] = [];
  const lines = (await readFile(file, "utf8")).split("\n");
  lines.forEach((line, index) => {
    // A line that is purely a comment about the rule is still a hit: the postmortem's three
    // hooks named the repo in a header comment AND in code. Deliberate — no comment carve-out.
    for (const hit of line.match(HOME_ABS) ?? []) {
      if (!hit.startsWith(`${HOME}/`)) continue;
      if (allowed.some((prefix) => hit === prefix || hit.startsWith(`${prefix}/`))) continue;
      findings.push({ file, line: index + 1, path: hit });
    }
  });
  return findings;
}

async function main(): Promise<number> {
  const parsed = cli(
    {
      name: "scope-check.ts",
      parameters: ["[user-scope-root]"],
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length > 1) {
    throw new Error(`unexpected argument '${parsed._[1]}'`);
  }
  const root = resolve(parsed._[0] ?? join(HOME, ".claude"));
  if (!(await exists(root))) {
    process.stderr.write(`FATAL: user-scope root not found: ${root}\n`);
    return 2;
  }

  const allowed = await allowedPrefixes(root);
  const files = await collect(root);
  if (files.length === 0) {
    process.stdout.write(`RESULT: no user-scope settings or hooks under ${root}\n`);
    return 0;
  }

  const findings = (await Promise.all(files.map((f) => scan(f, allowed)))).flat();
  if (findings.length === 0) {
    process.stdout.write(
      `P3 PASS: ${files.length} user-scope file(s), no out-of-scope absolute path\n`,
    );
    return 0;
  }

  for (const f of findings) {
    process.stdout.write(
      `FAIL P3 ${f.file}:${f.line}: user-scope file hardcodes ${f.path} — ` +
        `a rule naming ONE repo belongs in that repo's .claude/, not here\n`,
    );
  }
  process.stdout.write(
    `RESULT: ${findings.length} P3 violation(s) across ${files.length} user-scope file(s)\n`,
  );
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    process.stderr.write(`FATAL: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  });
