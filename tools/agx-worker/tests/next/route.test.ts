import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../../shared/src/zod.ts";
import { writeUsageSnapshot } from "../../../statusline/src/usage-snapshot.ts";
import { ROUTING_OBJECTIVE } from "../../../../agents/models/roster.ts";
import { readRouteUsage } from "../../src/next/usage.ts";
import { route } from "../../src/next/route.ts";
import {
  append,
  events,
  now,
  flushRunPublications,
} from "../../src/next/store.ts";
import { parseNextTicket } from "../../src/next/ticket.ts";
import { prepareTicketRepo } from "../ticket-repo.ts";

const RoutingRequest = z.looseObject({
  state: z.looseObject({
    task: z.string(),
    routes: z.looseObject({
      claude: z.looseObject({
        available: z.boolean(),
        windows: z.record(
          z.string(),
          z.looseObject({
            used_percent: z.number().nullable(),
            elapsed_fraction: z.number().nullable(),
            pace: z.number().nullable(),
            status: z.string(),
          }),
        ),
      }),
      codex: z.looseObject({
        available: z.boolean(),
        windows: z.record(
          z.string(),
          z.looseObject({
            used_percent: z.number().nullable(),
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

const priorRoster = process.env.DISPATCH_ROSTER_PATH;
const priorUrl = process.env.AGX_NEXT_JEV_URL;
const priorHome = process.env.HOME;
const priorStateDir = process.env.AGX_NEXT_STATE_DIR;
const servers: ReturnType<typeof Bun.serve>[] = [];
const roots: string[] = [];

async function isolateState() {
  const root = await mkdtemp(join(tmpdir(), "agx-route-"));
  roots.push(root);
  const home = join(root, "home");
  await mkdir(home, { recursive: true });
  const roster = await readFile(
    new URL("../../../../agents/models/dispatch-roster.toml", import.meta.url),
    "utf8",
  );
  process.env.DISPATCH_ROSTER_PATH = join(root, "roster.toml");
  await writeFile(
    process.env.DISPATCH_ROSTER_PATH,
    roster.replace(/^routes = .*\n/mu, ""),
  );
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
  await flushRunPublications();
  if (priorRoster === undefined) delete process.env.DISPATCH_ROSTER_PATH;
  else process.env.DISPATCH_ROSTER_PATH = priorRoster;
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
  for (const capabilities of [[], ["terminal-agentic", "long-tool-loop"]]) {
    for (const probabilities of [undefined, { "sonnet-high": 1 }]) {
      test(`codex allowlist excludes Claude offers and picks: ${JSON.stringify({ capabilities, probabilities })}`, async () => {
        const { root } = await isolateState();
        const path = join(root, "roster.toml");
        await writeFile(
          path,
          (await readFile(path, "utf8")).replace(
            "[auto]",
            '[auto]\nroutes = ["codex"]',
          ),
        );
        const server = startServer("sonnet-high", probabilities);
        const selected = await route(
          "Claude hook edit requiring strong capability",
          capabilities,
        );
        expect(selected.route).toBe("codex");
        const criteria = Object.values(
          server.request()?.questions.worker.criteria ?? {},
        );
        expect(criteria.length).toBeGreaterThan(0);
        expect(
          criteria.every((criterion) => criterion.startsWith("Route codex.")),
        ).toBe(true);
        expect(
          server.request()?.questions.worker.criteria["sonnet-high"],
        ).toBeUndefined();
      });
    }
  }

  test("no eligible capability rows names the route filter", async () => {
    const { root } = await isolateState();
    const path = join(root, "roster.toml");
    const original = await readFile(path, "utf8");
    await writeFile(
      path,
      original
        .replace("[auto]", '[auto]\nroutes = ["codex"]')
        .replaceAll(/^tb4 = .*$/gmu, "tb4 = 0"),
    );
    const child = Bun.spawn(
      [
        process.execPath,
        "--eval",
        `import { route } from ${JSON.stringify(new URL("../../src/next/route.ts", import.meta.url).pathname)}; await route("capability probe", ["long-tool-loop"]);`,
      ],
      { env: process.env, stdout: "pipe", stderr: "pipe", timeout: 5000 },
    );
    const [exit, stderr] = await Promise.all([
      child.exited,
      new Response(child.stderr).text(),
    ]);
    expect(exit).toBe(2);
    expect(stderr).toContain(
      'no roster row satisfies required capabilities (routes=["codex"])',
    );
  });

  test("check reports the active route filter including omission", async () => {
    const { root } = await isolateState();
    await prepareTicketRepo(root);
    const ticket = join(root, "ticket.md");
    await writeFile(
      ticket,
      '+++\nschema = 2\noutcome = "check routes"\n[proposition]\nid = "ROUTES"\nclaim = "filter is visible"\nrefuted_by = "filter missing"\n+++\nCheck routes.\n',
    );
    const path = join(root, "roster.toml");
    const original = await readFile(path, "utf8");
    for (const routes of [undefined, '["codex"]']) {
      await writeFile(
        path,
        routes === undefined
          ? original
          : original.replace("[auto]", `[auto]\nroutes = ${routes}`),
      );
      const child = Bun.spawn(
        [
          process.execPath,
          "tools/agx-worker/src/next/cli.ts",
          "check",
          ticket,
          "--cd",
          root,
        ],
        { env: process.env, stdout: "pipe", stderr: "pipe", timeout: 5000 },
      );
      const [exit, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect(stderr).toBe("");
      expect(exit).toBe(0);
      expect(stdout).toContain(`routes=${routes ?? "all (codex, claude)"}`);
    }
  });

  test("local accepted and rejected history cannot change the Jev request", async () => {
    const capture = async (decisions: readonly string[]) => {
      await isolateState();
      for (const decision of decisions) {
        const started = appendStarted("sol-medium");
        expect(started?.kind).toBe("started");
        if (started?.kind !== "started") continue;
        append({
          kind: "ended",
          id: started.id,
          at: now(),
          exit: 0,
          outcome: "ok",
          report_path: null,
          vendor_session: null,
        });
        append({
          kind: "judged",
          id: started.id,
          at: now(),
          decision,
          note: "audit-only local judgment",
        });
      }
      const server = startServer("sonnet-high");
      expect((await route("same frozen ticket")).id).toBe("sonnet-high");
      const request = server.request();
      expect(request).toBeDefined();
      expect(request?.questions.worker.criteria["luna-high"]).not.toMatch(
        /graded|accepted|rejected|history|recent|comparable/iu,
      );
      return request;
    };

    const successSkew = await capture(["accept", "accept", "accept", "accept"]);
    const empty = await capture([]);
    const inverted = await capture(["reject", "reject", "reject", "reject"]);
    expect(empty).toEqual(successSkew);
    expect(inverted).toEqual(successSkew);
  });

  test("historical Sol 6.1 grades stay on retired ids and do not appear on Sol 6.0", async () => {
    await isolateState();
    const started = appendStarted("sol-high");
    expect(started?.kind).toBe("started");
    if (started?.kind !== "started") return;
    append({
      kind: "ended",
      id: started.id,
      at: now(),
      exit: 0,
      outcome: "ok",
      report_path: null,
      vendor_session: null,
    });
    append({
      kind: "judged",
      id: started.id,
      at: now(),
      decision: "accept",
      note: "historical Sol 6.1 acceptance",
    });
    const server = startServer("sol6-high");
    expect((await route("generation-isolation replay")).id).toBe("sol6-high");
    expect(server.request()?.questions.worker.criteria["sol6-high"]).toContain(
      "AA 42, TB4 26.3%",
    );
    expect(
      server.request()?.questions.worker.criteria["sol6-high"],
    ).not.toMatch(/graded|history|recent|comparable|accepted|rejected/iu);
    expect(
      server.request()?.questions.worker.criteria["sol-high"],
    ).toBeUndefined();
  });
  test("ROUTER-PROMPT-TREE: 7d is primary, 5h is secondary, and Jev chooses Codex", async () => {
    const { home } = await isolateState();
    const nowMs = Temporal.Now.instant().epochMilliseconds;
    // Claude 5h = .12 - .84 = -.72; Claude 7d = .20 - .12 = +.08.
    installUsage(home, nowMs, 20, 0.12, 34, 0.11);
    expect(
      writeUsageSnapshot(
        {
          rl5: 12,
          rl5Reset: nowMs / 1000 + 18000 * 0.16,
          rl7: 20,
          rl7Reset: nowMs / 1000 + 604800 * 0.88,
          codexRate: {
            windows: [
              {
                minutes: 10080,
                percent: 34,
                reset: nowMs / 1000 + 604800 * 0.89,
              },
            ],
            mtimeMs: nowMs,
          },
        },
        nowMs / 1000,
        { HOME: home },
      ),
    ).toBe(true);
    const server = startServer("luna-high", { "luna-high": 1 });
    expect((await route("owner ruling replay")).route).toBe("codex");
    const request = server.request();
    expect(request?.state.history).toBeUndefined();
    expect(request?.state.task.length).toBeLessThanOrEqual(2400);
    expect(request?.questions.worker.instructions).toBe(
      `${ROUTING_OBJECTIVE} Pick a roster row for this ticket.`,
    );
    expect(request?.questions.worker.criteria["luna-high"]).not.toMatch(
      /graded|history|recent|comparable/iu,
    );
    expect(
      Object.keys(request?.state.routes.claude.windows["7d"] ?? {}),
    ).toEqual(["used_percent", "elapsed_fraction", "pace", "status"]);
    expect(Object.keys(request?.state.routes.claude.windows ?? {})).toEqual([
      "7d",
      "5h",
    ]);
    expect(request?.state.routes.claude.windows["7d"]?.pace).toBeCloseTo(
      0.08,
      5,
    );
    expect(request?.state.routes.codex.windows["7d"]?.pace).toBeCloseTo(
      0.23,
      5,
    );
    expect(request?.questions.worker.criteria["luna-high"]).toBeDefined();
    expect(request?.questions.worker.criteria["sonnet-high"]).toBeDefined();
    expect(request?.questions.worker.instructions).toContain(ROUTING_OBJECTIVE);
    expect(request?.questions.worker.instructions).toContain(
      "5-hour windows are secondary",
    );
    expect(ROUTING_OBJECTIVE).toContain(
      "Keep the intended bias toward the codex route",
    );
    expect(ROUTING_OBJECTIVE).toContain("7-day windows most");
  });

  test("fresh Codex source survives consecutive picks and empty statusline publication", async () => {
    const { home } = await isolateState();
    const nowMs = Temporal.Now.instant().epochMilliseconds;
    const dir = join(home, ".codex", "sessions", "2026", "01", "01");
    mkdirSync(dir, { recursive: true });
    const source = join(dir, "rollout-account.jsonl");
    await Bun.write(
      source,
      `${JSON.stringify({
        timestamp: Temporal.Instant.fromEpochMilliseconds(nowMs).toString(),
        type: "event_msg",
        payload: {
          type: "token_count",
          rate_limits: {
            secondary: {
              used_percent: 34,
              window_minutes: 10080,
              resets_at: nowMs / 1000 + 604800 * 0.89,
            },
          },
        },
      })}\n`,
    );
    // A newer session with no rate event must not hide the fresh account source.
    await Bun.write(
      join(dir, "rollout-empty.jsonl"),
      '{"type":"session_meta"}\n',
    );
    installUsage(home, nowMs, 20, 0.12, 34, 0.11);
    expect((await readRouteUsage(nowMs + 1000)).codex.usage_status).toBe(
      "fresh",
    );
    expect(writeUsageSnapshot({}, nowMs / 1000 + 120, { HOME: home })).toBe(
      true,
    );
    const second = await readRouteUsage(nowMs + 120000);
    expect(second.codex.usage_status).toBe("fresh");
    expect(second.codex.source_reason).toBe(
      "fresh Codex 7d rollout rate event",
    );
    expect(second.codex.windows["7d"]?.used_percent).toBe(34);
    const third = await readRouteUsage(nowMs + 180000);
    expect(third.codex.usage_status).toBe("fresh");
    const stale = await readRouteUsage(nowMs + 16 * 60000);
    expect(stale.codex.usage_status).toBe("unknown");
    expect(stale.codex.source_reason).toBe("no fresh Codex rollout source");
  });

  test("missing Codex source is explained in the pick audit", async () => {
    await isolateState();
    startServer("luna-high", { "luna-high": 1 });
    const selected = await route("missing source audit");
    const started = appendStarted(selected.id);
    if (started?.kind === "started")
      expect(started.pick_audit?.usage_snapshot).toMatchObject({
        codex: { source_reason: "no fresh Codex rollout source" },
      });
  });

  test("th-purge replay rejects luna-medium and sends timeout as task size", async () => {
    await isolateState();
    const server = startServer("luna-medium", {
      "luna-medium": 0.99,
      "sol6-low": 0.01,
    });
    const parsed = parseNextTicket(
      `+++\nschema = 2\nname = "th-purge"\nwrites = ["PURGE-MANIFEST.tsv", "admission/**"]\noutcome = "inventory, classify, retain, and verify every theory file"\ntimeout_s = 14400\ncapabilities = ["terminal-agentic", "long-tool-loop", "bulk-classification"]\n[proposition]\nid = "TH-PURGE-1"\nclaim = "every THEORY file is retained byte-exact in canonical v1"\nrefuted_by = "a THEORY row lacks a verified v1 id or has a byte mismatch"\n+++\nInventory all prose research artifacts.\n`,
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const selected = await route(
      "inventory and classify the repo",
      parsed.ticket.capabilities,
      parsed.ticket.timeout_s,
    );
    expect(selected.id).not.toBe("sol6-low");
    expect(server.request()?.state.routes.claude.windows["7d"]?.status).toBe(
      "unknown",
    );
    expect(server.request()?.state.task_size).toEqual({
      timeout_s: 14_400,
      class: "multi-hour",
    });
    expect(
      server.request()?.questions.worker.criteria["luna-medium"],
    ).toBeUndefined();
    expect(
      server.request()?.questions.worker.criteria["sol6-low"],
    ).toBeUndefined();
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
      ["sol6-low"],
    );
    expect(retry.id).not.toBe("sol6-low");
    expect(retry.id).not.toBe("luna-medium");
    appendStarted(retry.id);
  });

  test("the replayed subscription pace sends its numbers and selects Claude", async () => {
    const { home } = await isolateState();
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
      status: "fresh",
    });
    expect(claudeWeek?.elapsed_fraction).toBeCloseTo(0.94, 5);
    expect(claudeWeek?.pace).toBeCloseTo(-0.91, 5);
    expect(codexWeek).toMatchObject({
      used_percent: 45,
      status: "fresh",
    });
    expect(codexWeek?.elapsed_fraction).toBeCloseTo(0.28, 5);
    expect(codexWeek?.pace).toBeCloseTo(0.17, 5);
    expect(request?.questions.worker.instructions).toContain(ROUTING_OBJECTIVE);
    expect(request?.questions.worker.instructions).toContain(
      "Stale or unknown usage is neutral",
    );
    expect(request?.questions.worker.criteria["sonnet-high"]).toBeDefined();
    expect(request?.questions.worker.criteria["luna-high"]).toBeDefined();

    const started = appendStarted(selected.id);
    expect(started?.kind).toBe("started");
    if (started?.kind === "started")
      expect(started.pick_audit).toMatchObject({
        source: "jev",
        probabilities: { "sonnet-high": 1, "luna-high": 0 },
      });
  });

  test("a route above its weekly limit is unavailable and its rows are excluded", async () => {
    const { home } = await isolateState();
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
    const { home } = await isolateState();
    const nowMs = Temporal.Now.instant().epochMilliseconds;
    installUsage(home, nowMs - 16 * 60 * 1000, 100, 0.94, 45, 0.28);
    const server = startServer("sonnet-high", { "sonnet-high": 1 });

    const selected = await route("stale usage replay");
    expect(selected.route).toBe("claude");
    const routes = server.request()?.state.routes;
    expect(routes).toBeDefined();
    if (routes === undefined) return;
    expect(routes.claude.available).toBe(true);

    expect(routes.claude.windows["7d"]?.status).toBe("stale");
    expect(routes.claude.windows["7d"]?.pace).toBeNull();
    expect(routes.codex.available).toBe(true);
    appendStarted(selected.id);
  });

  test("an invalid Jev choice records the fallback reason and probabilities", async () => {
    await isolateState();
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
      expect(started.pick_audit?.usage_snapshot).toMatchObject(
        server.request()?.state.routes ?? {},
      );
    }
  });
});

test("fresh Sol6.0 criteria use sourced metrics; retired Jev pick cannot select 6.1", async () => {
  await isolateState();
  const server = startServer("sol-high", { "sol-high": 1 });
  const picked = await route("fresh generation probe");
  expect(picked.id).not.toStartWith("sol-");
  expect(picked.model).not.toBe("gpt-6.1-sol");
  const criteria = server.request()?.questions.worker.criteria ?? {};
  expect(
    Object.keys(criteria).filter((id) => id.startsWith("sol6-")),
  ).toHaveLength(5);
  expect(criteria["sol6-high"]).toContain("AA 42, TB4 26.3%");
  expect(criteria["sol6-high"]).toContain("measurement date unknown");
  expect(criteria["sol6-high"]).toContain("SciCode under review");
  expect(criteria["sol6-high"]).toContain("Standard API list price");
  expect(criteria["sol6-high"]).toContain(
    "subscription marginal spend unknown",
  );
  expect(criteria["sol-high"]).toBeUndefined();
});
for (const capability of ["terminal-agentic", "long-tool-loop"]) {
  test(`Sol6.0 ${capability} eligibility is exactly xhigh/max`, async () => {
    await isolateState();
    const server = startServer("sol6-xhigh", { "sol6-xhigh": 1 });
    expect((await route("terminal probe", [capability])).id).toBe("sol6-xhigh");
    const criteria = server.request()?.questions.worker.criteria ?? {};
    expect(
      Object.keys(criteria)
        .filter((id) => id.startsWith("sol6-"))
        .toSorted(),
    ).toEqual(["sol6-max", "sol6-xhigh"]);
    expect(criteria["sol6-xhigh"]).toContain("TB4 30.3%");
    expect(criteria["sol6-max"]).toContain("TB4 43.9%");
  });
}
test("combined candidate rejects mixed Sol generations before Jev, even outside auto routes", async () => {
  const { root } = await isolateState();
  const path = join(root, "roster.toml");
  await writeFile(
    path,
    (await readFile(path, "utf8"))
      .replace(
        'id = "sol6-low"\nroute = "codex"\nmodel = "gpt-6-sol"',
        'id = "sol6-low"\nroute = "claude"\nmodel = "gpt-6.1-sol"',
      )
      .replace("[auto]", '[auto]\nroutes = ["codex"]'),
  );
  const server = startServer("sol6-high");
  const child = Bun.spawn(
    [
      process.execPath,
      "--eval",
      `import {route} from ${JSON.stringify(new URL("../../src/next/route.ts", import.meta.url).pathname)}; await route("mixed candidate");`,
    ],
    { env: process.env, stdout: "pipe", stderr: "pipe", timeout: 5000 },
  );
  const [exit, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  // loadRoster failure is a configuration error (1); candidate exhaustion uses 2.
  expect(exit, stderr).toBe(1);
  expect(stdout).toBe("");
  expect(stderr).toStartWith(
    "agx: cannot read dispatch roster: model family sol has multiple generations:",
  );
  expect(stderr).toContain("Keep one generation for each family");
  expect(stderr).toContain("gpt-6.1-sol");
  expect(stderr).toContain("gpt-6-sol");
  expect(server.request()).toBeUndefined();
});
