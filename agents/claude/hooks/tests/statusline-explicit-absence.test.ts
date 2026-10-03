// statusline-command.ts, EXPLICIT-ABSENCE law (2026-10-03): a reading the bar could not take is
// printed as `<label> n/a (<why>)`, never dropped from its row. Spawned as the real process
// with a fake PATH, so "nvidia-smi missing / hung / failing" and "ps missing" are real failures
// of the real subprocess calls, not stubs of the functions.

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempDir, tempHome } from "./helpers.ts";

const STATUSLINE = join(import.meta.dir, "..", "..", "statusline-command.ts");
const ANSI = new RegExp("\u001b\\[[0-9;]*m", "g");

// A bin dir holding only the fakes named here: anything else (ps, git, nvidia-smi) is absent,
// which is exactly the "tool not installed" failure.
function binWith(fakes: Record<string, string>): string {
  const bin = tempDir("slbin-");
  for (const [name, body] of Object.entries(fakes)) {
    const p = join(bin, name);
    writeFileSync(p, `#!/bin/sh\n${body}\n`);
    chmodSync(p, 0o755);
  }
  return bin;
}

function render(opts: {
  bin: string;
  home?: string;
  payload?: unknown;
}): { text: string; home: string } {
  const home = opts.home ?? tempHome();
  const r = spawnSync(process.execPath, [STATUSLINE], {
    input: JSON.stringify(opts.payload ?? {}),
    encoding: "utf8",
    env: { HOME: home, PATH: opts.bin, TZ: "UTC" }, // no inherited HERDR_*, no real tools
    cwd: tempDir("slcwd-"), // not a repo
  });
  expect(r.status).toBe(0);
  return { text: (r.stdout ?? "").replace(ANSI, ""), home };
}
const sysRow = (text: string): string =>
  text.split("\n").find((l) => l.startsWith("Sys:")) ?? "";

function seedGpuCache(home: string, cache: unknown): void {
  mkdirSync(join(home, ".cache", "claude"), { recursive: true });
  writeFileSync(
    join(home, ".cache", "claude", "statusline-gpu.json"),
    JSON.stringify(cache),
  );
}

describe("statusline Sys row: VRAM", () => {
  test("a working nvidia-smi shows the number", () => {
    const bin = binWith({ "nvidia-smi": "echo '3584, 12288'" });
    expect(sysRow(render({ bin }).text)).toContain("VRAM 29% (3.5/12.0G)");
  });

  test("no nvidia-smi is stated, not silently omitted", () => {
    const row = sysRow(render({ bin: binWith({}) }).text);
    expect(row).toContain("VRAM n/a (no nvidia-smi)");
  });

  test("a hung nvidia-smi names the bound it hit (was: cached as 'no GPU')", () => {
    const bin = binWith({ "nvidia-smi": "exec /bin/sleep 6" });
    const row = sysRow(render({ bin }).text);
    expect(row).toContain("VRAM n/a (nvidia-smi timeout 2000ms)");
  });

  test("a timeout is NOT cached as 'no GPU': the next render samples again", () => {
    const home = tempHome();
    render({
      home,
      bin: binWith({ "nvidia-smi": "exec /bin/sleep 6" }),
    });
    // Simulate time passing past the 5 s TTL, then a healthy driver.
    const cache = join(home, ".cache", "claude", "statusline-gpu.json");
    const failed = JSON.parse(readFileSync(cache, "utf8"));
    expect(failed.why).toBe("nvidia-smi timeout 2000ms");
    expect(failed.reading ?? null).toBeNull();
    seedGpuCache(home, { ...failed, at: failed.at - 60_000 });
    const bin = binWith({ "nvidia-smi": "echo '3584, 12288'" });
    expect(sysRow(render({ home, bin }).text)).toContain(
      "VRAM 29% (3.5/12.0G)",
    );
  });

  test("a miss within the TTL is served from cache with its reason (one bounded render per 5 s)", () => {
    const home = tempHome();
    const slow = binWith({ "nvidia-smi": "exec /bin/sleep 6" });
    render({ home, bin: slow });
    const started = Date.now();
    const row = sysRow(render({ home, bin: slow }).text);
    expect(row).toContain("VRAM n/a (nvidia-smi timeout 2000ms)");
    expect(Date.now() - started).toBeLessThan(1500); // did not wait out another timeout
  });

  test("a failed sample shows the last good one, marked stale with age and reason", () => {
    const home = tempHome();
    const at = Date.now();
    seedGpuCache(home, {
      at: at - 60_000,
      why: "nvidia-smi timeout 2000ms",
      good: { at: at - 40_000, reading: { frac: "3.5/12.0G", pct: 29.2 } },
    });
    const row = sysRow(
      render({ home, bin: binWith({ "nvidia-smi": "exit 9" }) }).text,
    );
    expect(row).toContain("VRAM 29% (3.5/12.0G)");
    expect(row).toMatch(/stale (4[0-9]|5[0-9])s \(nvidia-smi exit 9\)/);
  });

  test("a last-good older than 30 min is n/a, not a stale number", () => {
    const home = tempHome();
    seedGpuCache(home, {
      at: Date.now() - 60_000,
      good: {
        at: Date.now() - 31 * 60_000,
        reading: { frac: "3.5/12.0G", pct: 29.2 },
      },
    });
    const row = sysRow(
      render({ home, bin: binWith({ "nvidia-smi": "exit 9" }) }).text,
    );
    expect(row).toContain("VRAM n/a (nvidia-smi exit 9)");
    expect(row).not.toContain("3.5/12.0G");
  });

  test("garbage output is 'unparsable', not a number", () => {
    const bin = binWith({ "nvidia-smi": "echo 'No devices were found'" });
    expect(sysRow(render({ bin }).text)).toContain(
      "VRAM n/a (nvidia-smi output unparsable)",
    );
  });

  test("the pre-fix cache shape ({reading:null}) is not trusted as 'no GPU'", () => {
    const home = tempHome();
    seedGpuCache(home, { at: Date.now(), reading: null });
    const bin = binWith({ "nvidia-smi": "echo '3584, 12288'" });
    expect(sysRow(render({ home, bin }).text)).toContain("VRAM 29%");
  });
});

