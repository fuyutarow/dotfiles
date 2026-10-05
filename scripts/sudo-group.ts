// May this account use sudo? Decided WITHOUT asking sudo: on a shared server where we have no root
// (sol, 2026-10-05) every sudo attempt — `sudo -n` and `sudo -l` included — is reported to the
// admins ("not in the sudoers file. This incident will be reported"). Group membership alone is
// the answer: root, or a member of sudo / wheel / admin. scripts/bootstrap-linux.sh puts its user
// in `sudo`. Consumers: scripts/up.ts (which topgrade steps to run), scripts/linux-init.ts (the
// sshd drop-in). Exported as data + one function so the rule has one home.
import { userInfo } from "node:os";
import { $ } from "bun";

export const SUDO_GROUPS: ReadonlySet<string> = new Set([
  "sudo",
  "wheel",
  "admin",
]);

export async function sudoIsOurs(): Promise<boolean> {
  if (userInfo().uid === 0) return true;
  const groups = (await $`id -nG`.text()).trim().split(/\s+/u);
  return groups.some((g) => SUDO_GROUPS.has(g));
}
