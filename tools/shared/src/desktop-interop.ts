// The WSL interop socket of the owner's interactive desktop session, for ONE Windows program.
//
// WHY. Windows desktops and clipboards are per Windows session. A shell that keeps the WSL_INTEROP it
// inherited at start (a long-lived herdr pane) points at a socket that may be dead or serve session 0;
// explorer.exe started through it opens nothing on the owner's desktop, silently. The choice of socket
// is scripts/wsl-interop-session.ts's job (liveness + SessionId == explorer.exe's, cached); this file
// only runs it and reads its stdout. It never touches process.env: the caller puts the socket in the
// env of the single spawn that needs it.
//
// Shared by smart-open (explorer.exe) and smart-copy (clip.exe); each names its own test-seam
// variable and passes its value to repoHelperCommand.
// Tests: tools/smart-open/tests/desktop-interop.test.ts.
import { fileURLToPath } from "node:url";
import { attempt, errorMessage } from "./attempt.ts";

/** The helper's own budget is 12 s (scripts/wsl-interop-session.ts BUDGET_MS); this is the outer cut. */
export const HELPER_MS = 15_000;

const REPO_HELPER = fileURLToPath(
  new URL("../../../scripts/wsl-interop-session.ts", import.meta.url),
);

export type Interop =
  | { ok: true; socket: string }
  | { ok: false; reason: string };

/**
 * The command that prints the socket. `override` (words split on spaces) replaces it — a test seam
 * each caller names for itself, so no test depends on this machine's Windows side.
 */
export function repoHelperCommand(override: string | undefined): string[] {
  if (override !== undefined && override !== "") return override.split(" ");
  return [process.execPath, REPO_HELPER];
}

/** Run the helper; a socket on success, the reason otherwise. Never throws. */
export async function desktopInterop(
  command: string[],
  ms = HELPER_MS,
): Promise<Interop> {
  const spawned = await attempt(() =>
    Bun.spawn(command, {
      stdout: "pipe",
      stderr: "pipe",
      timeout: ms,
      killSignal: "SIGKILL",
    }),
  );
  if (!spawned.ok) {
    return {
      ok: false,
      reason: `cannot run ${command[0] ?? "the helper"}: ${errorMessage(spawned.error)}`,
    };
  }
  const [out, err, code] = await Promise.all([
    new Response(spawned.value.stdout).text(),
    new Response(spawned.value.stderr).text(),
    spawned.value.exited,
  ]);
  const socket = out.trim().split("\n").at(-1) ?? "";
  if (code === 0 && socket !== "") return { ok: true, socket };
  const said = err.trim().split("\n").at(-1) ?? "";
  if (said !== "")
    return { ok: false, reason: said.replace(/^wsl-interop-session: /u, "") };
  if (code === 0) return { ok: false, reason: "the helper printed no socket" };
  return { ok: false, reason: `the helper exited ${code}` };
}
