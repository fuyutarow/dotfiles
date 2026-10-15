import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../../shared/src/zod.ts";
import { writeUsageSnapshot } from "../../../statusline/src/usage-snapshot.ts";
import { route } from "../../src/next/route.ts";
import { append, events, now } from "../../src/next/store.ts";
import { parseNextTicket } from "../../src/next/ticket.ts";

const RoutingRequest = z.looseObject({
  state: z.looseObject({
    routes: z.looseObject({
      claude: z.looseObject({
        available: z.boolean(),
        usage_status: z.string(),
        preference: z.string(),
        windows: z.record(
          z.string(),
          z.looseObject({
            used_percent: z.number().nullable(),
            resets_at: z.number().nullable(),
            window_seconds: z.number(),
            elapsed_fraction: z.number().nullable(),
            pace: z.number().nullable(),
            status: z.string(),
          }),
        ),
      }),
      codex: z.looseObject({
        available: z.boolean(),
        usage_status: z.string(),
        preference: z.string(),
        windows: z.record(
          z.string(),
          z.looseObject({
            used_percent: z.number().nullable(),
            resets_at: z.number().nullable(),
            window_seconds: z.number(),
            elapsed_fraction: z.number().nullable(),
            pace: z.number().nullable(),
            status: z.string(),
          }),
        ),
      }),
    }),
    task_size: z.looseObject({ timeout_s: z.number(), class: z.string() }),
  }),
  questions: z.looseObject({
    worker: z.looseObject({
      instructions: z.string(),
      criteria: z.record(z.string(), z.string()),
    }),
  }),
});

const priorUrl = process.env.AGX_NEXT_JEV_URL;
const priorHome = process.env.HOME;
const priorStateDir = process.env.AGX_NEXT_STATE_DIR;
const servers: ReturnType<typeof Bun.serve>[] = [];
const roots: string[] = [];

function isolateState() {
  const root = mkdtempSync(join(tmpdir(), "agx-route-"));
  roots.push(root);
  const home = join(root, "home");
  mkdirSync(home, { recursive: true });
  process.env.HOME = home;
  process.env.AGX_NEXT_STATE_DIR = join(root, "state");
  return { root, home };
}

function installUsage(
  home: string,
  measuredAtMs: number,
  claudePercent: number,
  claudeElapsed: number,
  codexPercent: number,
  codexElapsed: number,
  claudeResetKnown = true,
) {
  const measuredSeconds = measuredAtMs / 1000;
  const fiveHours = 5 * 60 * 60;
  const sevenDays = 7 * 24 * 60 * 60;
  const written = writeUsageSnapshot(
    {
      rl5: 12,
      rl5Reset: measuredSeconds + fiveHours * 0.05,
      rl7: claudePercent,
      rl7Reset: claudeResetKnown
        ? measuredSeconds + sevenDays * (1 - claudeElapsed)
        : undefined,
      codexRate: {
        windows: [
          {
            minutes: 10080,
            percent: codexPercent,
            reset: measuredSeconds + sevenDays * (1 - codexElapsed),
          },
        ],
        mtimeMs: measuredAtMs,
      },
    },
    measuredSeconds,
    { HOME: home },
  );
  expect(written).toBe(true);
}

function startServer(choice: string, probabilities?: Record<string, number>) {
  let requestBody: z.output<typeof RoutingRequest> | undefined;
  const server = Bun.serve({
    port: 0,
    fetch: async (request) => {
      const parsed = jsonOf(RoutingRequest).safeParse(await request.text());
      if (parsed.success) requestBody = parsed.data;
      return Response.json({
        answers: {
          worker: {
            choice,
            ...(probabilities === undefined ? {} : { probabilities }),
          },
        },
      });
    },
  });
  servers.push(server);
  process.env.AGX_NEXT_JEV_URL = `http://127.0.0.1:${server.port}/choice`;
  return { server, request: () => requestBody };
}

