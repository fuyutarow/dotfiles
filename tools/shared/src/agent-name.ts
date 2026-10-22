// The one declared format of an agent session name: `<project-slug>-<role>_<id>`,
// e.g. `example-search-v1-agt_f24v`.
//
// Convention (owner decision 2026-10-15; naming survey urn:uuid:01a13e5a-cec2-750e-b4ab-22efac6ddbce
// found primary sources silent on a `-`/`_` hierarchy inside one name, so this is a declared
// team convention, not an external standard): `-` joins words, `_` binds a type prefix to its
// id (agt_<slug>, ws_<slug>, and here <role>_<id>).
//
// The project slug is the directory basename lowercased, every run of characters outside
// [a-z0-9] (including `_`) turned into one `-`. A slug therefore never contains `_`, so a name has
// exactly one underscore, between role and id. The project/role boundary is the LAST `-<role>_`:
// a role is a lowercase word with no `-` or `_` (ROLE_RE) and an id has no `-` or `_`, so that
// pattern is unambiguous even though the slug itself contains hyphens.
//
// Producers: agents/claude/hooks/assign-lib.ts (the assign hook) imports this module; the zsh
// claude() wrapper (zsh/aliases.zsh, `_agent_name`) re-implements `format` in pure zsh and is
// held to this module by the shared vector table tools/shared/tests/fixtures/agent-name-vectors.tsv.
// Consumers that only display or parse names (tools/agx, tools/statusline) migrate separately.

import { basename } from "node:path";

// Lowercase letters/digits, starting with a letter, capped at 12: generous enough for every
// role token seen live so far (obs, dtr, pi, gpu, agt, ...) without an ugly session name.
const ROLE_RE = /^[a-z][a-z0-9]{0,11}$/u;
const ID_RE = /^[a-z0-9]+$/u;
// Greedy project: the split lands on the LAST `-<role>_`. The project is deliberately not
// restricted to the slug alphabet, so legacy snake-cased names (agentic_rnd-agt_bvxj) still parse.
const NAME_RE = /^(.+)-([a-z][a-z0-9]{0,11})_([a-z0-9]+)$/u;

export interface AgentName {
  project: string;
  role: string;
  id: string;
}

export function isValidRole(role: string): boolean {
  return ROLE_RE.test(role);
}

export function isValidId(id: string): boolean {
  return ID_RE.test(id);
}

// Directory basename -> project slug. Edge hyphens are trimmed; a basename with no [a-z0-9] at
// all yields "x" so the name still parses.
export function projectSlug(dirName: string): string {
  const slug = dirName
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "");
  return slug === "" ? "x" : slug;
}

export function formatAgentName(name: AgentName): string {
  return `${projectSlug(name.project)}-${name.role}_${name.id}`;
}

// `cwd` is a path; its basename is the project.
export function agentNameFor(cwd: string, role: string, id: string): string {
  return formatAgentName({ project: basename(cwd), role, id });
}

// null when the string is not `<project>-<role>_<id>`.
export function parseAgentName(name: string): AgentName | null {
  const m = NAME_RE.exec(name);
  if (m === null) return null;
  const [, project, role, id] = m;
  if (project === undefined || role === undefined || id === undefined)
    return null;
  return { project, role, id };
}
