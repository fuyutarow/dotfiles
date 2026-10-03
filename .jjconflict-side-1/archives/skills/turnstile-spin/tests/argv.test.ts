import { describe, expect, test } from "bun:test";

const scripts = [
  "fetch-secret.ts",
  "validate.ts",
  "worker-deploy.ts",
  "widget-create.ts",
  "persist-skill.ts",
] as const;

describe("Turnstile script argv boundary", () => {
  for (const script of scripts) {
    test(`${script} rejects --__proto__ before side effects with exit 2`, () => {
      const path = new URL(`../scripts/${script}`, import.meta.url).pathname;
      const proc = Bun.spawnSync(["bun", path, "--__proto__"], {
        maxBuffer: 1024 * 1024,
      });
      expect(proc.stdout.toString()).toBe("");
      expect(proc.stderr.toString()).toContain("unknown option '--__proto__'");
      expect(proc.exitCode).toBe(2);
    });
  }

  test("a known string option with no value is a usage error", () => {
    const path = new URL("../scripts/fetch-secret.ts", import.meta.url)
      .pathname;
    const proc = Bun.spawnSync(["bun", path, "--account-id"], {
      maxBuffer: 1024 * 1024,
    });
    expect(proc.stdout.toString()).toBe("");
    expect(proc.stderr.toString()).toContain("option value required");
    expect(proc.exitCode).toBe(2);
  });
});