function appendStarted(row: string) {
  append({
    kind: "started",
    id: `test-${crypto.randomUUID()}`,
    at: now(),
    ticket: "route-test",
    writes: [],
    cwd: tmpdir(),
    workspace: tmpdir(),
    row,
    dispatcher_session: null,
    vendor_session: null,
    pid: 0,
  });
  return events().findLast((event) => event.kind === "started");
}

afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop(true);
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
  if (priorUrl === undefined) delete process.env.AGX_NEXT_JEV_URL;
  else process.env.AGX_NEXT_JEV_URL = priorUrl;
  if (priorHome === undefined) delete process.env.HOME;
  else process.env.HOME = priorHome;
  if (priorStateDir === undefined) delete process.env.AGX_NEXT_STATE_DIR;
  else process.env.AGX_NEXT_STATE_DIR = priorStateDir;
});

describe("capability constrained routing", () => {
  test("th_purge replay rejects luna-medium and sends timeout as task size", async () => {
    isolateState();
    const server = startServer("luna-medium", {
      "luna-medium": 0.99,
      "sol-low": 0.01,
    });
    const parsed = parseNextTicket(
      `+++\nschema = 2\nname = "th_purge"\nwrites = ["PURGE-MANIFEST.tsv", "admission/**"]\noutcome = "inventory, classify, retain, and verify every theory file"\ntimeout_s = 14400\ncapabilities = ["terminal-agentic", "long-tool-loop", "bulk-classification"]\n[proposition]\nid = "TH-PURGE-1"\nclaim = "every THEORY file is retained byte-exact in canonical v1"\nrefuted_by = "a THEORY row lacks a verified v1 id or has a byte mismatch"\n+++\nInventory all prose research artifacts.\n`,
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const selected = await route(
      "inventory and classify the repo",
      parsed.ticket.capabilities,
      parsed.ticket.timeout_s,
    );
    expect(selected.id).toBe("sol-low");
    expect(server.request()?.state.routes.claude.usage_status).toBe("unknown");
    expect(server.request()?.state.routes.claude.preference).toBe("neutral");
    expect(server.request()?.state.task_size).toEqual({
      timeout_s: 14_400,
      class: "multi-hour",
    });
    expect(
      server.request()?.questions.worker.criteria["luna-medium"],
    ).toBeUndefined();
    expect(server.request()?.questions.worker.criteria["sol-low"]).toContain(
      "TB4",
    );
    const criteria = Object.values(
      server.request()?.questions.worker.criteria ?? {},
    );
    const routeBias = [
      ["no", "codex", "row"],
      ["choose", "codex"],
      ["when", "codex", "and", "claude", "rows", "are", "comparable"],
    ].map((words) => words.join(" "));
    expect(
      criteria.every((row) =>
        routeBias.every((phrase) => !row.includes(phrase)),
      ),
    ).toBe(true);
    expect(
      routeBias.every(
        (phrase) =>
          !(server.request()?.questions.worker.instructions ?? "").includes(
            phrase,
          ),
      ),
    ).toBe(true);
    const retry = await route(
      "inventory and classify the repo",
      parsed.ticket.capabilities,
      parsed.ticket.timeout_s,
      ["sol-low"],
    );
    expect(retry.id).not.toBe("sol-low");
    expect(retry.id).not.toBe("luna-medium");
    appendStarted(retry.id);
  });

  test("the replayed subscription pace sends its numbers and selects Claude", async () => {
    const { home } = isolateState();
    const nowMs = Temporal.Now.instant().epochMilliseconds;
    installUsage(home, nowMs, 3, 0.94, 45, 0.28);
    const server = startServer("sonnet-high", {
      "sonnet-high": 1,
      "luna-high": 0,
    });

    const selected = await route("comparable routing replay");
    expect(selected.id).toBe("sonnet-high");
    const request = server.request();
    const claudeWeek = request?.state.routes.claude.windows["7d"];
    const codexWeek = request?.state.routes.codex.windows["7d"];
    expect(claudeWeek).toMatchObject({
      used_percent: 3,
      window_seconds: 604800,
      status: "fresh",
    });
    expect(claudeWeek?.elapsed_fraction).toBeCloseTo(0.94, 5);
    expect(claudeWeek?.pace).toBeCloseTo(-0.91, 5);
    expect(codexWeek).toMatchObject({
      used_percent: 45,
      window_seconds: 604800,
      status: "fresh",
    });
    expect(codexWeek?.elapsed_fraction).toBeCloseTo(0.28, 5);
    expect(codexWeek?.pace).toBeCloseTo(0.17, 5);
    expect(request?.questions.worker.instructions).toContain(
      "prefer the route with the most negative fresh-window pace",
    );
    expect(request?.questions.worker.instructions).toContain(
      "Stale or unknown usage is neutral",
    );
    expect(request?.questions.worker.criteria["sonnet-high"]).toBeDefined();
    expect(request?.questions.worker.criteria["luna-high"]).toBeDefined();

    const started = appendStarted(selected.id);
    expect(started?.kind).toBe("started");
    if (started?.kind === "started")
      expect(started.pick_audit).toEqual({
        source: "jev",
        probabilities: { "sonnet-high": 1, "luna-high": 0 },
        usage_snapshot: request?.state.routes,
      });
  });

  test("a route above its weekly limit is unavailable and its rows are excluded", async () => {
    const { home } = isolateState();
    const nowMs = Temporal.Now.instant().epochMilliseconds;
    installUsage(home, nowMs, 101, 0.94, 45, 0.28, false);
    const server = startServer("luna-high", { "luna-high": 1 });

    const selected = await route("exclude a capped route");
    expect(selected.route).toBe("codex");
    expect(server.request()?.state.routes.claude.available).toBe(false);
    expect(server.request()?.state.routes.claude.windows["7d"]?.status).toBe(
      "unknown",
    );
    expect(server.request()?.questions.worker.criteria["sonnet-high"]).toBe(
      undefined,
    );
    expect(
      server.request()?.questions.worker.criteria["luna-high"],
    ).toBeDefined();
    appendStarted(selected.id);
  });

  test("stale usage is neutral and does not exclude either route", async () => {
    const { home } = isolateState();
    const nowMs = Temporal.Now.instant().epochMilliseconds;
    installUsage(home, nowMs - 16 * 60 * 1000, 100, 0.94, 45, 0.28);
    const server = startServer("sonnet-high", { "sonnet-high": 1 });

    const selected = await route("stale usage replay");
    expect(selected.route).toBe("claude");
    const routes = server.request()?.state.routes;
    expect(routes).toBeDefined();
    if (routes === undefined) return;
    expect(routes.claude.available).toBe(true);
    expect(routes.claude.usage_status).toBe("stale");
    expect(routes.claude.preference).toBe("neutral");
    expect(routes.claude.windows["7d"]?.status).toBe("stale");
    expect(routes.claude.windows["7d"]?.pace).toBeNull();
    expect(routes.codex.available).toBe(true);
    expect(routes.codex.preference).toBe("neutral");
    appendStarted(selected.id);
  });

  test("an invalid Jev choice records the fallback reason and probabilities", async () => {
    isolateState();
    const server = startServer("not-a-roster-row", {
      "not-a-roster-row": 1,
    });

    const selected = await route("fallback audit replay");
    expect(selected.id).toBe("luna-high");
    const started = appendStarted(selected.id);
    expect(started?.kind).toBe("started");
    if (started?.kind === "started") {
      expect(started.pick_audit?.source).toBe("fallback-ineligible-choice");
      expect(started.pick_audit?.probabilities).toEqual({
        "not-a-roster-row": 1,
      });
      expect(started.pick_audit?.usage_snapshot).toEqual(
        server.request()?.state.routes,
      );
    }
  });
});
