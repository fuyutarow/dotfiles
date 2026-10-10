// statusline-command.ts, EXPLICIT-ABSENCE law (2026-10-03): a reading the bar could not take is
// printed as `<label> n/a (<why>)`, never dropped from its row. Spawned as the real process
// with a fake PATH, so "nvidia-smi missing / hung / failing" and "ps missing" are real failures
// of the real subprocess calls, not stubs of the functions.

import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fromThrowable } from "neverthrow";
import { jsonText, z } from "../src/zod.ts";
import { cleanupTempDirs, tempDir, tempHome } from "./helpers.ts";
import { decodedJson } from "./decode.ts";

const STATUSLINE = join(import.meta.dir, "..", "src", "statusline.ts");
const ESC = String.fromCodePoint(27); // not a literal \u001b: the pattern then has no control character
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, "gu");
const nowMs = (): number => Temporal.Now.instant().epochMilliseconds;
// The hung-nvidia-smi cases spend a full 2 s bound per render (and two renders in a few); bun's
// 5 s default would make them fail on a loaded host, which is the very condition under test.
const SLOW = { timeout: 30_000 };
// CPU/RAM readings come from the host's own /proc on Linux and from os.cpus()/vm_stat on macOS.
const HAS_PROC = existsSync("/proc/stat");
const IS_MAC = process.platform === "darwin";
const HAS_CPU = HAS_PROC || IS_MAC;

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
  env?: Record<string, string>;
}): {
  text: string;
  home: string;
} {
  const home = opts.home ?? tempHome();
  const r = spawnSync(process.execPath, [STATUSLINE], {
    input: JSON.stringify(opts.payload ?? {}),
    encoding: "utf8",
    env: { HOME: home, PATH: opts.bin, TZ: "UTC", ...opts.env }, // no inherited HERDR_*, no real tools
    cwd: tempDir("slcwd-"), // not a repo
  });
  expect(r.status).toBe(0);
  return { text: (r.stdout ?? "").replace(ANSI, ""), home };
}
// The GPU is sampled by a background process the render starts (Tiger ledger O4): a render shows
// what is cached and returns at once. The sampler holds statusline-gpu.lock until it has written
// the cache, so "the lock is gone" is "the sample is in".
const gpuLock = (home: string): string =>
  join(home, ".cache", "claude", "statusline-gpu.lock");
function waitForSampler(home: string): void {
  const deadline = nowMs() + 30_000;
  while (existsSync(gpuLock(home)) && nowMs() < deadline) Bun.sleepSync(25);
  expect(existsSync(gpuLock(home))).toBe(false);
}
// Render once (starting the sampler), wait for the sample, render again: the bar as a session
// sees it one refresh later.
function renderSettled(opts: Parameters<typeof render>[0]): {
  text: string;
  home: string;
} {
  const first = render(opts);
  waitForSampler(first.home);
  return render({ ...opts, home: first.home });
}
// A short sampler bound, so a hung nvidia-smi is named without waiting out the 20 s default.
const FAST_BOUND = { STATUSLINE_GPU_SAMPLE_TIMEOUT_MS: "500" };
const sysRow = (text: string): string =>
  text.split("\n").find((l) => l.startsWith("Sys:")) ?? "";

function seedCache(home: string, file: string, cache: unknown): void {
  mkdirSync(join(home, ".cache", "claude"), { recursive: true });
  writeFileSync(join(home, ".cache", "claude", file), JSON.stringify(cache));
}
const seedGpuCache = (home: string, cache: unknown): void => {
  seedCache(home, "statusline-gpu.json", cache);
};
// Read back a cache file the statusline wrote, parsed by a schema (never an annotation): a file
// of the wrong shape fails the test with zod's message instead of a confusing `undefined`.
function readCache<S extends z.ZodType>(
  home: string,
  file: string,
  schema: S,
): z.output<S> {
  const raw = readFileSync(join(home, ".cache", "claude", file), "utf8");
  return decodedJson(schema, raw);
}

function writeClaudeJson(home: string, body: string): void {
  writeFileSync(join(home, ".claude.json"), body);
}