describe("statusline Sys row: every reading is present", () => {
  test("CPU's first render says why it has no number; RAM and VRAM and Disk stay", () => {
    const row = sysRow(render({ bin: binWith({}) }).text);
    expect(row).toContain("CPU n/a (no earlier sample to diff against)");
    expect(row).toContain("RAM ");
    expect(row).toContain("VRAM ");
    expect(row).toContain("Disk ");
  });

  test("the second render has a CPU number", () => {
    const home = tempHome();
    render({ home, bin: binWith({}) });
    expect(sysRow(render({ home, bin: binWith({}) }).text)).toMatch(
      /CPU \d+%/,
    );
  });

  test("the snapshot the log hook reads carries the n/a too", () => {
    const { home } = render({ bin: binWith({}) });
    const cached = JSON.parse(
      readFileSync(join(home, ".cache", "claude", "statusline-sys.json"), "utf8"),
    );
    expect(cached.line).toContain("VRAM n/a (no nvidia-smi)");
  });
});

describe("statusline other rows", () => {
  test("Job: a failed process scan is n/a, not 'no jobs'", () => {
    const text = render({ bin: binWith({}) }).text;
    expect(text).toContain("Job: scan n/a (no ps)");
  });

  test("Job: no jobs and no orphans stays silent (nothing exists to show)", () => {
    const bin = binWith({ ps: "exit 0" });
    expect(render({ bin }).text).not.toContain("Job:");
  });

  test("Job: an orphan is spelled out, not `det×`", () => {
    const bin = binWith({ ps: "echo '    1  120 /x/scratchpad/leak.sh'" });
    const text = render({ bin }).text;
    expect(text).toContain("orphan×1");
    expect(text).not.toContain("det×");
  });

  test("an empty payload prints n/a for Ctx, Rate and diff instead of 0 or nothing", () => {
    const text = render({ bin: binWith({}), payload: {} }).text;
    expect(text).toContain("Ctx: n/a");
    expect(text).toContain("Rate: n/a (no rate_limits in the payload)");
    expect(text).toContain("diff n/a (payload has no cost block)");
    expect(text).not.toContain("(+0,-0)");
  });

  test("a payload with only the 7d window says the 5h window is n/a", () => {
    const text = render({
      bin: binWith({}),
      payload: {
        rate_limits: { seven_day: { used_percentage: 40 } },
        context_window: { total_input_tokens: 12_345 },
        cost: { total_lines_added: 3, total_lines_removed: 1 },
      },
    }).text;
    expect(text).toContain("5h n/a");
    expect(text).toContain("7d 40%");
    expect(text).toContain("Ctx: 12.3k n/a"); // tokens known, percentage not
    expect(text).toContain("(+3,-1)");
  });

  test("a real zero is shown as zero (absence and zero stay distinct)", () => {
    const text = render({
      bin: binWith({}),
      payload: {
        context_window: { total_input_tokens: 0, used_percentage: 0 },
        cost: { total_lines_added: 0, total_lines_removed: 0 },
      },
    }).text;
    expect(text).toContain("Ctx: 0 0%");
    expect(text).toContain("(+0,-0)");
  });

  test("a failed git lookup is n/a; a non-repo cwd shows no branch at all", () => {
    // no git on PATH -> the lookup failed
    expect(render({ bin: binWith({}) }).text).toContain(
      "⎇ branch n/a (no git)",
    );
    // git says 'not a repository' (exit 128) -> nothing to show
    const notRepo = binWith({ git: "exit 128" });
    expect(render({ bin: notRepo }).text).not.toContain("branch");
    expect(render({ bin: notRepo }).text).not.toContain("⎇");
  });
});
