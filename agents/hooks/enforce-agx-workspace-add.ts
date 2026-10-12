import { decidePre, readStdinJson } from "./lib.ts";
import { strAt } from "./narrow.ts";
import { agxWorkspaceAddReason } from "./enforce-storage-headroom.ts";

function main(): void {
  const payload = readStdinJson();
  if (strAt(payload, "tool_name") !== "Bash") return;
  const command = strAt(payload, "tool_input", "command");
  if (command === undefined) return;
  const cwd = strAt(payload, "cwd") ?? process.cwd();
  const reason = agxWorkspaceAddReason(command, cwd);
  // SINGLE-AXIS: raw workspace creation must use the declared agx policy.
  if (reason !== null) decidePre("deny", reason);
}

main();