function countingGpu(log: string, body: string): string {
  return `echo "$1" >> '${log}'\n${body}`;
}

function invocations(log: string): number {
  return existsSync(log)
    ? readFileSync(log, "utf8")
        .split("\n")
        .filter((line) => line.startsWith("--query-gpu=")).length
    : 0;
}

// What a concurrent reader would see: no file yet, a whole JSON document, or half of one.
function cacheFileState(path: string): "missing" | "valid" | "torn" {
  const read = fromThrowable(() => readFileSync(path, "utf8"))();
  if (read.isErr()) return "missing";
  return jsonText.safeParse(read.value).success ? "valid" : "torn";
}
const GpuMissSchema = z.object({
  at: z.number(),
  why: z.string().optional(),
  reading: z.unknown().optional(),
});
const SysCacheSchema = z.object({ line: z.string() });

describe("statusline Sys row: VRAM", () => {
  test("a warm estimate renders compactly beside VRAM with its sample count", () => {
    const home = tempHome();
    seedGpuCache(home, {
      at: nowMs(),
      reading: { frac: " 3.5/12.0G", pct: 29.2, gpuAvg15: 3, gpuSamples15: 42 },
    });
    const bin = binWith({ "nvidia-smi": "echo '0, 0, 3584, 12288'" });
    expect(sysRow(render({ home, bin }).text)).toContain(
      "VRAM 29% ( 3.5/12.0G) GPU≈3%/15m n=42",
    );
  });

  test("a working nvidia-smi shows the number", () => {
    const bin = binWith({ "nvidia-smi": "echo '0, 0, 3584, 12288'" });
    expect(sysRow(renderSettled({ bin }).text)).toContain(
      "VRAM 29% ( 3.5/12.0G)",
    );
  });

  // O4: the render never waits for nvidia-smi.
  test(
    "O4: a render does not wait for nvidia-smi: it says it is sampling and returns at once",
    () => {
      const bin = binWith({ "nvidia-smi": "exec /bin/sleep 6" });
      const started = nowMs();
      const first = render({
        bin,
        env: { STATUSLINE_GPU_SAMPLE_TIMEOUT_MS: "3000" },
      });
      expect(nowMs() - started).toBeLessThan(1900); // the old inline sample cost its whole 2 s bound
      expect(sysRow(first.text)).toContain("VRAM n/a (sampling in progress)");
      waitForSampler(first.home);
    },
    SLOW,
  );

  test(
    "O4: a sample slower than the old 2 s bound is an answer, not a failure",
    () => {
      const bin = binWith({
        "nvidia-smi": "/bin/sleep 3\necho '0, 0, 3584, 12288'",
      });
      const row = sysRow(renderSettled({ bin }).text);
      expect(row).toContain("VRAM 29% ( 3.5/12.0G)");
      // VRAM only: this PATH holds just the fake nvidia-smi, so on macOS RAM reads n/a (no vm_stat).
      expect(row).not.toContain("VRAM n/a");
    },
    SLOW,
  );

  test(
    "O4: while a sampler is running, the previous reading is shown with its age, never a gap",
    () => {
      const home = tempHome();
      const at = nowMs();
      seedGpuCache(home, {
        at: at - 20_000,
        reading: { frac: " 3.5/12.0G", pct: 29.2 },
        good: { at: at - 20_000, reading: { frac: " 3.5/12.0G", pct: 29.2 } },
      });
      const bin = binWith({
        "nvidia-smi": "/bin/sleep 2\necho '0, 0, 3584, 12288'",
      });
      const during = sysRow(render({ home, bin }).text);
      expect(during).toContain("VRAM 29% ( 3.5/12.0G)"); // 20 s old: plain, no marker under 60 s
      waitForSampler(home);
      expect(
        readCache(home, "statusline-gpu.json", GpuMissSchema).at,
      ).toBeGreaterThan(at);
    },
    SLOW,
  );

  test("O4: started by hand without the lock, the sampler refuses and writes nothing", () => {
    const home = tempHome();
    const r = spawnSync(process.execPath, [STATUSLINE], {
      encoding: "utf8",
      env: {
        HOME: home,
        PATH: binWith({ "nvidia-smi": "echo '1, 2'" }),
        TZ: "UTC",
        STATUSLINE_SAMPLE_GPU: "1",
      },
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("refusing to run without it");
    expect(
      existsSync(join(home, ".cache", "claude", "statusline-gpu.json")),
    ).toBe(false);
  });

  // Linux only: on a Mac no nvidia-smi means no discrete VRAM (see the macOS test below).
  test.skipIf(IS_MAC)("no nvidia-smi is stated, not silently omitted", () => {
    const row = sysRow(render({ bin: binWith({}) }).text);
    expect(row).toContain("VRAM n/a (no nvidia-smi)");
  });

  test(
    "a hung nvidia-smi names the bound it hit (was: cached as 'no GPU')",
    () => {
      const bin = binWith({ "nvidia-smi": "exec /bin/sleep 6" });
      const row = sysRow(renderSettled({ bin, env: FAST_BOUND }).text);
      expect(row).toContain("VRAM n/a (nvidia-smi timeout 500ms)");
    },
    SLOW,
  );

  test("a killed nvidia-smi names the signal instead of a bare 'failed'", () => {
    const bin = binWith({ "nvidia-smi": "kill -9 $$" });
    expect(sysRow(renderSettled({ bin }).text)).toContain(
      "VRAM n/a (nvidia-smi killed by SIGKILL)",
    );
  });

  test(
    "a timeout is NOT cached as 'no GPU': the next render samples again",
    () => {
      const home = tempHome();
      renderSettled({
        home,
        bin: binWith({ "nvidia-smi": "exec /bin/sleep 6" }),
        env: FAST_BOUND,
      });
      // Simulate time passing past the 5 s TTL, then a healthy driver.
      const failed = readCache(home, "statusline-gpu.json", GpuMissSchema);
      expect(failed.why).toBe("nvidia-smi timeout 500ms");
      expect(failed.reading ?? null).toBeNull();
      seedGpuCache(home, { ...failed, at: failed.at - 60_000 });
      const bin = binWith({ "nvidia-smi": "echo '0, 0, 3584, 12288'" });
      expect(sysRow(renderSettled({ home, bin }).text)).toContain(
        "VRAM 29% ( 3.5/12.0G)",
      );
    },
    SLOW,
  );

  test(
    "a miss within the TTL is served from cache with its reason, without waiting out another timeout",
    () => {
      const home = tempHome();
      const slow = binWith({ "nvidia-smi": "exec /bin/sleep 6" });
      renderSettled({ home, bin: slow, env: FAST_BOUND });
      const started = nowMs();
      const row = sysRow(render({ home, bin: slow, env: FAST_BOUND }).text);
      expect(row).toContain("VRAM n/a (nvidia-smi timeout 500ms)");
      // Served from the cached miss: no second sampler starts inside the TTL.
      expect(existsSync(gpuLock(home))).toBe(false);
      expect(nowMs() - started).toBeLessThan(1900);
    },
    SLOW,
  );

  test("a failed sample shows the last good one, marked stale with age and reason once it is 60 s old", () => {
    const home = tempHome();
    const at = nowMs();
    seedGpuCache(home, {
      at: at - 120_000,
      why: "nvidia-smi timeout 2000ms",
      good: { at: at - 90_000, reading: { frac: " 3.5/12.0G", pct: 29.2 } },
    });
    const row = sysRow(
      renderSettled({ home, bin: binWith({ "nvidia-smi": "exit 9" }) }).text,
    );
    expect(row).toContain("VRAM 29% ( 3.5/12.0G)");
    expect(row).toMatch(/stale (9[0-9])s \(nvidia-smi exit 9\)/u);
  });

  test("a last-good under 60 s old is shown plainly: that age is the normal case, not news", () => {
    const home = tempHome();
    const at = nowMs();
    seedGpuCache(home, {
      at: at - 60_000,
      why: "nvidia-smi timeout 2000ms",
      good: { at: at - 40_000, reading: { frac: " 3.5/12.0G", pct: 29.2 } },
    });
    const row = sysRow(
      renderSettled({ home, bin: binWith({ "nvidia-smi": "exit 9" }) }).text,
    );
    expect(row).toContain("VRAM 29% ( 3.5/12.0G)");
    expect(row).not.toContain("stale");
  });

  test("a last-good older than 30 min is n/a, not a stale number", () => {
    const home = tempHome();
    seedGpuCache(home, {
      at: nowMs() - 60_000,
      good: {
        at: nowMs() - 31 * 60_000,
        reading: { frac: " 3.5/12.0G", pct: 29.2 },
      },
    });
    const row = sysRow(
      renderSettled({ home, bin: binWith({ "nvidia-smi": "exit 9" }) }).text,
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
      renderSettled({
        home,
        bin: binWith({ "nvidia-smi": "echo '0, 0, 3584, 12288'" }),
      }).text,
    );
    expect(row).toContain("VRAM 29% ( 3.5/12.0G)");
    expect(row).not.toContain("9.9/12.0G");
    expect(row).not.toContain("stale");
  });

  test("garbage output is 'unparsable', not a number", () => {
    const bin = binWith({ "nvidia-smi": "echo 'No devices were found'" });
    expect(sysRow(renderSettled({ bin }).text)).toContain(
      "VRAM n/a (nvidia-smi output unparsable)",
    );
  });

  test("the pre-fix cache shape ({reading:null}) is not trusted as 'no GPU'", () => {
    const home = tempHome();
    seedGpuCache(home, { at: nowMs(), reading: null });
    const bin = binWith({ "nvidia-smi": "echo '0, 0, 3584, 12288'" });
    expect(sysRow(renderSettled({ home, bin }).text)).toContain("VRAM 29%");
  });
});

describe("statusline Sys row: every reading is present", () => {
  test.skipIf(!HAS_CPU)(
    "CPU's first render says why it has no number; RAM and Disk stay",
    () => {
      const row = sysRow(render({ bin: binWith({}) }).text);
      expect(row).toContain("CPU n/a (no earlier sample to diff against)");
      expect(row).toContain("RAM ");
      expect(row).toContain("Disk ");
    },
  );

  test.skipIf(!IS_MAC)(
    "macOS: no nvidia-smi means no discrete VRAM, so no VRAM segment",
    () => {
      expect(sysRow(render({ bin: binWith({}) }).text)).not.toContain("VRAM");
    },
  );

  test.skipIf(!IS_MAC)(
    "macOS: RAM is Activity Monitor's used (app + wired + compressed) from vm_stat",
    () => {
      // 16 KiB pages: wired 65536 (1 GiB) + compressed 65536 (1 GiB) + anonymous 131072 - purgeable
      // 65536 (1 GiB) = 3 GiB used; free pages (near zero on a Mac) play no part.
      const vmStat = [
        "Mach Virtual Memory Statistics: (page size of 16384 bytes)",
        "Pages free:                               12.",
        "Pages wired down:                      65536.",
        "Pages purgeable:                       65536.",
        "Anonymous pages:                      131072.",
        "Pages occupied by compressor:          65536.",
      ];
      const bin = binWith({
        vm_stat: vmStat.map((l) => `echo '${l}'`).join("\n"),
      });
      expect(sysRow(render({ bin }).text)).toMatch(
        /RAM +\d+% \( ?3\.0\/\d+\.\dG\)/u,
      );
    },
  );

  test.skipIf(!IS_MAC)(
    "macOS: no vm_stat, or output it cannot read, is n/a with the reason",
    () => {
      expect(sysRow(render({ bin: binWith({}) }).text)).toContain(
        "RAM n/a (no vm_stat)",
      );
      const bin = binWith({ vm_stat: "echo 'nothing useful'" });
      expect(sysRow(render({ bin }).text)).toContain(
        "RAM n/a (vm_stat output unparsable)",
      );
    },
  );

  test.skipIf(!HAS_CPU)("the second render has a CPU number", () => {
    const home = tempHome();
    render({ home, bin: binWith({}) });
    expect(sysRow(render({ home, bin: binWith({}) }).text)).toMatch(
      /CPU +\d+%/u,
    );
  });

  test.skipIf(!HAS_CPU)(
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
    const cached = readCache(home, "statusline-sys.json", SysCacheSchema);
    // No tool on PATH: Linux lacks nvidia-smi, macOS lacks vm_stat — each is n/a there.
    expect(cached.line).toContain(
      IS_MAC ? "RAM n/a (no vm_stat)" : "VRAM n/a (no nvidia-smi)",
    );
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

  test.each([
    ["02:00", "2m00s"],
    ["1-02:03:04", "26h03m"],
    ["120", "2m00s"], // a bare number is seconds (etimes' shape)
  ])(
    "Job: ps's etime %s ([[dd-]hh:]mm:ss on both procps and BSD ps) reads as %s",
    (etime, shown) => {
      const bin = binWith({
        ps: `echo '    9  ${etime} /x/agent-resource-run --manifest /m/jobx.resource.json'`,
      });
      expect(render({ bin }).text).toContain(`Job: jobx ${shown}`);
    },
  );

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
    expect(text).toContain("Rate: claude n/a · 5h n/a · 7d n/a");
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
    expect(text).toContain("Ctx: 0  0%");
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

// TIGER STYLE (practicing-tiger-style, 2026-10-03): the bar runs every 5 s in every session, so its
// worst case — not its typical case — is what the host pays for.
describe("statusline resource bounds", () => {
  const HANG = "exec /bin/sleep 8";

  test(
    "O1: every child hanging still ends inside the render budget, each segment an explicit n/a",
    () => {
      // ps + git + nvidia-smi + claude agents, each hung: unbudgeted that is 2+2+2+3 = 9 s, longer
      // than the 5 s refresh, so renders would overlap and pile load on a loaded host.
      const bin = binWith({
        ps: HANG,
        git: HANG,
        "nvidia-smi": HANG,
        claude: HANG,
      });
      const home = tempHome();
      const started = nowMs();
      const text = render({
        bin,
        home,
        payload: { session_id: "bounds-1" },
        env: FAST_BOUND,
      }).text;
      const took = nowMs() - started;
      expect(took).toBeLessThan(6000); // budget 4 s + herdr + process start; unbudgeted ≥ 9 s
      expect(text).toContain("name n/a (name timeout 3000ms)");
      expect(text).toMatch(/branch n\/a \(git timeout \d+ms\)/u);
      expect(text).toContain("scan n/a (process scan timeout 2000ms)");
      // nvidia-smi is not a render child any more (O4): its hang costs the render nothing, and the
      // bar says the sample is still being taken.
      expect(sysRow(text)).toContain("VRAM n/a (sampling in progress)");
      waitForSampler(home);
    },
    SLOW,
  );

  test(
    "O2: concurrent renders never leave a reader a torn cache file or a stray temp file",
    async () => {
      const home = tempHome();
      const bin = binWith({ "nvidia-smi": "echo '0, 0, 3584, 12288'" });
      const cacheDir = join(home, ".cache", "claude");
      const files = ["statusline-gpu.json", "statusline-cpu.json"];
      const procs = Array.from({ length: 8 }, () =>
        Bun.spawn([process.execPath, STATUSLINE], {
          stdin: new Blob([JSON.stringify({ session_id: "bounds-2" })]),
          stdout: "ignore",
          stderr: "ignore",
          env: { HOME: home, PATH: bin, TZ: "UTC" },
          cwd: tempDir("slcwd-"),
        }),
      );
      // Poll every cache file while the writers run; a file that exists must always be whole.
      const poll = (): number => {
        const states = files
          .map((f) => cacheFileState(join(cacheDir, f)))
          .filter((s) => s !== "missing"); // not written yet
        for (const state of states) expect(state).toBe("valid"); // "torn" = half a write
        return states.length;
      };
      let reads = 0;
      while (procs.some((p) => p.exitCode === null)) {
        reads += poll();
        await Bun.sleep(1);
      }
      await Promise.all(procs.map((p) => p.exited));
      expect(reads).toBeGreaterThan(0);
      const left = readdirSync(cacheDir).filter((n) => n.endsWith(".tmp"));
      expect(left).toEqual([]);
    },
    SLOW,
  );

  // O3: one utilisation sampler host-wide. Count utilisation queries separately from the
  // once-per-minute compute-app probe for the ccc indexing badge (same sampler, sequential).
  test(
    "O3: six concurrent renders start one GPU sampler; each says it is sampling",
    async () => {
      const home = tempHome();
      const log = join(tempDir("slog-"), "gpu.log");
      const bin = binWith({
        "nvidia-smi": countingGpu(
          log,
          "/bin/sleep 1\necho '0, 0, 3584, 12288'",
        ),
      });
      const outputs = await Promise.all(
        Array.from({ length: 6 }, async () => {
          const p = Bun.spawn([process.execPath, STATUSLINE], {
            stdin: new Blob([JSON.stringify({})]),
            stdout: "pipe",
            stderr: "ignore",
            env: { HOME: home, PATH: bin, TZ: "UTC" },
            cwd: tempDir("slcwd-"),
          });
          const text = await new Response(p.stdout).text();
          await p.exited;
          return text.replace(ANSI, "");
        }),
      );
      waitForSampler(home);
      expect(invocations(log)).toBe(1);
      expect(
        readFileSync(log, "utf8")
          .split("\n")
          .filter((line) => line.startsWith("--query-compute-apps=")).length,
      ).toBe(1);
      // Every session names what it is waiting for — none is silent about VRAM.
      for (const r of outputs.map((output) => sysRow(output))) {
        expect(r).toContain("VRAM n/a (sampling in progress)");
      }
      // One refresh later every session reads the one shared sample.
      expect(sysRow(render({ home, bin }).text)).toContain(
        "VRAM 29% ( 3.5/12.0G)",
      );
      expect(invocations(log)).toBe(1);
    },
    SLOW,
  );

  test("O3: a lock older than the sample bound plus margin belongs to a crashed sampler and is broken", () => {
    const home = tempHome();
    const lock = join(home, ".cache", "claude", "statusline-gpu.lock");
    mkdirSync(lock, { recursive: true });
    const oldSecs = (nowMs() - 60_000) / 1000; // utimes takes epoch seconds; no Date (banned)
    utimesSync(lock, oldSecs, oldSecs);
    const bin = binWith({ "nvidia-smi": "echo '0, 0, 3584, 12288'" });
    expect(sysRow(renderSettled({ home, bin }).text)).toContain(
      "VRAM 29% ( 3.5/12.0G)",
    );
    expect(existsSync(lock)).toBe(false); // released after the sample
  });

  test("O3: while another session holds the lock, no second nvidia-smi starts and the last good value is shown stale", () => {
    const home = tempHome();
    const log = join(tempDir("slog-"), "gpu.log");
    mkdirSync(join(home, ".cache", "claude", "statusline-gpu.lock"), {
      recursive: true,
    });
    seedGpuCache(home, {
      at: nowMs() - 60_000,
      good: {
        at: nowMs() - 30_000,
        reading: { frac: " 3.5/12.0G", pct: 29.2 },
      },
    });
    const bin = binWith({ "nvidia-smi": countingGpu(log, "echo '1, 2'") });
    const row = sysRow(render({ home, bin }).text);
    expect(invocations(log)).toBe(0);
    expect(row).toContain("VRAM 29% ( 3.5/12.0G)");
    // 30 s old: under the 60 s marker threshold, so the value shows plainly.
    expect(row).not.toContain("stale");
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
    expect(text).toContain("Rate: claude n/a · 5h n/a · 7d n/a");
  });

  test("a GPU cache of the wrong shape is an empty cache: the sample is retaken", () => {
    const home = tempHome();
    seedGpuCache(home, { at: "yesterday", reading: { frac: 1, pct: "x" } });
    const bin = binWith({ "nvidia-smi": "echo '0, 0, 3584, 12288'" });
    expect(sysRow(renderSettled({ home, bin }).text)).toContain(
      "VRAM 29% ( 3.5/12.0G)",
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
    expect(sysRow(renderSettled({ bin }).text)).toContain(
      "VRAM n/a (nvidia-smi output unparsable)",
    );
  });
});

afterAll(cleanupTempDirs);
