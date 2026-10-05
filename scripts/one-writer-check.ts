// `mise run lint:one-writer` — INV-8 (README → Design): data flows one way, declaration → render →
// deployed → runtime, and every file has ONE writer. This fails when a hand-written declaration
// carries content that a renderer owns, i.e. when a file has become the output of two writers:
//   - a hook command run through ~/.agents/hooks/run.sh inside a committed vendor file
//     (agents/claude/settings.json, agents/codex/hooks.json) — agents/hooks/hooks.toml owns those,
//     and scripts/render-home.ts wires them into the DEPLOYED copy;
//   - anything but the markers and their comment inside agents/claude/CLAUDE.md's roster block —
//     agents/models/dispatch-roster.toml owns it, rendered into the deployed ~/.claude/CLAUDE.md;
//   - a symlink in $HOME at a path render-home.ts writes (the old layout: the deployed file then
//     IS the declaration, and a tool writing it writes the repo).
// Consumer: `mise run lint` and scripts/tests/hook-registry.test.ts. Verdict lines; every
// violation is reported, not the first. Exit: 0 one writer each · 1 a violation · 2 FATAL.
// Zero-dep like render-home.ts; no argv, so no Cleye boundary (writing-bun-scripts BG1).
// Inputs: DOTFILES (default: this checkout), HOME (default: os.homedir()).

import { existsSync, lstatSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";
import { jsonOf, z } from "../agents/hooks/zod.ts";
import { RENDERED } from "./config-registry.ts";
import { HooksConfigSchema, owned } from "./hook-registry.ts";

const root = process.env.DOTFILES ?? join(import.meta.dir, "..");
const home = process.env.HOME ?? homedir();
const violations: string[] = [];

const VendorFile = z.looseObject({
  hooks: HooksConfigSchema.optional(),
});

for (const rel of ["agents/claude/settings.json", "agents/codex/hooks.json"]) {
  const read = await attempt(() => readFileSync(join(root, rel), "utf8"));
  const config = read.ok ? jsonOf(VendorFile).safeParse(read.value) : undefined;
  if (config?.success !== true) {
    process.stderr.write(
      `FATAL: ${rel}: ${read.ok ? (config?.error.message ?? "") : errorMessage(read.error)}\n`,
    );
    process.exit(2);
  }
  violations.push(
    ...Object.entries(config.data.hooks ?? {}).flatMap(([event, groups]) =>
      groups
        .flatMap((g) => g.hooks)
        .filter((h) => owned(h))
        .map(
          (h) =>
            `${rel}: ${event} runs ${JSON.stringify(h.command)} — agents/hooks/hooks.toml owns it; delete it here`,
        ),
    ),
  );
}

const BEGIN = "<!-- roster:begin -->";
const END = "<!-- roster:end -->";
const md = readFileSync(join(root, "agents/claude/CLAUDE.md"), "utf8");
const b = md.indexOf(BEGIN);
const e = md.indexOf(END);
if (b < 0 || e < b) {
  violations.push(
    `agents/claude/CLAUDE.md: markers ${BEGIN} … ${END} missing — render-home.ts has nowhere to put the roster`,
  );
} else {
  const inside = md
    .slice(b + BEGIN.length, e)
    .split("\n")
    .filter((l) => l.trim() !== "" && !/^<!--.*-->$/u.test(l.trim()));
  if (inside.length > 0)
    violations.push(
      `agents/claude/CLAUDE.md: ${inside.length} line(s) inside the roster block — dispatch-roster.toml owns it; leave only the markers`,
    );
}

for (const rel of RENDERED.map((r) => r.dest)) {
  const p = join(home, rel);
  if (existsSync(p) && lstatSync(p).isSymbolicLink())
    violations.push(
      `~/${rel}: a symlink — render-home.ts writes this file; run mise run link:dots`,
    );
}

for (const v of violations) process.stdout.write(`two writers: ${v}\n`);
if (violations.length === 0)
  process.stdout.write("one writer: every checked file has exactly one\n");
process.exit(violations.length > 0 ? 1 : 0);
