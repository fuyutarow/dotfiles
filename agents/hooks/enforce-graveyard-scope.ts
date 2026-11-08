// PreToolUse gate (matcher: Bash), Claude Code and Codex — the transport adapter for graveyard-scope.ts.
// Policy (what names a graveyard other than the declared one) lives in graveyard-scope.ts.
//
// FAIL CLOSED (run.sh --fail-closed): an unreadable payload or a runtime error denies.

import { attempt, errorMessage } from "./attempt.ts";
import { decidePre, readStdinJson } from "./lib.ts";
import { strAt } from "./narrow.ts";
import { declaredGraveyard, graveyardViolations } from "./graveyard-scope.ts";

type MainOutcome =
  | { readonly kind: "deny"; readonly message: string }
  | { readonly kind: "error"; readonly message: string }
  | null;

function main(): MainOutcome {
  const payload = readStdinJson();
  if (payload === undefined)
    return { kind: "error", message: "invalid JSON payload" };
  if (strAt(payload, "tool_name") !== "Bash") return null;
  const command = strAt(payload, "tool_input", "command");
  if (command === undefined || command === "") return null;
  const cwd = strAt(payload, "cwd");
  const violations = graveyardViolations(
    command,
    cwd !== undefined && cwd !== "" ? cwd : process.cwd(),
  );
  if (violations.length === 0) return null;
  // BATCHED(graveyard names): every violation in the command comes back in one denial.
  return {
    kind: "deny",
    message:
      `graveyard-scope: ${violations.join("; ")}. ` +
      `The declared graveyard is ${declaredGraveyard()}. ` +
      `Run plain \`rip <targets>\` (it uses the declared graveyard) or name it as ` +
      `\`--graveyard "$RIP_GRAVEYARD"\`. disk-reclaim reclaims only graveyards it can see, ` +
      `so another graveyard is never reclaimed.`,
  };
}

const r = await attempt(main);
if (r.ok && r.value !== null && r.value.kind === "deny") {
  // SINGLE-AXIS: one question (does the command name a graveyard other than the declared one?)
  decidePre("deny", r.value.message);
} else if (r.ok && r.value !== null && r.value.kind === "error") {
  // FATAL: the payload could not be read, so the command cannot be judged; fail closed with the cause.
  decidePre(
    "deny",
    `graveyard-scope: could not evaluate the command (${r.value.message}); failing closed.`,
  );
} else if (!r.ok) {
  // FATAL: the policy itself failed, so no graveyard could be checked; fail closed with the error.
  decidePre(
    "deny",
    `graveyard-scope: could not evaluate the command (${errorMessage(r.error)}); failing closed.`,
  );
}
process.exit(0);
