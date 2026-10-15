// bun test for scripts/edge-policy.ts and the repo's Edge policy. The script is spawned for real
// with EDGE_POLICY_DST pointed at a throwaway file, so nothing here touches /Library or needs sudo.
// Each FAIL case is paired with its PASS twin so a check that always passes, or always fails, is
// caught (writing-bun-scripts BG4).
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Edge's managed policy is a macOS plist (edge/policy.plist.mac); elsewhere the tool refuses (exit 2).
const NOT_MAC = process.platform !== "darwin";
setDefaultTimeout(20_000);

const REPO = join(import.meta.dir, "..", "..");
const SCRIPT = join(REPO, "scripts", "edge-policy.ts");
const POLICY = join(REPO, "edge", "policy.plist.mac");

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
});

async function dst(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "edge-policy-"));
  cleanups.push(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  return join(dir, "com.microsoft.Edge.plist");
}

async function run(
  args: string[],
  to: string,
): Promise<{ code: number; out: string }> {
  const p = await spawn(["bun", SCRIPT, ...args], {
    env: { ...process.env, EDGE_POLICY_DST: to },
    timeout: 20_000,
  });
  return {
    code: p.exitCode ?? -1,
    out: p.stdout.toString() + p.stderr.toString(),
  };
}

describe("edge-policy.ts", () => {
  test.skipIf(NOT_MAC)(
    "--check on a missing destination FAILs with the repair, and writes nothing",
    async () => {
      const to = await dst();
      const r = await run(["--check"], to);
      expect(r.code).toBe(1);
      expect(r.out).toContain("FAIL edge-policy:");
      expect(r.out).toContain("is missing, unlike edge/policy.plist.mac");
      expect(r.out).toContain("fix: mise run edge:policy");
      expect(await Bun.file(to).exists()).toBe(false);
    },
  );

  test.skipIf(NOT_MAC)(
    "deploying makes the destination a byte-equal copy, and --check then PASSes",
    async () => {
      const to = await dst();
      const deployed = await run([], to);
      expect(deployed.code).toBe(0);
      expect(deployed.out).toContain("PASS edge-policy: deployed to");
      expect((await readFile(to)).equals(await readFile(POLICY))).toBe(true);
      const again = await run(["--check"], to);
      expect(again.code).toBe(0);
      expect(again.out).toContain("PASS edge-policy:");
    },
  );

  test.skipIf(NOT_MAC)(
    "a destination that has drifted FAILs under --check, and a deploy repairs it",
    async () => {
      const to = await dst();
      await writeFile(to, "<plist></plist>");
      const drift = await run(["--check"], to);
      expect(drift.code).toBe(1);
      expect(drift.out).toContain("differs from edge/policy.plist.mac");
      expect(await readFile(to, "utf8")).toBe("<plist></plist>"); // --check changed nothing
      expect((await run([], to)).code).toBe(0);
      expect((await run(["--check"], to)).code).toBe(0);
    },
  );

  test("an unknown flag is refused (exit 1) and the prototype guard answers --__proto__ (exit 2)", async () => {
    expect((await run(["--nope"], await dst())).code).toBe(1);
    expect((await run(["stray"], await dst())).code).toBe(2); // takes no positionals
    expect((await run(["--__proto__"], await dst())).code).toBe(2);
  });
});

describe("edge/policy.plist.mac", () => {
  test("blocks the extension that took over the default search, and pins the engine", async () => {
    const text = await readFile(POLICY, "utf8");
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

// Drain both pipes while waiting so a child cannot block on a full output buffer.
async function spawn(
  command: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeout?: number;
    maxBuffer?: number;
    stdin?: Blob;
    stdout?: "pipe";
    stderr?: "pipe";
  } = {},
) {
  const proc = Bun.spawn(command, {
    ...options,
    stdin: options.stdin ?? "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).arrayBuffer(),
    proc.exited,
  ]);
  return { stdout: Buffer.from(stdout), stderr: Buffer.from(stderr), exitCode };
}
