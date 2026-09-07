// Pure logic shared by assign-command.ts (the UserPromptSubmit hook implementing
// `/assign <role>`). No stdin/stdout/CLI here — that file owns the hook contract.
//
// Role CONTENT (the charter text a role gets as additionalContext) is loaded by
// loadFleetPolicy() below, not held here: which roles exist and what a role announces on
// arrival is fleet-charter content (commanding-research-fleets's references/charters.md) —
// this module is the wire, not the charter. An unlisted role still works, it just gets
// renamed with no extra context.
//
// SOURCE (2026-09-07 ruling, replacing the retired agents/claude/hooks/assign-roles.toml):
// a `fleet_policy.toml` at the PROJECT ROOT wins when the project defines one; otherwise the
// skill-shipped default at agents/skills/commanding-research-fleets/fleet_policy.toml applies.
// There is no third fallback — assign-roles.toml is gone, not layered underneath.

import { basename, dirname, join } from "node:path";
import { realpathSync } from "node:fs";

// Lowercase letters/digits, starting with a letter, capped at 12: generous enough for every
// role token seen live so far (obs, dtr, pi, gpu, ...) without accepting something that would
// make an ugly session name.
const ROLE_RE = /^[a-z][a-z0-9]{0,11}$/;

export function isValidRole(role: string): boolean {
  return ROLE_RE.test(role);
}

// Crockford base32, lowercase, no i/l/o/u — the exact alphabet the plain `claude()` wrapper
// (zsh/aliases.zsh) uses, so an assigned name and a plain-wrapper name read as the same species
// of suffix.
const SUFFIX_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

export function randomSuffix(
  len = 4,
  rand: () => number = Math.random,
): string {
  let suffix = "";
  for (let i = 0; i < len; i++) {
    suffix += SUFFIX_ALPHABET[Math.floor(rand() * SUFFIX_ALPHABET.length)];
  }
  return suffix;
}

// Project segment is snake_case (`-` -> `_`), not just lowercased: a hyphenated dir like
// "agentic-RnD" would otherwise produce "agentic-rnd-obs_a1b2" — a second hyphen sitting right
// next to the project/role separator (caught live 2026-09-02 via the plain `claude()` wrapper's
// own "agentic-rnd-agt_bvxj" — same fix applied there in zsh/aliases.zsh). Keeping the ONE
// hyphen unambiguous as "where the project ends" is the point, not cosmetic preference.
export function sessionName(cwd: string, role: string, suffix: string): string {
  const project = basename(cwd).toLowerCase().replace(/-/g, "_");
  return `${project}-${role}_${suffix}`;
}

export interface RoleConfig {
  prompt?: string;
}

// Path to the skill-shipped default, resolved relative to THIS module's own real location
// rather than a hardcoded absolute path — so it works both run in-repo (as the test suite
// does) and once deployed as a symlink at ~/.claude/hooks/assign-lib.ts (realpathSync
// follows the symlink chain back to the dotfiles repo either way; measured live: Bun already
// resolves import.meta.path to the real file when a module is loaded through a symlink, but
// realpathSync is kept explicit rather than relying on that as an implementation detail).
// Repo shape: agents/claude/hooks/assign-lib.ts -> agents/claude/hooks -> agents/claude ->
// agents -> agents/skills/commanding-research-fleets/fleet_policy.toml.
function defaultPolicyPath(): string {
  const here = realpathSync(import.meta.path);
  const agentsDir = dirname(dirname(dirname(here)));
  return join(
    agentsDir,
    "skills",
    "commanding-research-fleets",
    "fleet_policy.toml",
  );
}

// Dynamic `import()` of a .toml path: Bun's built-in TOML loader applies to dynamic imports
// the same as static ones (no npm dependency needed — see the house zero-dep-hooks rule).
// Returns null when the file is missing, unreadable, or fails to parse — callers decide the
// fallback; this function never throws.
async function readPolicyFile(
  path: string,
): Promise<Record<string, RoleConfig> | null> {
  try {
    const mod = await import(path);
    const table = (mod as { default?: unknown }).default ?? mod;
    return table as Record<string, RoleConfig>;
  } catch {
    return null;
  }
}

// Resolution order: a `fleet_policy.toml` at the PROJECT ROOT (cwd) wins when the project
// defines one; otherwise the skill-shipped default applies. Never falls back further (the
// retired assign-roles.toml is not a third source) — an unreadable/absent default just means
// no roles are configured, matching the pre-migration "unlisted role" behavior.
export async function loadFleetPolicy(
  cwd: string,
): Promise<Record<string, RoleConfig>> {
  const projectPolicy = await readPolicyFile(join(cwd, "fleet_policy.toml"));
  if (projectPolicy) return projectPolicy;

  const shippedDefault = await readPolicyFile(defaultPolicyPath());
  return shippedDefault ?? {};
}

export function rolePrompt(
  role: string,
  config: Record<string, RoleConfig>,
): string | null {
  const prompt = config[role]?.prompt;
  return typeof prompt === "string" && prompt.trim() !== "" ? prompt : null;
}
