// `mise run up` (m up) — update everything through topgrade (topgrade/topgrade.toml decides which
// steps exist). Consumer: a human at a terminal; topgrade's own output is the report.
//
// NO SUDO, NO SUDO ATTEMPT. On a shared server where we have no root (sol, 2026-10-05) topgrade ran
// `sudo apt update` and `sudo freshclam`, sudo answered "not in the sudoers file — this incident
// will be reported", and the admins got a report per run. Asking sudo whether we may (`sudo -n`,
// `sudo -l`) is itself such an attempt, so the answer comes from group membership alone
// (scripts/sudo-group.ts). Anyone else runs without the steps that need root, and is told which.
//
// Never a silent success: until 2026-10-05 a missing topgrade printed "completed with some errors"
// and exited 0. Exit: topgrade's own status; 1 when topgrade is missing.
import { userInfo } from "node:os";
import { $ } from "bun";
import { SUDO_GROUPS, sudoIsOurs } from "./sudo-group.ts";

// topgrade steps that run sudo (or need root) on Linux.
const ROOT_STEPS = [
  "system",
  "firmware",
  "clam_av_db",
  "snap",
  "restarts",
] as const;

const say = (line: string): void => {
  process.stderr.write(`up: ${line}\n`);
};

if (Bun.which("topgrade") === null) {
  say(
    "topgrade is not installed (Brewfile.core: mise run linux:init, or install:tools)",
  );
  process.exit(1);
}

const canSudo = await sudoIsOurs();
const skip: readonly string[] = canSudo ? [] : ROOT_STEPS;
if (!canSudo)
  say(
    `no sudo here (${userInfo().username} is in none of ${[...SUDO_GROUPS].join("/")}), so sudo is never tried — skipping ${skip.join(", ")}`,
  );

const r = await $`topgrade --disable containers ${skip}`.nothrow();
if (r.exitCode !== 0) say("topgrade finished with failed steps (listed above)");
process.exitCode = r.exitCode;
