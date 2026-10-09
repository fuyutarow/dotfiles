import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
    const dir = mkdtempSync(join(tmpdir(), "agx-routes-"));
    dirs.push(dir);
    const cachePath = join(dir, "cache.json");
    let now = 10_000;
    let probes = 0;
    const deps = (version = "1.0") => ({
      host: "host-a",
      version,
      cachePath,
      hostFile: join(dir, "host.toml"),
      now: () => now,
      codexLoggedIn: () => true,
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
    const dir = mkdtempSync(join(tmpdir(), "agx-routes-"));
    dirs.push(dir);
    const routes = probeRoutes({
      host: "host-b",
      version: "1",
      cachePath: join(dir, "cache.json"),
      hostFile: join(dir, "host.toml"),
      now: () => 1,
      codexLoggedIn: () => true,
      codexProbe: () => ({ available: false, reason: "namespace denied" }),
      claudePath: noClaude,
    });
    expect(routes).toEqual({
      codex: { available: false, reason: "namespace denied" },
      claude: { available: false, reason: "claude is not on PATH" },
    });
  });
  test("a valid host declaration enables codex when the sandbox probe fails", () => {
    const dir = mkdtempSync(join(tmpdir(), "agx-routes-"));
    dirs.push(dir);
    const hostFile = join(dir, "host.toml");
    writeFileSync(
      hostFile,
      'schema = 1\nunsandboxed_reason = "Vast container is the isolation"\n',
    );
    const routes = probeRoutes({
      host: "host-c",
      version: "1",
      cachePath: join(dir, "cache.json"),
      hostFile,
      now: () => 1,
      codexLoggedIn: () => true,
      codexProbe: () => ({ available: false, reason: "sandbox denied" }),
      claudePath: noClaude,
    });

    expect(routes.codex).toEqual({
      available: true,
      reason:
        "unsandboxed by host declaration: Vast container is the isolation",
    });
  });

  test("an invalid host declaration is unavailable with agx validation", () => {
    const dir = mkdtempSync(join(tmpdir(), "agx-routes-"));
    dirs.push(dir);
    const hostFile = join(dir, "host.toml");
    writeFileSync(hostFile, 'schema = 1\nunsandboxed_reason = "  "\n');
    const routes = probeRoutes({
      host: "host-d",
      version: "1",
      cachePath: join(dir, "cache.json"),
      hostFile,
      now: () => 1,
      codexLoggedIn: () => true,
      codexProbe: () => ({ available: false, reason: "sandbox denied" }),
      claudePath: noClaude,
    });

    expect(routes.codex.available).toBe(false);
    expect(routes.codex.reason).toContain(
      `${hostFile} is not a valid host declaration`,
    );
    expect(routes.codex.reason).toContain(
      "unsandboxed_reason: Too small: expected string to have >=1 characters",
    );
  });

  test("a legacy host declaration refuses the route with the exact move command", () => {
    const dir = mkdtempSync(join(tmpdir(), "agx-routes-"));
    dirs.push(dir);
    const hostFile = join(dir, "agx", "host.toml");
    const legacyDirectory = ["codex", "-run"].join("");
    const legacyFile = join(dir, legacyDirectory, "host.toml");
    mkdirSync(join(dir, legacyDirectory), { recursive: true });
    writeFileSync(
      legacyFile,
      'schema = 1\nunsandboxed_reason = "This host is the isolation"\n',
    );
    const routes = probeRoutes({
      host: "host-legacy",
      version: "1",
      cachePath: join(dir, "cache.json"),
      hostFile,
      now: () => 1,
      codexLoggedIn: () => true,
      codexProbe: () => ({ available: true, reason: "sandbox available" }),
      claudePath: noClaude,
    });

    expect(routes.codex.available).toBe(false);
    expect(routes.codex.reason).toBe(
      `legacy host declaration found; run: mv "${legacyFile}" "${hostFile}"`,
    );
  });

  test("adding a declaration invalidates a cached unavailable route", () => {
    const dir = mkdtempSync(join(tmpdir(), "agx-routes-"));
    dirs.push(dir);
    const hostFile = join(dir, "host.toml");
    const deps = {
      host: "host-e",
      version: "1",
      cachePath: join(dir, "cache.json"),
      hostFile,
      now: () => 1,
      codexLoggedIn: () => true,
      codexProbe: () => ({ available: false, reason: "sandbox denied" }),
      claudePath: noClaude,
    };

    expect(probeRoutes(deps).codex.available).toBe(false);
    writeFileSync(
      hostFile,
      'schema = 1\nunsandboxed_reason = "This host is the isolation"\n',
    );
    expect(probeRoutes(deps).codex).toEqual({
      available: true,
      reason: "unsandboxed by host declaration: This host is the isolation",
    });
  });

  test("a missing Codex login makes the route unavailable and is checked again immediately", () => {
    const dir = mkdtempSync(join(tmpdir(), "agx-routes-"));
    dirs.push(dir);
    let loggedIn = false;
    let probes = 0;
    const deps = {
      host: "host-f",
      version: "1",
      cachePath: join(dir, "cache.json"),
      hostFile: join(dir, "host.toml"),
      now: () => 1,
      codexLoggedIn: () => loggedIn,
      codexProbe: () => {
        probes += 1;
        return { available: true, reason: "sandbox probe passed" };
      },
      claudePath: noClaude,
    };
    expect(probeRoutes(deps).codex).toEqual({
      available: false,
      reason:
        "codex is not logged in here — run `mise run auth:push -- <this host>` from the Mac",
    });
    loggedIn = true;
    expect(probeRoutes(deps).codex.available).toBe(true);
    expect(probes).toBe(1);
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
