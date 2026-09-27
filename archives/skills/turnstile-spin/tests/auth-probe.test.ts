// Pins the 2026-07-23 behavior-hat fix: an error envelope from auth-probe exits NON-ZERO.
// (Baseline bug: every error branch did `output(...); return;` and fell through to exit 0,
// so callers branching on the exit code treated auth failures as success.)
// Only the no-network branch (missing token) is exercised — wrangler is never spawned here.
import { describe, expect, test } from "bun:test";

const SCRIPT = new URL("../scripts/auth-probe.ts", import.meta.url).pathname;

describe("auth-probe", () => {
  test("missing token → missing_token envelope on stdout AND exit 1", () => {
    const env = { ...process.env };
    delete env.CLOUDFLARE_API_TOKEN;
    // bounded: no-network branch; the script exits before any spawn
    const proc = Bun.spawnSync(["bun", SCRIPT], { env, maxBuffer: 1024 * 1024 });
    expect(JSON.parse(proc.stdout.toString().trim())).toEqual({
      status: "missing_token",
      reason: "no_env_var",
    });
    expect(proc.stderr.toString()).toContain("CLOUDFLARE_API_TOKEN");
    expect(proc.exitCode).toBe(1);
  });
});
