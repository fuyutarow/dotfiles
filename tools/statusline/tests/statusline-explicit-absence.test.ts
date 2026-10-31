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
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { err, fromThrowable, ok } from "neverthrow";
import { gpuSamplingSupported } from "../src/host-load.ts";
import { sysSegment } from "../src/host-display.ts";
import { jsonText, z } from "../src/zod.ts";
import {
  cleanupTempDirs,
  isolatedStatuslineEnv,
  tempDir,
  tempHome,
} from "./helpers.ts";
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
  repository?: boolean;
}): {
  text: string;
  home: string;
  renderMs: number;
} {
  const home = opts.home ?? tempHome();
  const cwd = tempDir("slcwd-");
  if (opts.repository === true) mkdirSync(join(cwd, ".git"));
  const sample = spawnSync(
    process.execPath,
    [
      "--preload",
      join(import.meta.dir, "gpu-isolation-preload.ts"),
      join(import.meta.dir, "sample-fixture.ts"),
    ],
    {
      input: JSON.stringify(opts.payload ?? {}),
      encoding: "utf8",
      cwd,
      env: isolatedStatuslineEnv({
        HOME: home,
        PATH: opts.bin,
        TZ: "UTC",
        ...opts.env,
      }),
      timeout: 15000,
    },
  );
  expect(sample.status, sample.stderr).toBe(0);
  const startedAt = performance.now();
  const r = spawnSync(
    process.execPath,
    [
      "--preload",
      join(import.meta.dir, "gpu-isolation-preload.ts"),
      STATUSLINE,
    ],
    {
      input: JSON.stringify(opts.payload ?? {}),
      encoding: "utf8",
      env: isolatedStatuslineEnv({
        HOME: home,
        PATH: opts.bin,
        TZ: "UTC",
        ...opts.env,
      }), // no inherited HERDR_*, session identity or real tools
      cwd,
    },
  );
  const renderMs = performance.now() - startedAt;
  expect(r.status).toBe(0);
  return { text: (r.stdout ?? "").replace(ANSI, ""), home, renderMs };
}
// Rendering consumes owner state and never starts a background sampler.
// A short sampler bound, so a hung nvidia-smi is named without waiting out the 20 s default.
const FAST_BOUND = { STATUSLINE_GPU_SAMPLE_TIMEOUT_MS: "500" };
const sysRow = (text: string): string =>
  text.split("\n").find((l) => l.startsWith("Sys:")) ?? "";

function seedCache(home: string, file: string, cache: unknown): void {
  mkdirSync(join(home, ".cache", "claude"), { recursive: true });
  writeFileSync(join(home, ".cache", "claude", file), JSON.stringify(cache));
}
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

function cacheFileState(path: string): "missing" | "valid" | "torn" {
  const read = fromThrowable(() => readFileSync(path, "utf8"))();
  if (read.isErr()) return "missing";
  return jsonText.safeParse(read.value).success ? "valid" : "torn";
}
const SysCacheSchema = z.object({ line: z.string() });

