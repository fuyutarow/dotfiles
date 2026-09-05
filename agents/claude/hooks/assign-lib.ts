// Pure logic shared by assign-command.ts (the UserPromptSubmit hook implementing
// `/assign <role>`). No stdin/stdout/CLI here — that file owns the hook contract.
//
// Role CONTENT (the charter text a role gets as additionalContext) lives in ./assign-roles.toml,
// not here: which roles exist and what a role announces on arrival is fleet-charter content
// (commanding-research-fleets's references/charters.md) — this module is the wire, not the
// charter. An unlisted role still works, it just gets renamed with no extra context.

import { basename } from "node:path";

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

export function rolePrompt(
  role: string,
  config: Record<string, RoleConfig>,
): string | null {
  const prompt = config[role]?.prompt;
  return typeof prompt === "string" && prompt.trim() !== "" ? prompt : null;
}
