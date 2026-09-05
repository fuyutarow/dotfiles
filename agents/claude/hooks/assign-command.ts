// UserPromptSubmit hook (no matcher — this event supports none) implementing `/assign <role>`:
// typed at the start of a prompt, it renames THIS session to "<project>-<role>_<suffix>" (the
// same effect as `/rename`, via hookSpecificOutput.sessionTitle) and, if configured, delivers
// that role's charter text as additionalContext — both as a side effect of the SAME turn, no
// extra model turn spent, no subprocess spawned (assign-lib.ts's functions run in-process).
//
// NOT the `/quote` shape. `/quote`'s hook (UserPromptExpansion) blocks expansion because its
// whole job is mechanical and the model should never see a turn for it. `/assign` is the
// opposite: the model DOES need to see a turn (to act on the role), so this hook only ever sets
// sessionTitle/additionalContext and otherwise lets the prompt proceed untouched — command
// expansion then runs normally and agents/commands/assign.md supplies the model-facing text.
//
// FIRES ON EVERY PROMPT IN EVERY SESSION on this machine (UserPromptSubmit takes no matcher —
// see operating-the-harness/references/hooks.md). The very first thing this does is a cheap
// prefix regex, so the ~99.9% of prompts that aren't `/assign ...` cost one test and nothing
// else. Anything unexpected falls through to a silent pass (exit 0, no output): blocking or
// crashing on an ORDINARY prompt because of a bug here would be far worse than `/assign`
// occasionally failing to rename.
//
// sessionTitle on UserPromptSubmit: corroborated 2026-09-02 from Claude Code's own hooks
// reference plus a working third-party example of the identical field on SessionStart
// (doc-quoted: "same effect as /rename"), but not personally triggered end-to-end in a live
// session by whoever wrote this. Try `/assign obs` after deploy and confirm the session/tab
// name actually changes. If it silently no-ops, the role instruction still reaches the model
// via assign.md + additionalContext — the rename failing does not lose the role assignment.
//
// Does NOT fire for a model-invoked `/assign` (the Skill tool's own dispatch path is not a
// prompt submission) — only a human-typed (or otherwise literally submitted) `/assign <role>`
// goes through UserPromptSubmit. A model-invoked call still gets assign.md's own body, just
// without this rename side effect.

import { readStdinJson } from "./lib.ts";
import {
  isValidRole,
  randomSuffix,
  rolePrompt,
  sessionName,
  type RoleConfig,
} from "./assign-lib.ts";
import roles from "./assign-roles.toml";

function block(reason: string): never {
  console.log(JSON.stringify({ decision: "block", reason }));
  process.exit(0);
}

function allow(sessionTitle: string, additionalContext: string | null): never {
  const hookSpecificOutput: Record<string, string> = {
    hookEventName: "UserPromptSubmit",
    sessionTitle,
  };
  if (additionalContext)
    hookSpecificOutput.additionalContext = additionalContext;
  console.log(JSON.stringify({ hookSpecificOutput }));
  process.exit(0);
}

try {
  const payload = readStdinJson();
  const prompt = typeof payload?.prompt === "string" ? payload.prompt : "";
  const cwd = typeof payload?.cwd === "string" ? payload.cwd : process.cwd();

  const m = prompt.trim().match(/^\/assign(?:\s+(\S+))?/);
  if (!m) process.exit(0); // not an /assign invocation -> silent pass, zero cost

  const role = m[1];
  if (!role) {
    block('usage: /assign <role>  (e.g. "/assign obs")');
  }
  if (!isValidRole(role)) {
    block(
      `/assign: role must be 1-12 lowercase letters/digits starting with a letter, got "${role}"`,
    );
  }

  const name = sessionName(cwd, role, randomSuffix());
  const context = rolePrompt(role, roles as Record<string, RoleConfig>);
  allow(name, context);
} catch {
  // FAIL OPEN — see the header: a bug here must never block an ordinary prompt.
  process.exit(0);
}
