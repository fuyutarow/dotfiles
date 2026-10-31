import { join } from "node:path";
import { readCodexThreadStatus } from "../../src/adapters/codex-rollout.ts";
import type { SessionStatus } from "../../src/session-status.ts";
export async function readCodexSessionStatus(
  sessionId: string,
  cwd: string,
  root = join(process.env["HOME"] ?? "", ".codex", "sessions"),
): Promise<SessionStatus | undefined> {
  const selected = await readCodexThreadStatus(sessionId, root);
  return selected?.cwd === cwd ? selected : undefined;
}
