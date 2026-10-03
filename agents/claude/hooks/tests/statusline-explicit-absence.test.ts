// statusline-command.ts, EXPLICIT-ABSENCE law (2026-10-03): a reading the bar could not take is
// printed as `<label> n/a (<why>)`, never dropped from its row. Spawned as the real process
// with a fake PATH, so "nvidia-smi missing / hung / failing" and "ps missing" are real failures
// of the real subprocess calls, not stubs of the functions.

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tempDir, tempHome } from "./helpers.ts";

const STATUSLINE = join(import.meta.dir, "..", "..", "statusline-command.ts");
const ANSI = new RegExp("\u001b\\[[0-9;]*m", "g");
const nowMs = (): number => Temporal.Now.instant().epochMilliseconds;
// The hung-nvidia-smi cases spend a full 2 s bound per render (and two renders in a few); bun's
// 5 s default would make them fail on a loaded host, which is the very condition under test.
const SLOW = { timeout: 30_000 };
// CPU/RAM readings come from the host's own /proc; elsewhere they are n/a for a different reason.
const HAS_PROC = existsSync("/proc/stat");

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

function render(opts: { bin: string; home?: string; payload?: unknown }): {
  text: string;
  home: string;
} {
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

function seedCache(home: string, file: string, cache: unknown): void {
  mkdirSync(join(home, ".cache", "claude"), { recursive: true });
  writeFileSync(join(home, ".cache", "claude", file), JSON.stringify(cache));
}
const seedGpuCache = (home: string, cache: unknown): void =>
  seedCache(home, "statusline-gpu.json", cache);

describe("statusline Sys row: VRAM", () => {
  test("a working nvidia-smi shows the number", () => {
    const bin = binWith({ "nvidia-smi": "echo '3584, 12288'" });
    expect(sysRow(render({ bin }).text)).toContain("VRAM 29% (3.5/12.0G)");
  });

  test("no nvidia-smi is stated, not silently omitted", () => {
    const row = sysRow(render({ bin: binWith({}) }).text);
    expect(row).toContain("VRAM n/a (no nvidia-smi)");
  });

  test(
    "a hung nvidia-smi names the bound it hit (was: cached as 'no GPU')",
    () => {
      const bin = binWith({ "nvidia-smi": "exec /bin/sleep 6" });
      const row = sysRow(render({ bin }).text);
      expect(row).toContain("VRAM n/a (nvidia-smi timeout 2000ms)");
    },
    SLOW,
  );

  test("a killed nvidia-smi names the signal instead of a bare 'failed'", () => {
    const bin = binWith({ "nvidia-smi": "kill -9 $$" });
    expect(sysRow(render({ bin }).text)).toContain(
      "VRAM n/a (nvidia-smi killed by SIGKILL)",
    );
  });

  test(
    "a timeout is NOT cached as 'no GPU': the next render samples again",
    () => {
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
    },
    SLOW,
  );

  test(
    "a miss within the TTL is served from cache with its reason, without waiting out another timeout",
    () => {
      const home = tempHome();
      const slow = binWith({ "nvidia-smi": "exec /bin/sleep 6" });
      render({ home, bin: slow });
      const started = nowMs();
      const row = sysRow(render({ home, bin: slow }).text);
      expect(row).toContain("VRAM n/a (nvidia-smi timeout 2000ms)");
      // A re-sample would block for the whole 2000 ms bound; the cached miss must return sooner.
      expect(nowMs() - started).toBeLessThan(1900);
    },
    SLOW,
  );

  test("a failed sample shows the last good one, marked stale with age and reason", () => {
    const home = tempHome();
    const at = nowMs();
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
      at: nowMs() - 60_000,
      good: {
        at: nowMs() - 31 * 60_000,
        reading: { frac: "3.5/12.0G", pct: 29.2 },
      },
    });
    const row = sysRow(
      render({ home, bin: binWith({ "nvidia-smi": "exit 9" }) }).text,
    );
    expect(row).toContain("VRAM n/a (nvidia-smi exit 9)");
    expect(row).not.toContain("3.5/12.0G");
  });

  test("a cache entry stamped in the future (clock stepped back) is not 'fresh'", () => {
    const home = tempHome();
    seedGpuCache(home, {
      at: nowMs() + 3_600_000,
      reading: { frac: "9.9/12.0G", pct: 82 },
      good: {
        at: nowMs() + 3_600_000,
        reading: { frac: "9.9/12.0G", pct: 82 },
      },
    });
    const row = sysRow(
      render({ home, bin: binWith({ "nvidia-smi": "echo '3584, 12288'" }) })
        .text,
    );
    expect(row).toContain("VRAM 29% (3.5/12.0G)");
    expect(row).not.toContain("9.9/12.0G");
    expect(row).not.toContain("stale");
  });

  test("garbage output is 'unparsable', not a number", () => {
    const bin = binWith({ "nvidia-smi": "echo 'No devices were found'" });
    expect(sysRow(render({ bin }).text)).toContain(
      "VRAM n/a (nvidia-smi output unparsable)",
    );
  });

  test("the pre-fix cache shape ({reading:null}) is not trusted as 'no GPU'", () => {
    const home = tempHome();
    seedGpuCache(home, { at: nowMs(), reading: null });
    const bin = binWith({ "nvidia-smi": "echo '3584, 12288'" });
    expect(sysRow(render({ home, bin }).text)).toContain("VRAM 29%");
  });
});

