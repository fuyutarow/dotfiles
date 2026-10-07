import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { admitCodexWorker, codexWorkerLimit } from "../src/admission.ts";
import { probeRoutes } from "../src/routes.ts";

const dirs: string[] = [];
const noClaude = (): string | null => null;
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe("route capability cache", () => {
  test("reuses a probe, then expires it after 24 hours or a version change", () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-dispatch-routes-"));
    dirs.push(dir);
    const cachePath = join(dir, "cache.json");
    let now = 10_000;
    let probes = 0;
    const deps = (version = "1.0") => ({
      host: "host-a",
      version,
      cachePath,
      now: () => now,
      codexProbe: () => {
        probes += 1;
        return { available: false, reason: "sandbox denied" };
      },
      claudePath: () => "/bin/claude",
    });

    expect(probeRoutes(deps()).codex.reason).toBe("sandbox denied");
    expect(probeRoutes(deps()).codex.reason).toBe("sandbox denied");
    expect(probes).toBe(1);
    now += 24 * 60 * 60 * 1000 + 1;
    probeRoutes(deps());
    expect(probes).toBe(2);
    probeRoutes(deps("2.0"));
    expect(probes).toBe(3);
  });

  test("reports missing routes and does not invent a claude executable", () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-dispatch-routes-"));
    dirs.push(dir);
    const routes = probeRoutes({
      host: "host-b",
      version: "1",
      cachePath: join(dir, "cache.json"),
      now: () => 1,
      codexProbe: () => ({ available: false, reason: "namespace denied" }),
      claudePath: noClaude,
    });
    expect(routes).toEqual({
      codex: { available: false, reason: "namespace denied" },
      claude: { available: false, reason: "claude is not on PATH" },
    });
  });
});

describe("codex worker admission", () => {
  test("computes the process-limit bound and accepts unlimited", () => {
    expect(codexWorkerLimit("500")).toBe(3);
    expect(codexWorkerLimit("unlimited")).not.toBeDefined();
    expect(codexWorkerLimit("500", 2)).toBe(2);
  });

  test("waits for the slot and refuses with the cause after the bound", async () => {
    let live = 1;
    const waits: number[] = [];
    let now = 0;
    const result = await admitCodexWorker({
      liveCodexWorkers: () => live,
      limit: 1,
      waitMs: 10,
      intervalMs: 5,
      now: () => now,
      sleep: (ms) => {
        waits.push(ms);
        now += ms;
        return Promise.resolve();
      },
      reportWait: () => {},
    });
    expect(waits.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.reason).toContain("codex worker limit reached (1/1)");
    live = 0;
    expect(
      await admitCodexWorker({
        liveCodexWorkers: () => live,
        limit: 1,
        waitMs: 10,
        intervalMs: 5,
        now: () => now,
        sleep: () => {
          now += 1;
          return Promise.resolve();
        },
        reportWait: () => {},
      }),
    ).toEqual({ ok: true });
  });
});
