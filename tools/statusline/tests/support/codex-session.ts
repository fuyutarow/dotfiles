import { join } from "node:path";
import { readCodexThreadStatus } from "../../src/adapters/codex-rollout.ts";
import type { SessionStatus } from "../../src/session-status.ts";
export async function readCodexSessionStatus(
  cwd: string,
  root = join(process.env["HOME"] ?? "", ".codex", "sessions"),
): Promise<SessionStatus | undefined> {
  const sessionId = process.env["CODEX_SESSION_ID"]?.trim();
  if (sessionId === undefined || sessionId === "") return undefined;
  const selected = await readCodexThreadStatus(sessionId, root);
  return selected?.cwd === cwd ? selected : undefined;
}