describe("statusline Sys row: every reading is present", () => {
  test.skipIf(!HAS_PROC)(
    "CPU's first render says why it has no number; RAM, VRAM and Disk stay",
    () => {
      const row = sysRow(render({ bin: binWith({}) }).text);
      expect(row).toContain("CPU n/a (no earlier sample to diff against)");
      expect(row).toContain("RAM ");
      expect(row).toContain("VRAM ");
      expect(row).toContain("Disk ");
    },
  );

  test("without /proc the reasons name the missing file (macOS)", () => {
    if (HAS_PROC) return; // only meaningful where /proc is absent
    const row = sysRow(render({ bin: binWith({}) }).text);
    expect(row).toContain("CPU n/a (no /proc/stat)");
    expect(row).toContain("RAM n/a (no /proc/meminfo)");
  });

  test.skipIf(!HAS_PROC)("the second render has a CPU number", () => {
    const home = tempHome();
    render({ home, bin: binWith({}) });
    expect(sysRow(render({ home, bin: binWith({}) }).text)).toMatch(/CPU \d+%/);
  });

  test.skipIf(!HAS_PROC)(
    "a CPU baseline older than 60 s is n/a, not an average over some other period",
    () => {
      const home = tempHome();
      seedCache(home, "statusline-cpu.json", {
        total: 1,
        idle: 1,
        at: nowMs() - 10 * 60_000,
      });
      expect(sysRow(render({ home, bin: binWith({}) }).text)).toContain(
        "CPU n/a (no earlier sample from the last 60s)",
      );
    },
  );

  test("the snapshot the log hook reads carries the n/a too", () => {
    const { home } = render({ bin: binWith({}) });
    const cached = JSON.parse(
      readFileSync(
        join(home, ".cache", "claude", "statusline-sys.json"),
        "utf8",
      ),
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

  test("Job: an orphan with nothing admitted is spelled out, not `det×`", () => {
    const bin = binWith({ ps: "echo '    1  120 /x/scratchpad/leak.sh'" });
    const text = render({ bin }).text;
    expect(text).toContain("orphan×1");
    expect(text).not.toContain("det×");
  });

  test("Job: an orphan beside an admitted job is spelled out too", () => {
    const bin = binWith({
      ps:
        "echo '    9  120 /x/agent-resource-run --manifest /m/jobx.resource.json'\n" +
        "echo '    1  300 /x/scratchpad/leak.sh'",
    });
    const text = render({ bin }).text;
    expect(text).toContain("Job: jobx 2m00s orphan×1");
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
});

describe("statusline repo line: branch", () => {
  const NOT_REPO =
    "echo 'fatal: not a git repository (or any of the parent directories): .git' >&2; exit 128";

  test("no git on PATH is a failed lookup, shown as n/a", () => {
    expect(render({ bin: binWith({}) }).text).toContain(
      "⎇ branch n/a (no git)",
    );
  });

  test("git's own 'not a git repository' means nothing to show: no branch at all", () => {
    const text = render({ bin: binWith({ git: NOT_REPO }) }).text;
    expect(text).not.toContain("branch");
    expect(text).not.toContain("⎇");
  });

  test("any OTHER exit 128 (empty repo, dubious ownership) is n/a with git's reason", () => {
    const bin = binWith({
      git: "echo 'fatal: detected dubious ownership in repository at /x' >&2; exit 128",
    });
    expect(render({ bin }).text).toContain(
      "⎇ branch n/a (detected dubious ownership in repository at /x)",
    );
  });

  test("a branch is shown as before", () => {
    const bin = binWith({ git: "echo main" });
    expect(render({ bin }).text).toContain("⎇ main");
  });
});

describe("statusline identity and model caps", () => {
  const writeClaudeJson = (home: string, body: string): void =>
    writeFileSync(join(home, ".claude.json"), body);

  test("an unreadable ~/.claude.json makes the account and model caps n/a, not absent", () => {
    // tempHome() has no ~/.claude.json
    const text = render({
      bin: binWith({}),
      payload: { rate_limits: { five_hour: { used_percentage: 5 } } },
    }).text;
    expect(text).toContain("account n/a (~/.claude.json unreadable)");
    expect(text).toContain("model caps n/a (~/.claude.json unreadable)");
  });

  test("a readable file with an account shows the email and no n/a", () => {
    const home = tempHome();
    writeClaudeJson(
      home,
      JSON.stringify({ oauthAccount: { emailAddress: "a@b.c" } }),
    );
    const text = render({ home, bin: binWith({}) }).text;
    expect(text).toContain("a@b.c");
    expect(text).not.toContain("account n/a");
  });

  test("a readable file with no account is real absence: nothing printed", () => {
    const home = tempHome();
    writeClaudeJson(home, "{}");
    const text = render({ home, bin: binWith({}) }).text;
    expect(text).not.toContain("account");
    expect(text).not.toContain("model caps");
  });

  test("a drifted usage-limits shape makes only the caps n/a; the account survives", () => {
    const home = tempHome();
    writeClaudeJson(
      home,
      JSON.stringify({
        oauthAccount: { emailAddress: "a@b.c" },
        cachedUsageUtilization: { utilization: { limits: "not-an-array" } },
      }),
    );
    const text = render({
      home,
      bin: binWith({}),
      payload: { rate_limits: { five_hour: { used_percentage: 5 } } },
    }).text;
    expect(text).toContain("a@b.c");
    expect(text).toContain(
      "model caps n/a (~/.claude.json has an unexpected usage-limits shape)",
    );
  });
});

// ZOD FIRST: every external value is parsed by a schema; a file or payload of the wrong shape is
// "no usable input", never half-trusted.
describe("statusline trust boundaries (zod)", () => {
  test("a payload with a field of the wrong type names the field instead of rendering from it", () => {
    const text = render({
      bin: binWith({}),
      payload: { context_window: { total_input_tokens: "lots" } },
    }).text;
    expect(text).toContain(
      "invalid statusline payload: context_window.total_input_tokens:",
    );
    expect(text).not.toContain("Sys:");
  });

  test("nulls in the payload are one absent state (Claude Code sends null before the first reply)", () => {
    const text = render({
      bin: binWith({}),
      payload: {
        context_window: { total_input_tokens: 12_345, used_percentage: null },
        rate_limits: null,
      },
    }).text;
    expect(text).toContain("Ctx: 12.3k n/a");
    expect(text).toContain("Rate: n/a (no rate_limits in the payload)");
  });

  test("a GPU cache of the wrong shape is an empty cache: the sample is retaken", () => {
    const home = tempHome();
    seedGpuCache(home, { at: "yesterday", reading: { frac: 1, pct: "x" } });
    const bin = binWith({ "nvidia-smi": "echo '3584, 12288'" });
    expect(sysRow(render({ home, bin }).text)).toContain(
      "VRAM 29% (3.5/12.0G)",
    );
  });

  test("a CPU cache of the wrong shape is no baseline, not a crash", () => {
    if (!HAS_PROC) return;
    const home = tempHome();
    seedCache(home, "statusline-cpu.json", { total: "x", idle: null });
    expect(sysRow(render({ home, bin: binWith({}) }).text)).toContain(
      "CPU n/a (no earlier sample to diff against)",
    );
  });

  test("an empty-field nvidia-smi line is unparsable, not 0 MiB", () => {
    const bin = binWith({ "nvidia-smi": "echo ' , 12288'" });
    expect(sysRow(render({ bin }).text)).toContain(
      "VRAM n/a (nvidia-smi output unparsable)",
    );
  });
});
