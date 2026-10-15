// Live machine audit. Deliberately not named *.test.ts: bun test scripts/tests must be
// repository-only. Run explicitly with mise run test:doctor on the deployed machine.
import { expect, test } from "bun:test";
import { tmpdir, userInfo } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { sshSupportsAttachMatch } from "../link-dots.ts";

const REPO = join(import.meta.dir, "../..");
test.skipIf(process.platform !== "darwin")(
  "Edge policy is a valid property list using the platform validator",
  () => {
    const result = Bun.spawnSync(
      ["plutil", "-lint", join(REPO, "edge/policy.plist.mac")],
      { timeout: 5000 },
    );
    expect(result.exitCode).toBe(0);
  },
);

const version = Bun.spawnSync(["ssh", "-V"], { timeout: 5000 });
const host = Bun.spawnSync(
  ["ssh", "-G", "-F", join(REPO, "ssh/config"), "r99-u24"],
  { timeout: 5000 },
);
const attaches = !host.stdout
  .toString()
  .split("\n")
  .includes("hostname r99-u24");

test.skipIf(!sshSupportsAttachMatch(version.stderr.toString()) || !attaches)(
  "smart-open: the deployed ssh/config agrees with tools/shared/src/sockets.ts",
  () => {
    const cache = mkdtempSync(join(tmpdir(), "doctor-live-bun-cache-"));
    const result = Bun.spawnSync(
      [process.execPath, join(REPO, "scripts/doctor.ts")],
      {
        env: {
          ...process.env,
          HOME: userInfo().homedir,
          DOTFILES: REPO,
          DOCTOR_ONLY: "smart-open",
          BUN_RUNTIME_TRANSPILER_CACHE_PATH: cache,
        },
        timeout: 30_000,
      },
    );
    rmSync(cache, { recursive: true, force: true });
    expect(result.stdout.toString()).toMatch(/^PASS {2}smart-open /mu);
    expect(result.exitCode).toBe(0);
  },
);
