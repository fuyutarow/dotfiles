// Names use the same formatter as Claude's launcher/assign hook. Codex has no native agent-name
// field, so its authoritative name is generated from the exact thread and cwd. Herdr display
// tokens are presentation state and never a naming input.
import { agentNameFor } from "../../../tools/shared/src/agent-name.ts";

export function codexAgentName(
  cwd: string,
  threadId: string,
  _paneDisplayName?: string,
): string {
  // Stable across hook processes and resume, without consulting another vendor's session list.
  const digest = new Bun.CryptoHasher("sha256").update(threadId).digest();
  const alphabet = "0123456789abcdefghjkmnpqrstvwxyz";
  const suffix = Array.from(
    digest.subarray(0, 4),
    (byte) => alphabet[byte & 31],
  ).join("");
  return agentNameFor(cwd, "agt", suffix);
}
