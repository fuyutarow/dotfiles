// bun test for scripts/edge-policy.ts and the repo's Edge policy. The script is spawned for real
// with EDGE_POLICY_DST pointed at a throwaway file, so nothing here touches /Library or needs sudo.
// Each FAIL case is paired with its PASS twin so a check that always passes, or always fails, is
// caught (writing-bun-scripts BG4).
import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..", "..");
const SCRIPT = join(REPO, "scripts", "edge-policy.ts");
const POLICY = join(REPO, "edge", "policy.plist.mac");

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

function dst(): string {
  const dir = mkdtempSync(join(tmpdir(), "edge-policy-"));
  cleanups.push(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return join(dir, "com.microsoft.Edge.plist");
}

function run(args: string[], to: string): { code: number; out: string } {
  const p = Bun.spawnSync(["bun", SCRIPT, ...args], {
    env: { ...process.env, EDGE_POLICY_DST: to },
    timeout: 20_000,
  });
  return {
    code: p.exitCode ?? -1,
    out: p.stdout.toString() + p.stderr.toString(),
  };
}

describe("edge-policy.ts", () => {
  test("--check on a missing destination FAILs with the repair, and writes nothing", () => {
    const to = dst();
    const r = run(["--check"], to);
    expect(r.code).toBe(1);
    expect(r.out).toContain("FAIL edge-policy:");
    expect(r.out).toContain("is missing, unlike edge/policy.plist.mac");
    expect(r.out).toContain("fix: mise run edge:policy");
    expect(existsSync(to)).toBe(false);
  });

  test("deploying makes the destination a byte-equal copy, and --check then PASSes", () => {
    const to = dst();
    const deployed = run([], to);
    expect(deployed.code).toBe(0);
    expect(deployed.out).toContain("PASS edge-policy: deployed to");
    expect(readFileSync(to).equals(readFileSync(POLICY))).toBe(true);
    const again = run(["--check"], to);
    expect(again.code).toBe(0);
    expect(again.out).toContain("PASS edge-policy:");
  });

  test("a destination that has drifted FAILs under --check, and a deploy repairs it", () => {
    const to = dst();
    writeFileSync(to, "<plist></plist>");
    const drift = run(["--check"], to);
    expect(drift.code).toBe(1);
    expect(drift.out).toContain("differs from edge/policy.plist.mac");
    expect(readFileSync(to, "utf8")).toBe("<plist></plist>"); // --check changed nothing
    expect(run([], to).code).toBe(0);
    expect(run(["--check"], to).code).toBe(0);
  });

  test("an unknown flag is refused (exit 1) and the prototype guard answers --__proto__ (exit 2)", () => {
    expect(run(["--nope"], dst()).code).toBe(1);
    expect(run(["stray"], dst()).code).toBe(2); // takes no positionals
    expect(run(["--__proto__"], dst()).code).toBe(2);
  });
});

describe("edge/policy.plist.mac", () => {
  const text = readFileSync(POLICY, "utf8");

  test("is a valid property list", () => {
    if (Bun.which("plutil") === null) return; // macOS tool; nothing to assert elsewhere
    const p = Bun.spawnSync(["plutil", "-lint", POLICY]);
    expect(p.exitCode).toBe(0);
  });

  test("blocks the extension that took over the default search, and pins the engine", () => {
    // ID of "You.com v1.0" (chrome_settings_overrides.search_provider.is_default, 2026-10-01).
    expect(text).toContain("<string>ffoiecgjambohnpffggcdidbomhmcack</string>");
    expect(text).toMatch(/<key>ExtensionInstallBlocklist<\/key>\s*<array>/u);
    expect(text).toMatch(
      /<key>DefaultSearchProviderEnabled<\/key>\s*<true\/>/u,
    );
    expect(text).toContain("<key>DefaultSearchProviderSearchURL</key>");
    expect(text).toContain("{searchTerms}");
  });
});
