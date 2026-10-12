import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cccBadge,
  cccObservation,
  sampleCccIndexing,
} from "../src/ccc-indexing.ts";
import { memSegment } from "../src/host-load.ts";

test("GPU segment fixture shows long indexing only; idle, young and stale are silent", () => {
  const now = Temporal.Now.instant().epochMilliseconds;
  const active = { at: now, since: now - 16 * 60_000, pid: 42 };
  expect(
    memSegment("VRAM", { frac: "2/16G", pct: 12.5, cccIndexing: active }),
  ).toContain("ccc indexing 16m");
  expect(
    memSegment("VRAM", {
      frac: "2/16G",
      pct: 12.5,
      cccIndexing: { ...active, since: null },
    }),
  ).not.toContain("ccc indexing");
  expect(
    cccBadge({ ...active, since: now - 15 * 60_000 }, now),
  ).toBeUndefined();
  expect(cccBadge({ ...active, at: now - 76_000 }, now)).toBeUndefined();
  expect(cccBadge({ ...active, at: now + 1 }, now)).toBeUndefined();
  expect(cccObservation(active, 43, true, now).since).toBe(now);
  expect(cccObservation(active, 42, false, now).since).toBeNull();
  expect(cccObservation(active, 42, true, now).since).toBe(active.since);
});

test("sampler uses GPU PID plus daemon indexing, caches probes and resets idle", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ccc-indexing-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(dir, { recursive: true, force: true }),
  };
  const nvidia = join(dir, "nvidia-smi");
  const ccc = join(dir, "ccc");
  const calls = join(dir, "calls");
  const procRoot = join(dir, "proc");
  await mkdir(join(procRoot, "42"), { recursive: true });
  await writeFile(
    join(procRoot, "42/cmdline"),
    "python\0/repo/cocoindex/ccc-daemon-launch.py\0",
  );
  await writeFile(
    nvidia,
    `#!/bin/sh\nprintf 'gpu\\n' >> '${calls}'\nprintf '42\\n'\n`,
    { mode: 0o755 },
  );
  await writeFile(
    ccc,
    `#!/bin/sh\nprintf 'ccc\\n' >> '${calls}'\nprintf '/repo [indexing]\\n'\n`,
    { mode: 0o755 },
  );
  let now = 1_000_000;
  const options = {
    cachePath: join(dir, "cache.json"),
    nvidia,
    ccc,
    procRoot,
    now: () => now,
    boundMs: 5_000,
    policyStatusPaths: [join(dir, "policy.json")],
  };
  const first = await sampleCccIndexing(options);
  expect(first.since).toBe(now);
  now += 30_000;
  expect(await sampleCccIndexing(options)).toEqual(first);
  expect((await readFile(calls, "utf8")).trim().split("\n")).toHaveLength(2);
  now += 31_000;
  expect((await sampleCccIndexing(options)).since).toBe(first.since);
  await writeFile(ccc, "#!/bin/sh\nprintf '/repo [idle]\\n'\n", {
    mode: 0o755,
  });
  now += 61_000;
  expect((await sampleCccIndexing(options)).since).toBeNull();
  await writeFile(nvidia, "#!/bin/sh\nexec sleep 5\n", { mode: 0o755 });
  now += 61_000;
  const start = performance.now();
  expect(
    (await sampleCccIndexing({ ...options, boundMs: 100 })).pid,
  ).toBeNull();
  expect(performance.now() - start).toBeLessThan(1_000);
}, 20_000);

test("CPU deferral is visible immediately, expires, and clears when GPU policy resumes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ccc-deferred-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(dir, { recursive: true, force: true }),
  };
  const policyStatusPath = join(dir, "policy.json");
  const now = 1_000_000;
  await writeFile(
    policyStatusPath,
    JSON.stringify({
      at: now,
      pid: 42,
      deferring: true,
      reason: "GPU reservation live",
    }),
  );
  const options = {
    cachePath: join(dir, "cache.json"),
    policyStatusPaths: [policyStatusPath],
    nvidia: join(dir, "missing-nvidia"),
    now: () => now,
  };
  const deferred = await sampleCccIndexing(options);
  expect(cccBadge(deferred, now)).toBe("ccc deferring (GPU reservation live)");
  expect(cccBadge(deferred, now + 76_000)).toBeUndefined();
  await writeFile(
    policyStatusPath,
    JSON.stringify({
      at: now,
      pid: 42,
      deferring: false,
      reason: null,
    }),
  );
  expect(cccBadge(await sampleCccIndexing(options), now)).toBeUndefined();
  await writeFile(policyStatusPath, "corrupt");
  expect(cccBadge(await sampleCccIndexing(options), now)).toBeUndefined();
});

test("the newest fresh policy signal wins across runtime and SSH status paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ccc-policy-paths-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(dir, { recursive: true, force: true }),
  };
  const primary = join(dir, "runtime.json");
  const fallback = join(dir, "ssh.json");
  let now = 1_000_000;
  await writeFile(
    primary,
    JSON.stringify({
      at: now - 1000,
      pid: 42,
      deferring: false,
      reason: null,
    }),
  );
  await writeFile(
    fallback,
    JSON.stringify({
      at: now,
      pid: 42,
      deferring: true,
      reason: "GPU reservation live",
    }),
  );
  const options = {
    cachePath: join(dir, "cache.json"),
    policyStatusPaths: [primary, fallback],
    nvidia: join(dir, "missing-nvidia"),
    now: () => now,
  };
  expect(cccBadge(await sampleCccIndexing(options), now)).toContain(
    "GPU reservation live",
  );
  now += 1000;
  await writeFile(
    primary,
    JSON.stringify({
      at: now,
      pid: 42,
      deferring: false,
      reason: null,
    }),
  );
  expect(cccBadge(await sampleCccIndexing(options), now)).toBeUndefined();
});