describe("statusline Sys row: VRAM", () => {
  test("capability gate keeps missing Linux samples explicit", () => {
    expect(gpuSamplingSupported("darwin", false)).toBe(false);
    expect(gpuSamplingSupported("darwin", true)).toBe(true);
    expect(gpuSamplingSupported("linux", false)).toBe(true);
    const keys: string[] = [];
    const row = sysSegment(
      ok(0),
      ok({ pct: 0, frac: "0/1G" }),
      err("missing sampler"),
      ok([]),
      [],
      (key, _label, state) => {
        keys.push(key);
        return state.kind === "unknown" ? state.reason : state.value;
      },
    );
    expect(keys.filter((key) => key === "gpu")).toHaveLength(1);
    expect(keys).not.toContain("vram");
    expect(row.match(/missing sampler/gu)).toHaveLength(1);
  });
  test("renders the owner's fresh sample without invoking a tool", async () => {
    const home = tempHome();
    const stateRoot = join(home, ".local", "state");
    const at = nowMs();
    await Bun.write(
      join(stateRoot, "gpu-owner.json"),
      JSON.stringify({
        schema: 1,
        attemptAt: at,
        sampledAt: at,
        devices: [],
        processes: [],
        samples: [
          ...[2, 1].map((minutes) => ({
            ts: at - minutes * 60_000,
            nextTs: at - (minutes - 1) * 60_000,
            utilPct: 0,
            memUsedGiB: 3.5,
            memTotalGiB: 12,
          })),
          {
            ts: at,
            nextTs: at + 60_000,
            utilPct: 0,
            memUsedGiB: 3.5,
            memTotalGiB: 12,
          },
        ],
      }),
    );
    const bin = binWith({ "nvidia-smi": "exit 99" });
    expect(sysRow(render({ home, bin }).text)).toContain(
      "GPU 0%/15m n=3 · VRAM 29% ( 3.5/12.0G)",
    );
  });
  test("missing and unresponsive owner state are explicit", async () => {
    const home = tempHome();
    const bin = binWith({ "nvidia-smi": "exec /bin/sleep 30" });
    const row = sysRow(render({ home, bin }).text);
    expect(row).toContain("GPU n/a (stale (GPU sampler state unavailable))");
    expect(row.match(/GPU sampler state unavailable/gu)).toHaveLength(1);
    expect(row).not.toContain("VRAM n/a");
    await Bun.write(
      join(home, ".local", "state", "gpu-owner.json"),
      JSON.stringify({
        schema: 1,
        attemptAt: nowMs(),
        unresponsiveSince: nowMs(),
        devices: [],
        processes: [],
        samples: [],
      }),
    );
    expect(sysRow(render({ home, bin }).text)).toContain("GPU stalled ");
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
    "macOS: no NVIDIA tool omits GPU regardless of owner state",
    () => {
      const row = sysRow(render({ bin: binWith({}) }).text);
      expect(row).not.toContain("GPU");
      expect(row).not.toContain("VRAM");
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
    expect(cached.line).toContain(IS_MAC ? "RAM n/a (no vm_stat)" : "VRAM ");
  });
});

describe("statusline other rows", () => {
  test(
    "Job: a failed process scan is n/a, not 'no jobs'",
    () => {
      const text = render({ bin: binWith({}) }).text;
      expect(text).toContain("Job: scan n/a (no ps)");
    },
    SLOW,
  );

  test("Job: a successful empty scan shows idle", () => {
    const bin = binWith({ ps: "exit 0" });
    expect(render({ bin }).text).toContain("Job: idle");
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
    SLOW,
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
    expect(text).toContain(
      "Rate: claude n/a (input has no Claude rate limits) · 5h n/a (input has no Claude 5h rate limit) · 7d n/a (input has no Claude 7d rate limit)",
    );
    expect(text).toContain("diff n/a (repository not sampled)");
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
    expect(render({ bin: binWith({}), repository: true }).text).toContain(
      "branch n/a (no git)",
    );
  });

  test("git's own 'not a git repository' means nothing to show: no branch at all", () => {
    const text = render({ bin: binWith({ git: NOT_REPO }) }).text;
    expect(text).not.toContain("branch");
    expect(text).not.toContain("⎇");
  });

  test(
    "any OTHER exit 128 (empty repo, dubious ownership) is n/a with git's reason",
    () => {
      const bin = binWith({
        git: "echo 'fatal: detected dubious ownership in repository at /x' >&2; exit 128",
      });
      expect(render({ bin, repository: true }).text).toContain(
        "branch n/a (detected dubious ownership in repository at /x)",
      );
    },
    SLOW,
  );

  test("a branch is shown as before", () => {
    const bin = binWith({ git: "echo main" });
    expect(render({ bin, repository: true }).text).toContain("⎇ main");
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

  test("a readable file with no account shows an unknown account", () => {
    const home = tempHome();
    writeClaudeJson(home, "{}");
    const text = render({ home, bin: binWith({}) }).text;
    expect(text).toContain("account n/a");
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
      const result = render({
        bin,
        home,
        payload: { session_id: "bounds-1" },
        env: FAST_BOUND,
      });
      const text = result.text;
      expect(result.renderMs).toBeLessThan(4000);
      expect(text).toContain("name n/a (claude agents timeout 3000ms)");
      expect(text).not.toContain("branch n/a");
      expect(text).toMatch(/scan n\/a \(ps timeout \d+ms\)/u);
      // nvidia-smi is not a render child any more (O4): its hang costs the render nothing, and the
      // bar says the sample is still being taken.
      expect(sysRow(text)).toContain(
        "GPU n/a (stale (GPU sampler state unavailable))",
      );
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
      render({ home, bin }); // Seed owner state before concurrent readers.
      const procs = Array.from({ length: 8 }, () =>
        Bun.spawn([process.execPath, STATUSLINE], {
          stdin: new Blob([JSON.stringify({ session_id: "bounds-2" })]),
          stdout: "ignore",
          stderr: "ignore",
          env: isolatedStatuslineEnv({ HOME: home, PATH: bin, TZ: "UTC" }),
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
    expect(text).toContain(
      "Rate: claude n/a (input has no Claude rate limits) · 5h n/a (input has no Claude 5h rate limit) · 7d n/a (input has no Claude 7d rate limit)",
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
});

afterAll(cleanupTempDirs);
