// smart-open's view of the shared desktop-session interop runner (tools/shared/src/desktop-interop.ts):
// the socket of the owner's interactive desktop session, for ONE Windows program (explorer.exe here).
// Only the test-seam variable is smart-open's own.
//
// Tests: tools/smart-open/tests/desktop-interop.test.ts.
import { repoHelperCommand } from "@dotfiles/shared/src/desktop-interop.ts";

export { desktopInterop } from "@dotfiles/shared/src/desktop-interop.ts";

/**
 * The command that prints the socket. SMART_OPEN_INTEROP_HELPER replaces it (words split on spaces) —
 * a test seam like SMART_OPEN_LOCAL_OPENER, so no test depends on this machine's Windows side.
 */
export function helperCommand(
  env: Record<string, string | undefined>,
): string[] {
  return repoHelperCommand(env["SMART_OPEN_INTEROP_HELPER"]);
}
