import { afterEach, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GpuOutputSchema,
  gpuEstimate,
  gpuSampleInterval,
  readGpuSamples,
  sampleGpu,
  type GpuSample,
} from "../../shared/src/gpu-samples.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "gpu-samples-"));
  dirs.push(dir);
  const executable = join(dir, "nvidia-smi");
  const calls = join(dir, "calls");
  writeFileSync(
    executable,
    `#!${process.execPath}\nimport { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(calls)}, "x");\nif (process.argv[2] !== "--query-gpu=utilization.gpu,utilization.memory,memory.used,memory.total" || process.argv[3] !== "--format=csv,noheader,nounits") process.exit(1);\nprocess.stdout.write("0, 19, 255, 12288\\n");\n`,
  );
  chmodSync(executable, 0o755);
  return {
    dir,
    calls,
    options: {
      path: dir,
      fallbacks: [],
      statePath: join(dir, "samples.jsonl"),
      random: () => 0.5,
    },
  };
}
function row(ts: number, utilPct = 0, interval = 10_000): GpuSample {
  return {
    ts,
    utilPct,
    memUsedGiB: 0.25,
    memTotalGiB: 12,
    nextTs: ts + interval,
  };
}
test("exact NVIDIA outputs validate units and field order without inventing 100", () => {
  for (const output of ["0, 19, 255, 12288", "0 %, 19 %, 255 MiB, 12288 MiB"]) {
    expect(GpuOutputSchema.safeParse(output)).toEqual({
      success: true,
      data: { utilPct: 0, memUsedGiB: 255 / 1024, memTotalGiB: 12 },
    });
  }
  for (const output of [
    "[N/A], 19, 255, 12288",
    "0, [N/A], 255, 12288",
    "0, 19, [N/A], 12288",
    "0, 19, 255, [N/A]",
    "0,19,12289,12288",
    "101,19,255,12288",
    "0,19,,12288",
    "0,19,255,0",
  ])
    expect(GpuOutputSchema.safeParse(output).success).toBe(false);
});
test("averages are null below three samples and windows exclude old samples", () => {
  expect(gpuEstimate([], 0)).toBe("unknown");
  expect(gpuEstimate([row(0, 100), row(10_000)], 10_000)).toMatchObject({
    nowPct: 0,
    avg15Pct: null,
    avg60Pct: null,
    samples15: 2,
  });
  expect(
    gpuEstimate([row(0, 100), row(10_000), row(20_000)], 20_000),
  ).toMatchObject({ avg15Pct: 100 / 3, avg60Pct: 100 / 3, samples15: 3 });
  expect(
    gpuEstimate(
      [row(0, 100), row(910_000), row(920_000), row(930_000)],
      930_000,
    ),
  ).toMatchObject({ avg15Pct: 0, avg60Pct: 25, samples15: 3 });
});
test("jittered 15-minute estimates distinguish bursts from saturation across seeds", () => {
  for (let seed = 1; seed <= 200; seed++) {
    let state = seed;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
    const samples: GpuSample[] = [];
    for (let ts = 0; ts <= 900_000;) {
      const interval = gpuSampleInterval(random);
      expect(interval).toBeGreaterThanOrEqual(10_000);
      expect(interval).toBeLessThanOrEqual(20_000);
      samples.push(row(ts, ts % 200_000 < 2_000 ? 100 : 0, interval));
      ts += interval;
    }
    const estimate = gpuEstimate(samples, 900_000);
    expect(estimate).not.toBe("unknown");
    if (estimate !== "unknown") expect(estimate.avg15Pct).toBeLessThan(20);
    const busy = gpuEstimate(
      samples.map((s) => Object.assign({}, s, { utilPct: 100 })),
      900_000,
    );
    expect(busy).toMatchObject({ avg15Pct: 100 });
  }
});
test("shared reads persist atomic history and enforce the stored jitter deadline", () => {
  const { calls, options } = fixture();
  expect(sampleGpu({ ...options, now: 100_000 })).toMatchObject({
    ok: true,
    value: { samples15: 1, nowPct: 0 },
  });
  expect(sampleGpu({ ...options, now: 109_999 })).toMatchObject({
    ok: true,
    value: { samples15: 1 },
  });
  expect(sampleGpu({ ...options, now: 114_999 })).toMatchObject({
    ok: true,
    value: { samples15: 1 },
  });
  expect(readFileSync(calls, "utf8")).toBe("x");
  expect(sampleGpu({ ...options, now: 115_000 })).toMatchObject({
    ok: true,
    value: { samples15: 2 },
  });
  expect(sampleGpu({ ...options, now: 130_000 })).toMatchObject({
    ok: true,
    value: { samples15: 3, avg15Pct: 0 },
  });
  expect(readFileSync(calls, "utf8")).toBe("xxx");
  expect(readGpuSamples(options.statePath, 130_000)).toHaveLength(3);
});
test("corrupt history is discarded and replaced; expired and future history is excluded", () => {
  const { options } = fixture();
  writeFileSync(options.statePath, `${JSON.stringify(row(0, 100))}\n{bad\n`);
  expect(readGpuSamples(options.statePath, 100_000)).toEqual([]);
  expect(sampleGpu({ ...options, now: 100_000 })).toMatchObject({
    ok: true,
    value: { samples15: 1, avg15Pct: null },
  });
  expect(readGpuSamples(options.statePath, 100_000)).toHaveLength(1);
  expect(readGpuSamples(options.statePath, 99_999)).toEqual([]);
  expect(readGpuSamples(options.statePath, 8_000_000)).toEqual([]);
  writeFileSync(options.statePath, "x".repeat(1024 * 1024 + 1));
  expect(readGpuSamples(options.statePath, 100_000)).toEqual([]);
});

test("concurrent processes share one sample without torn writes or leftover locks", async () => {
  const { dir, calls, options } = fixture();
  const module = join(import.meta.dir, "../../shared/src/gpu-samples.ts");
  const script = `import { sampleGpu } from ${JSON.stringify(module)}; process.stdout.write(JSON.stringify(sampleGpu(${JSON.stringify(options)})));`;
  const outputs = await Promise.all(
    Array.from({ length: 6 }, async () => {
      const child = Bun.spawn([process.execPath, "-e", script], {
        stdout: "pipe",
        stderr: "pipe",
        timeout: 5_000,
      });
      const [out, stderr, exit] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(exit).toBe(0);
      expect(stderr).toBe("");
      return out;
    }),
  );
  expect(outputs.some((s) => s.includes('"ok":true'))).toBe(true);
  expect(readFileSync(calls, "utf8")).toBe("x");
  expect(
    readGpuSamples(options.statePath, Temporal.Now.instant().epochMilliseconds),
  ).toHaveLength(1);
  expect(existsSync(`${options.statePath}.lock`)).toBe(false);
  expect(readdirSync(dir).some((s) => s.endsWith(".tmp"))).toBe(false);
});

test("writing prunes the two-hour history and never exceeds 721 samples", () => {
  const { options } = fixture();
  const rows = Array.from({ length: 721 }, (_, i) => row(i * 10_000));
  writeFileSync(
    options.statePath,
    `${rows.map((s) => JSON.stringify(s)).join("\n")}\n`,
  );
  expect(sampleGpu({ ...options, now: 7_210_000 })).toMatchObject({ ok: true });
  const retained = readGpuSamples(options.statePath, 7_210_000);
  expect(retained).toHaveLength(721);
  expect(retained[0]?.ts).toBe(10_000);
  expect(retained.at(-1)?.ts).toBe(7_210_000);
});
