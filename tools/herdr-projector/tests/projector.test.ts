import { expect, test } from "bun:test";
import { mkdtemp, open, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FleetSessionSchema,
  parseFleetSession,
  readFleetSession,
  writeFleetSession,
  type FleetSessionRead,
} from "../../shared/src/fleet-session.ts";
import { jsonOf } from "../../shared/src/zod.ts";
import { readCodexNativeTitle } from "../../shared/src/codex-native-title.ts";
import {
  nativeTitleCacheInputs,
  projectAgents,
} from "../src/herdr-projector.ts";
import { AgentSchema } from "../src/herdr-projector.ts";
import ownerList from "./owner-list-oct21.json" with { type: "json" };

const session = (overrides: Record<string, unknown> = {}) => ({
  schema: 1,
  session_id: "sid-1",
  vendor: "claude",
  name: "project-agt_abcd",
  model: "Opus 5.5",
  effort: "high",
  ctx: { tokens: 12000, pct: 40 },
  rate: { five_h_pct: 20, seven_d_pct: 30, resets: "2026-10-20T00:00:00Z" },
  cwd: "/workspace/project",
  pane_id: "pane-1",
  updated_at: "2026-10-19T00:00:00.000Z",
  ...overrides,
});

const unit = (name: string) =>
  Bun.file(
    join(import.meta.dir, `../../../systemd/herdr-projector.${name}`),
  ).text();

test("fleet burst activations coalesce before reading without exhausting protective limits", async () => {
  const [service, path, timer] = await Promise.all([
    unit("service"),
    unit("path"),
    unit("timer"),
  ]);
  // A fixed pre-read window cannot be extended by a continuous stream of events.
  // systemd keeps a oneshot activating throughout ExecStartPre and ExecStart.
  expect(service).toContain("Type=oneshot");
  expect(service).toContain("ExecStartPre=/usr/bin/sleep 3\nExecStart=");
  expect(service).toContain("StartLimitIntervalSec=10s");
  expect(service).toContain("StartLimitBurst=5");
  // Even zero-cost projections can start at most four times in any ten seconds.
  const delay = Number(
    service.match(/^ExecStartPre=\/usr\/bin\/sleep (\d+)$/mu)?.[1],
  );
  const interval = Number(
    service.match(/^StartLimitIntervalSec=(\d+)s$/mu)?.[1],
  );
  const burst = Number(service.match(/^StartLimitBurst=(\d+)$/mu)?.[1]);
  expect(Math.floor(interval / delay) + 1).toBeLessThan(burst);
  expect(path).toContain("PathChanged=%t/fleet/sessions");
  expect(path).toContain("Unit=herdr-projector.service");
  expect(timer).toContain("OnUnitActiveSec=60s");
  expect(timer).toContain("Unit=herdr-projector.service");
});

test("shared fleet session atomically writes and reads schema 1", async () => {
  const root = await mkdtemp(join(tmpdir(), "fleet-session-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const parsed = parseFleetSession(JSON.stringify(session()));
  const valid = FleetSessionSchema.safeParse(parsed);
  expect(valid.success).toBe(true);
  if (!valid.success) return;
  expect(
    await writeFleetSession(valid.data, { XDG_RUNTIME_DIR: root }),
  ).toEqual({
    ok: true,
    value: undefined,
  });
  expect(await readFleetSession("sid-1", { XDG_RUNTIME_DIR: root })).toEqual(
    valid.data,
  );
  const disk = await readFile(
    join(root, "fleet", "sessions", "sid-1.json"),
    "utf8",
  );
  expect(jsonOf(FleetSessionSchema).safeParse(disk).data).toEqual(valid.data);
});

test("projects known identity metadata and labels unknown agents without model", async () => {
  const calls: string[][] = [];
  const agents = [
    {
      agent: "claude",
      pane_id: "pane-1",
      tab_id: "tab-1",
      agent_session: { value: "sid-1" },
      tokens: { rc: "🔗" },
    },
    {
      agent: "codex",
      pane_id: "pane-2",
      tab_id: "tab-2",
      agent_session: { value: "sid-2" },
    },
  ];
  const known = parseFleetSession(JSON.stringify(session()));
  const validKnown = FleetSessionSchema.safeParse(known);
  expect(validKnown.success).toBe(true);
  if (!validKnown.success) return;
  await projectAgents(
    agents,
    new Map<string, FleetSessionRead>([
      [validKnown.data.session_id, validKnown.data],
      ["sid-2", { na: true, why: "fleet session sid-2 is missing" }],
    ]),
    (args) => Promise.resolve(calls.push(args)).then(() => true),
  );
  expect(calls[0]).toEqual(["tab", "rename", "tab-1", "project-agt_abcd"]);
  expect(calls[1]).toContain("fullname=project-agt_abcd");
  expect(calls[1]).toContain("model=Opus 5.5");
  expect(calls[1]).toContain("effort=high");
  expect(calls[1]).toContain("rc=rc:?");
  expect(calls[2]).toEqual([
    "tab",
    "rename",
    "tab-2",
    "codex · n/a(no session file)",
  ]);
  expect(calls[3]).toContain("model=");
});

test("rejects a Claude session for a Codex pane and clears its identity", async () => {
  const calls: string[][] = [];
  const parsedClaude = FleetSessionSchema.safeParse(session());
  expect(parsedClaude.success).toBe(true);
  if (!parsedClaude.success) return;
  await projectAgents(
    [
      {
        agent: "codex",
        pane_id: "pane-2",
        tab_id: "tab-2",
        agent_session: { value: "sid-1" },
      },
    ],
    new Map([["sid-1", parsedClaude.data]]),
    (args) => Promise.resolve(calls.push(args)).then(() => true),
  );
  expect(calls[0]).toEqual([
    "tab",
    "rename",
    "tab-2",
    "codex · n/a(no session id)",
  ]);
  expect(calls[1]).toContain("model=");
  expect(calls[1]).toContain("fleet_session_id=");
});

test("matches the Codex rollout only by Herdr's exact session id", async () => {
  const calls: string[][] = [];
  const parsedCodex = FleetSessionSchema.safeParse(
    session({
      vendor: "codex",
      session_id: "codex-thread",
      model: "gpt-6.1-sol",
    }),
  );
  expect(parsedCodex.success).toBe(true);
  if (!parsedCodex.success) return;
  await projectAgents(
    [
      {
        agent: "codex",
        pane_id: "pane-2",
        tab_id: "tab-2",
        agent_session: { value: "codex-thread" },
        cwd: "/workspace/project",
      },
      {
        agent: "codex",
        pane_id: "pane-3",
        tab_id: "tab-3",
        cwd: "/workspace/project",
      },
    ],
    new Map([["codex-thread", parsedCodex.data]]),
    (args) => Promise.resolve(calls.push(args)).then(() => true),
  );
  expect(calls[1]).toContain("model=gpt-6.1-sol");
  expect(calls[2]).toEqual([
    "tab",
    "rename",
    "tab-3",
    "codex · n/a(no session id)",
  ]);
  expect(calls[3]).toContain("model=");
  expect(calls[3]).toContain("fleet_session_id=");
});

test("keeps unavailable labels within 40 characters", async () => {
  const calls: string[][] = [];
  await projectAgents(
    [
      {
        agent: "codex-agent-name-that-is-much-too-long-to-fit",
        pane_id: "pane-2",
        tab_id: "tab-2",
      },
    ],
    new Map(),
    (args) => Promise.resolve(calls.push(args)).then(() => true),
  );
  const label = calls[0]?.[3] ?? "";
  expect(label.length).toBeLessThanOrEqual(40);
  expect(label).toContain(" · n/a(no session id)");
});

test("missing session clears stale identity tokens and explains the missing file", async () => {
  const calls: string[][] = [];
  await projectAgents(
    [
      {
        agent: "codex",
        pane_id: "pane-2",
        tab_id: "tab-2",
        agent_session: { value: "stale-id" },
        tokens: {
          fleet_session_id: "stale-id",
          fullname: "example-skills-agt_0mr6",
          model: "Opus 5.5",
          effort: "medium",
          rc: "🔗",
        },
      },
    ],
    new Map([
      ["stale-id", { na: true, why: "fleet session stale-id is missing" }],
    ]),
    (args) => Promise.resolve(calls.push(args)).then(() => true),
  );
  expect(calls[0]).toEqual([
    "tab",
    "rename",
    "tab-2",
    "codex · n/a(no session file)",
  ]);
  expect(calls[1]).toContain("fullname=codex · n/a(no session file)");
  expect(calls[1]).toContain("model=");
  expect(calls[1]).toContain("effort=");
  expect(calls[1]).toContain("rc=rc:?");
  expect(calls[1]).toContain("fleet_session_id=");
});

const footerThread = "01a15424-5f6d-7ce0-9244-eb632a37f579";
const nextThread = "01a15424-5f6d-7ce0-9244-eb632a37f580";
const footer = (id = footerThread) =>
  `› Ask Codex to do anything\n\n  ${id} · GPT-6.1-Sol medium · ~/project · Working\n  ← for agents · ? for shortcuts\n`;

import {
  bindNativeCodexFooters,
  nativeFooterId,
  nativeFooterObservation,
} from "../src/herdr-projector.ts";
import { mkdir } from "node:fs/promises";
import {
  refreshCodexFleetSession,
  readCodexNativeSession,
} from "../../shared/src/fleet-session.ts";

type NativeTitleBindings = NonNullable<
  Parameters<typeof bindNativeCodexFooters>[4]
>;
type KnownNativeTitle = Extract<
  Awaited<ReturnType<typeof readCodexNativeTitle>>,
  { kind: "known" }
>;

test("native footer requires complete status row at viewport bottom and exact shortcuts", () => {
  expect(nativeFooterId(footer())).toBe(footerThread);
  for (const text of [
    `The session is ${footerThread}`,
    `${footerThread}\n← for agents · ? for shortcuts`,
    footer().replace(" · Working", ""),
    footer().replace("← for agents · ? for shortcuts", ""),
    `${footer()}conversation continues`,
    `${footer(footerThread).split("\n")[2]}\n${footer(nextThread)}`,
    footer().replace("GPT-6.1-Sol", "Claude"),
  ])
    expect(nativeFooterId(text)).toBeUndefined();
  expect(nativeFooterId(`prose UUID ${nextThread}\n${footer()}`)).toBe(
    footerThread,
  );
});

async function nativeFixture() {
  const root = await mkdtemp(join(tmpdir(), "native-footer-"));
  const dir = join(root, "sessions", "2026", "10", "19");
  await mkdir(dir, { recursive: true });
  const env = { CODEX_HOME: root, XDG_RUNTIME_DIR: root, HOME: "/workspace" };
  const rollout = async (
    id: string,
    overrides: Record<string, unknown> = {},
    suffix = "",
  ) => {
    const path = join(dir, `rollout-${suffix}-${id}.jsonl`);
    await Bun.write(
      path,
      [
        {
          type: "session_meta",
          payload: {
            id,
            cwd: "/workspace/project",
            originator: "Codex Desktop",
            ...overrides,
          },
        },
        {
          type: "turn_context",
          payload: { model: "gpt-6.1-sol", effort: "medium" },
        },
        {
          type: "event_msg",
          payload: {
            type: "thread_settings_applied",
            thread_settings: { model: "gpt-6-astra", reasoning_effort: "high" },
          },
        },
      ]
        .map((row) => JSON.stringify(row))
        .join("\n") + "\n",
    );
    return path;
  };
  return {
    root,
    dir,
    env,
    rollout,
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
}

async function writeNativeTitleIndex(
  fixture: Awaited<ReturnType<typeof nativeFixture>>,
  id: string,
  title: string,
  updatedAt = "2026-10-21T00:00:00.000Z",
) {
  await Bun.write(
    join(fixture.root, "session_index.jsonl"),
    `${JSON.stringify({ id, thread_name: title, updated_at: updatedAt })}\n`,
  );
}

test("bound native title projects Unicode labels and leaves the fleet name canonical", async () => {
  await using fixture = await nativeFixture();
  await fixture.rollout(footerThread);
  await writeNativeTitleIndex(fixture, footerThread, "レビュー 🧭");
  const prior = session({
    vendor: "codex",
    session_id: footerThread,
    pane_id: "pane",
    name: "canonical-agt_abcd",
  });
  expect((await writeFleetSession(prior, fixture.env)).ok).toBe(true);

  const agents = makeAgents();
  const calls: string[][] = [];
  const titles: NativeTitleBindings = new Map();
  const apply = (args: string[]) => {
    calls.push(args);
    return Promise.resolve(true);
  };
  const sessions = await bindNativeCodexFooters(
    agents,
    () => Promise.resolve(footer()),
    apply,
    fixture.env,
    titles,
  );
  expect(titles.get("pane")).toMatchObject({
    sessionId: footerThread,
    title: { kind: "known", displayTitle: "レビュー 🧭" },
  });
  await projectAgents(agents, sessions, apply, titles);
  expect(calls[1]).toEqual(["tab", "rename", "tab", "レビュー 🧭"]);
  expect(calls[2]).toContain("fullname=レビュー 🧭");
  expect(await readFleetSession(footerThread, fixture.env)).toMatchObject({
    name: "canonical-agt_abcd",
    session_id: footerThread,
  });
});

test("registration-only identity cannot create a native title binding", async () => {
  await using fixture = await nativeFixture();
  await fixture.rollout(footerThread);
  await writeNativeTitleIndex(fixture, footerThread, "unbound title");
  const agents = [
    {
      agent: "codex",
      pane_id: "pane",
      tab_id: "tab",
      agent_session: {
        source: "herdr:codex",
        kind: "id",
        agent: "codex",
        value: footerThread,
      },
    },
  ];
  const titles: NativeTitleBindings = new Map();
  const calls: string[][] = [];
  const apply = (args: string[]) => {
    calls.push(args);
    return Promise.resolve(true);
  };
  const sessions = await bindNativeCodexFooters(
    agents,
    () => Promise.resolve("no native footer"),
    apply,
    fixture.env,
    titles,
  );
  expect(titles.size).toBe(0);
  await projectAgents(agents, sessions, apply, titles);
  expect(calls.some((args) => args.includes("unbound title"))).toBe(false);
});

test("footer switch during native title I/O discards the pending label", async () => {
  await using fixture = await nativeFixture();
  await fixture.rollout(footerThread);
  await writeNativeTitleIndex(fixture, footerThread, "must be discarded");
  let visible = footer();
  const titles: NativeTitleBindings = new Map();
  const agents = makeAgents();
  const calls: string[][] = [];
  const apply = (args: string[]) => {
    calls.push(args);
    return Promise.resolve(true);
  };
  const readTitle = async (
    id: string,
    env: NodeJS.ProcessEnv = process.env,
  ) => {
    const result = await readCodexNativeTitle(id, env);
    visible = footer(nextThread);
    return result;
  };
  await bindNativeCodexFooters(
    agents,
    () => Promise.resolve(visible),
    apply,
    fixture.env,
    titles,
    readTitle,
  );
  expect(titles.size).toBe(0);
  expect(await readFleetSession(footerThread, fixture.env)).toMatchObject({
    na: true,
  });
  expect(calls.some((args) => args.includes("--agent-session-id"))).toBe(true);
});

test("unavailable native title replaces a prior known label with fleet fallback", async () => {
  await using fixture = await nativeFixture();
  await fixture.rollout(footerThread);
  await writeNativeTitleIndex(fixture, footerThread, "previous title");
  const prior = session({
    vendor: "codex",
    session_id: footerThread,
    pane_id: "pane",
    name: "canonical-agt_abcd",
  });
  expect((await writeFleetSession(prior, fixture.env)).ok).toBe(true);
  const agents = makeAgents();
  const calls: string[][] = [];
  const apply = (args: string[]) => {
    calls.push(args);
    return Promise.resolve(true);
  };
  const knownTitles: NativeTitleBindings = new Map();
  const known = await bindNativeCodexFooters(
    agents,
    () => Promise.resolve(footer()),
    apply,
    fixture.env,
    knownTitles,
  );
  await projectAgents(agents, known, apply, knownTitles);
  expect(calls.some((args) => args.includes("previous title"))).toBe(true);

  await Bun.write(
    join(fixture.root, "session_index.jsonl"),
    `${JSON.stringify({
      id: nextThread,
      thread_name: "other",
      updated_at: "2026-10-21T00:00:00.000Z",
    })}\n`,
  );
  const unavailableTitles: NativeTitleBindings = new Map();
  const unavailable = await bindNativeCodexFooters(
    agents,
    () => Promise.resolve(footer()),
    apply,
    fixture.env,
    unavailableTitles,
  );
  expect(unavailableTitles.get("pane")).toMatchObject({
    title: { kind: "unavailable" },
  });
  await projectAgents(agents, unavailable, apply, unavailableTitles);
  expect(calls.at(-2)).toEqual(["tab", "rename", "tab", "canonical-agt_abcd"]);
  expect(calls.at(-1)).toContain("fullname=canonical-agt_abcd");
});

test("native title cache inputs react to source changes but ignore observation time", () => {
  const title = (
    overrides: Partial<KnownNativeTitle> = {},
  ): KnownNativeTitle => ({
    kind: "known",
    sessionId: footerThread,
    displayTitle: "thread one",
    sourceUpdatedAt: "2026-10-21T00:00:00.000Z",
    observedAt: "2026-10-21T00:00:01.000Z",
    ...overrides,
  });
  const inputs = (result: KnownNativeTitle) => {
    const titles: NativeTitleBindings = new Map([
      ["pane", { sessionId: footerThread, title: result }],
    ]);
    return JSON.stringify(nativeTitleCacheInputs(titles));
  };
  const baseline = inputs(title());
  expect(
    inputs(
      title({
        observedAt: "2026-10-21T00:01:00.000Z",
      }),
    ),
  ).toBe(baseline);
  expect(inputs(title({ displayTitle: "thread renamed" }))).not.toBe(baseline);
  expect(
    inputs(
      title({
        sourceUpdatedAt: "2026-10-21T00:02:00.000Z",
      }),
    ),
  ).not.toBe(baseline);
});

test("native footer validates exact rollout then reports identity and normal fleet metadata", async () => {
  await using fixture = await nativeFixture();
  await fixture.rollout(footerThread);
  const agents = [
    {
      agent: "codex",
      pane_id: "pane",
      tab_id: "tab",
      cwd: "/workspace/project",
      agent_session: { value: "stale" },
    },
  ];
  const calls: string[][] = [];
  const apply = (args: string[]) => {
    calls.push(args);
    return Promise.resolve(true);
  };
  const sessions = await bindNativeCodexFooters(
    agents,
    () => Promise.resolve(footer()),
    apply,
    fixture.env,
  );
  expect(calls).toEqual([
    [
      "pane",
      "report-agent-session",
      "pane",
      "--source",
      "herdr:codex",
      "--agent",
      "codex",
      "--agent-session-id",
      footerThread,
    ],
  ]);
  expect(await readFleetSession(footerThread, fixture.env)).toMatchObject({
    model: "GPT-6.1-Sol",
    effort: "medium",
    session_id: footerThread,
  });
  await projectAgents(agents, sessions, apply);
  expect(calls.at(-1)).toContain(`fleet_session_id=${footerThread}`);
  expect(calls.at(-1)).toContain("model=GPT-6.1-Sol");
  await fixture.rollout(nextThread);
  const next = await bindNativeCodexFooters(
    agents,
    () => Promise.resolve(footer(nextThread)),
    apply,
    fixture.env,
  );
  await projectAgents(agents, next, apply);
  expect(agents[0]?.agent_session?.value).toBe(nextThread);
  expect(calls.at(-1)).toContain(`fleet_session_id=${nextThread}`);
  const missing = await bindNativeCodexFooters(
    agents,
    () => Promise.resolve("missing footer"),
    apply,
    fixture.env,
  );
  await projectAgents(agents, missing, apply);
  expect(agents[0]?.agent_session).toBeUndefined();
  expect(calls.at(-1)).toContain("fleet_session_id=");
});

const makeAgents = () => [
  {
    agent: "codex",
    pane_id: "pane",
    tab_id: "tab",
    cwd: "/workspace/project",
    agent_session: { value: "stale" },
  },
];

test("footer mismatch, ambiguity, and read-time session switch cannot report a native identity", async () => {
  await using fixture = await nativeFixture();
  const calls: string[][] = [];
  const apply = (args: string[]) => {
    calls.push(args);
    return Promise.resolve(true);
  };
  for (const overrides of [
    { id: nextThread },

    { originator: "Claude Code" },
    { session_id: nextThread },
  ]) {
    await fixture.rollout(footerThread, overrides);
    const agents = makeAgents();
    expect(
      (
        await bindNativeCodexFooters(
          agents,
          () => Promise.resolve(footer()),
          apply,
          fixture.env,
        )
      ).size,
    ).toBe(0);
    expect(agents[0]?.agent_session).toBeUndefined();
  }
  await fixture.rollout(footerThread);
  let reads = 0;
  expect(
    (
      await bindNativeCodexFooters(
        makeAgents(),
        () =>
          Promise.resolve(footer(reads++ === 0 ? footerThread : nextThread)),
        apply,
        fixture.env,
      )
    ).size,
  ).toBe(0);
  await fixture.rollout(footerThread, {}, "duplicate");
  expect(
    (
      await bindNativeCodexFooters(
        makeAgents(),
        () => Promise.resolve(footer()),
        apply,
        fixture.env,
      )
    ).size,
  ).toBe(0);
  expect(calls.length).toBe(5);
  expect(calls.every((args) => !args.includes("--agent-session-id"))).toBe(
    true,
  );
});

test("Claude identity is excluded from footer reads and native reports", async () => {
  const agents = [
    {
      agent: "claude",
      pane_id: "pane",
      tab_id: "tab",
      agent_session: { value: "claude-id" },
    },
  ];
  const calls: string[][] = [];
  let reads = 0;
  await bindNativeCodexFooters(
    agents,
    () => {
      reads++;
      return Promise.resolve(footer());
    },
    (args) => {
      calls.push(args);
      return Promise.resolve(true);
    },
  );
  expect(reads).toBe(0);
  expect(calls).toEqual([]);
  expect(agents[0]?.agent_session?.value).toBe("claude-id");
});

test("bounded exact rollout reads do not inherit stale fleet model when tail has no settings", async () => {
  await using fixture = await nativeFixture();
  const path = await fixture.rollout(footerThread);
  const parsedSeed = FleetSessionSchema.safeParse(
    session({ vendor: "codex", session_id: footerThread, model: "stale" }),
  );
  expect(parsedSeed.success).toBe(true);
  if (!parsedSeed.success) return;
  const seed = parsedSeed.data;
  await Bun.write(
    path,
    (await Bun.file(path).text()) +
      JSON.stringify({
        type: "response_item",
        payload: "x".repeat(512 * 1024),
      }) +
      "\n",
  );
  const result = await refreshCodexFleetSession(seed, fixture.env, path);
  expect(result).toMatchObject({
    session_id: footerThread,
    model: { na: true },
    effort: { na: true },
  });
  await Bun.write(path, "x".repeat(256 * 1024));
  expect(await refreshCodexFleetSession(seed, fixture.env, path)).toMatchObject(
    { na: true },
  );
});

test("native footer retains model and effort only from the same complete observation", () => {
  expect(nativeFooterObservation(footer())).toEqual({
    id: footerThread,
    model: "GPT-6.1-Sol",
    effort: "medium",
    cwd: "~/project",
    state: "Working",
  });
  expect(
    nativeFooterObservation(footer().replace("GPT-6.1-Sol ", "")),
  ).toBeUndefined();
  expect(
    nativeFooterObservation(footer().replace(" medium", "")),
  ).toBeUndefined();
});

test("identical footer projections preserve fleet file inode, content, timestamp and existing observations", async () => {
  await using fixture = await nativeFixture();
  await fixture.rollout(footerThread);
  const prior = session({
    vendor: "codex",
    session_id: footerThread,
    pane_id: "pane",
    model: "old-model",
  });
  expect((await writeFleetSession(prior, fixture.env)).ok).toBe(true);
  const agents = makeAgents();
  const calls: string[][] = [];
  const apply = (args: string[]) => {
    calls.push(args);
    return Promise.resolve(true);
  };
  const read = () => Promise.resolve(footer());
  const first = await bindNativeCodexFooters(agents, read, apply, fixture.env);
  await projectAgents(agents, first, apply);
  const path = join(fixture.root, "fleet", "sessions", `${footerThread}.json`);
  await using original = await open(path, "r");
  const before = await original.stat({ bigint: true });
  const content = await readFile(path, "utf8");
  const observed = await readFleetSession(footerThread, fixture.env);
  expect(observed).toMatchObject({
    name: prior.name,
    ctx: prior.ctx,
    rate: prior.rate,
    model: "GPT-6.1-Sol",
    effort: "medium",
  });
  const second = await bindNativeCodexFooters(agents, read, apply, fixture.env);
  await projectAgents(agents, second, apply);
  const after = await stat(path, { bigint: true });
  expect(after.ino).toBe(before.ino);
  expect(after.mtimeNs).toBe(before.mtimeNs);
  expect(await readFile(path, "utf8")).toBe(content);
  expect(second.get(footerThread)).toEqual(first.get(footerThread));
  const changed = footer().replace("GPT-6.1-Sol medium", "GPT-6-Astra high");
  const third = await bindNativeCodexFooters(
    agents,
    () => Promise.resolve(changed),
    apply,
    fixture.env,
  );
  await projectAgents(agents, third, apply);
  expect((await stat(path, { bigint: true })).ino).not.toBe(before.ino);
  expect(third.get(footerThread)).toMatchObject({
    model: "GPT-6-Astra",
    effort: "high",
    ctx: prior.ctx,
    rate: prior.rate,
  });
  expect(calls.at(-1)).toContain("model=GPT-6-Astra");
});

test("owner's long rollout displays verified native GPT-6.1-Sol medium without tail settings", async () => {
  await using fixture = await nativeFixture();
  const cwd = "/home/fuyu/dotfiles";
  const path = await fixture.rollout(footerThread, { cwd });
  await Bun.write(
    path,
    (await Bun.file(path).text()) +
      JSON.stringify({
        type: "response_item",
        payload: "x".repeat(512 * 1024),
      }) +
      "\n",
  );
  const agents = [{ agent: "codex", pane_id: "wK:pY", tab_id: "tab", cwd }];
  const calls: string[][] = [];
  const apply = (args: string[]) => {
    calls.push(args);
    return Promise.resolve(true);
  };
  const observed = footer().replace("~/project", "~/dotfiles");
  const sessions = await bindNativeCodexFooters(
    agents,
    () => Promise.resolve(observed),
    apply,
    { ...fixture.env, HOME: "/home/fuyu" },
  );
  expect(sessions.get(footerThread)).toMatchObject({
    session_id: footerThread,
    model: "GPT-6.1-Sol",
    effort: "medium",
    cwd,
  });
  await projectAgents(agents, sessions, apply);
  expect(calls.at(-1)).toContain("model=GPT-6.1-Sol");
  expect(calls.at(-1)).toContain("effort=medium");
});

test("same-thread model, effort, cwd or state changes during validation cannot bind a pane", async () => {
  await using fixture = await nativeFixture();
  await fixture.rollout(footerThread);
  const calls: string[][] = [];
  const apply = (args: string[]) => {
    calls.push(args);
    return Promise.resolve(true);
  };
  for (const changed of [
    footer().replace("GPT-6.1-Sol", "GPT-6-Astra"),
    footer().replace(" medium", " high"),
    footer().replace("~/project", "~/different"),
    footer().replace("Working", "Idle"),
    footer().replace(" medium", ""),
  ]) {
    let reads = 0;
    const agents = makeAgents();
    const result = await bindNativeCodexFooters(
      agents,
      () => Promise.resolve(reads++ === 0 ? footer() : changed),
      apply,
      fixture.env,
    );
    expect(result.size).toBe(0);
    expect(agents[0]?.agent_session).toBeUndefined();
  }
  expect(calls.every((args) => !args.includes("--agent-session-id"))).toBe(
    true,
  );
  expect(await readFleetSession(footerThread, fixture.env)).toMatchObject({
    na: true,
  });
});

test("footer switch while native report is pending cannot persist stale fleet observations", async () => {
  await using fixture = await nativeFixture();
  await fixture.rollout(footerThread);
  let displayed = footer();
  const calls: string[][] = [];
  const apply = (args: string[]) => {
    calls.push(args);
    if (args.includes("--agent-session-id")) displayed = footer(nextThread);
    return Promise.resolve(true);
  };
  const agents = makeAgents();
  const result = await bindNativeCodexFooters(
    agents,
    () => Promise.resolve(displayed),
    apply,
    fixture.env,
  );
  expect(result.size).toBe(0);
  expect(agents[0]?.agent_session).toBeUndefined();
  expect(calls.at(-1)).toEqual([
    "pane",
    "report-agent-session",
    "pane",
    "--source",
    "herdr:codex",
    "--agent",
    "codex",
  ]);
  expect(await readFleetSession(footerThread, fixture.env)).toMatchObject({
    na: true,
  });
});

const nativeShortcuts = "← for agents · ? for shortcuts";
const nativeWarning = `${nativeShortcuts}                          ⚠ 1 warning · f2 to view`;
const nativeSelection =
  "New activity · Earlier messages available.  ^c copy · enter copy & follow · esc clear";
const nativeSelectionWithoutEarlier =
  "New activity · ^c copy · enter copy & follow · esc clear";
const liveFooterWitnesses = [
  {
    pane: "w9:p1B",
    id: "01a15704-c5a0-71d0-89c6-c9cebede0a1a",
    cwd: "~/Workspace/example-learner",
    model: "GPT-6.1-Sol",
    state: "Ready",
    controls: nativeShortcuts,
  },
  {
    pane: "wK:pY",
    id: footerThread,
    cwd: "~/dotfiles",
    model: "GPT-6.1-Sol",
    state: "Working",
    controls: nativeShortcuts,
  },
  {
    pane: "wS:pB",
    id: "01a14c81-208c-7910-8f3a-5ba99d58cd0b",
    cwd: "~/Workspace/example-app",
    model: "GPT-6.1-Sol",
    state: "Ready",
    controls: nativeSelection,
  },
  {
    pane: "wW:p4",
    id: "01a15a6e-48ec-78a0-a662-17e7e984e19f",
    cwd: "~/Workspace/example-app",
    model: "GPT-6.1-Sol",
    state: "Ready",
    controls: nativeSelectionWithoutEarlier,
  },
  {
    pane: "wX:p2",
    id: "01a149f4-46fc-7e70-90eb-1031f5666b61",
    cwd: "~/Workspace/example-skills",
    model: "GPT-6.1-Sol",
    state: "Ready",
    controls: nativeWarning,
  },
  {
    pane: "wY:p3",
    id: "01a15444-ce40-7052-b5e9-d5ec23ce5a4a",
    cwd: "~/Workspace/example-records-v2",
    model: "GPT-6.1-Sol",
    state: "Ready",
    controls: nativeShortcuts,
  },
  {
    pane: "wZ:p1",
    id: "01a14aa8-a8bd-7520-a062-ad2fec436099",
    cwd: "/mnt/g/my drive/fuyu  sktn/personal-drive",
    model: "GPT-6.1-Sol",
    state: "Ready",
    controls: nativeShortcuts,
  },
  {
    pane: "w0:p1",
    id: "01a14c5e-e08b-7963-8741-4a1beedcf84a",
    cwd: "~/Workspace/example-app",
    model: "GPT-6-Luna",
    state: "Ready",
    controls: nativeShortcuts,
  },
];

// Acceptance witnesses live only in fixtures; production resolves each explicitly displayed ID.
test("seven native witnesses bind Ready, warning and selection variants and repeat without fleet writes", async () => {
  await using fixture = await nativeFixture();
  const env = { ...fixture.env, HOME: "/home/fuyu" };
  for (const witness of liveFooterWitnesses) {
    const cwd = witness.cwd.replace(/^~\//u, `${env.HOME}/`);
    await fixture.rollout(witness.id, { cwd });
    const observed = `\n  ${witness.id} · ${witness.model} medium · ${witness.cwd} · ${witness.state}\n  ${witness.controls}\n`;
    const agents = [
      {
        agent: "codex",
        pane_id: witness.pane,
        tab_id: "tab",
        cwd: "/old/shell/alias",
      },
    ];
    const calls: string[][] = [];
    const apply = (args: string[]) => {
      calls.push(args);
      return Promise.resolve(true);
    };
    let reads = 0;
    const read = () => {
      reads++;
      return Promise.resolve(observed);
    };
    const first = await bindNativeCodexFooters(agents, read, apply, env);
    expect(reads).toBe(3);
    expect(first.get(witness.id)).toMatchObject({
      session_id: witness.id,
      cwd,
      model: witness.model,
      effort: "medium",
    });
    await projectAgents(agents, first, apply);
    expect(calls.at(-1)).toContain(`model=${witness.model}`);
    expect(calls.at(-1)).toContain("effort=medium");
    const path = join(fixture.root, "fleet", "sessions", `${witness.id}.json`);
    await using original = await open(path, "r");
    const before = await original.stat({ bigint: true });
    const content = await readFile(path, "utf8");
    const second = await bindNativeCodexFooters(agents, read, apply, env);
    expect(second.get(witness.id)).toEqual(first.get(witness.id));
    const after = await stat(path, { bigint: true });
    expect(after.ino).toBe(before.ino);
    expect(after.mtimeNs).toBe(before.mtimeNs);
    expect(await readFile(path, "utf8")).toBe(content);
    // Native control variants never waive exact metadata ID/vendor verification.
    await fixture.rollout(witness.id, { id: nextThread });
    expect((await bindNativeCodexFooters(agents, read, apply, env)).size).toBe(
      0,
    );
  }
});

test("native controls reject extra prose, partial warnings and partial selection rows", () => {
  for (const controls of [
    `${nativeShortcuts} prose ${nextThread}`,
    `${nativeWarning} extra`,
    `${nativeShortcuts} ⚠ 1 warning`,
    `${nativeShortcuts} f2 to view`,
    `${nativeSelection} extra`,
    "^c copy · enter copy & follow · esc clear",
    "New activity · Earlier messages available.",
  ]) {
    const observed = footer()
      .replace("Working", "Ready")
      .replace(nativeShortcuts, controls);
    expect(nativeFooterObservation(observed)).toBeUndefined();
  }
  expect(
    nativeFooterObservation(
      `The session ID is ${footerThread}\n${nativeSelection}`,
    ),
  ).toBeUndefined();
});

import { symlink } from "node:fs/promises";

test("fallback cwd requires verified equivalence while native runtime cwd ignores stale shell alias", async () => {
  await using fixture = await nativeFixture();
  const actual = join(fixture.root, "actual");
  const alias = join(fixture.root, "alias");
  await mkdir(actual);
  await symlink(actual, alias, "dir");
  await fixture.rollout(footerThread, { cwd: actual });
  const prior = session({
    vendor: "codex",
    session_id: footerThread,
    cwd: actual,
    pane_id: "pane",
  });
  expect((await writeFleetSession(prior, fixture.env)).ok).toBe(true);
  const observed = footer()
    .replace("~/project", alias)
    .replace("Working", "Ready");
  const agents = [
    {
      agent: "codex",
      pane_id: "pane",
      tab_id: "tab",
      cwd: "/stale/shell/path",
    },
  ];
  const calls: string[][] = [];
  const apply = (args: string[]) =>
    Promise.resolve(calls.push(args)).then(() => true);
  const result = await bindNativeCodexFooters(
    agents,
    () => Promise.resolve(observed),
    apply,
    fixture.env,
  );
  expect(result.get(footerThread)).toMatchObject({
    cwd: alias,
    ctx: prior.ctx,
    rate: prior.rate,
    name: prior.name,
  });
  await fixture.rollout(footerThread, {
    cwd: join(fixture.root, "nonexistent"),
  });
  const priorSeed = FleetSessionSchema.safeParse(prior);
  expect(priorSeed.success).toBe(true);
  if (!priorSeed.success) return;
  expect(
    await readCodexNativeSession(priorSeed.data, fixture.env),
  ).toMatchObject({ na: true });
  expect(
    (
      await bindNativeCodexFooters(
        agents,
        () => Promise.resolve(footer()),
        apply,
        { ...fixture.env, HOME: undefined },
      )
    ).size,
  ).toBe(0);
});

test("native source authority binds selected agent_session and clears that same authority", async () => {
  await using fixture = await nativeFixture();
  await fixture.rollout(footerThread);
  const selected = new Map<string, string>();
  const metadata = new Map<string, string>();
  const apply = (args: string[]) => {
    if (
      args[1] === "report-agent-session" &&
      args[args.indexOf("--source") + 1] === "herdr:codex"
    ) {
      const flag = args.indexOf("--agent-session-id");
      if (flag < 0) selected.delete(args[2] ?? "");
      else selected.set(args[2] ?? "", args[flag + 1] ?? "");
    }
    if (args[1] === "report-metadata") {
      expect(args[args.indexOf("--source") + 1]).toBe(
        "dotfiles:herdr-projector",
      );
      const token = args.find((value) => value.startsWith("fleet_session_id="));
      metadata.set(
        args[2] ?? "",
        token?.slice("fleet_session_id=".length) ?? "",
      );
    }
    return Promise.resolve(true);
  };
  const agents = makeAgents();
  const sessions = await bindNativeCodexFooters(
    agents,
    () => Promise.resolve(footer()),
    apply,
    fixture.env,
  );
  await projectAgents(agents, sessions, apply);
  expect(selected.get("pane")).toBe(footerThread);
  expect(metadata.get("pane")).toBe(footerThread);
  const cleared = await bindNativeCodexFooters(
    agents,
    () => Promise.resolve("no footer"),
    apply,
    fixture.env,
  );
  await projectAgents(agents, cleared, apply);
  expect(selected.has("pane")).toBe(false);
  expect(metadata.get("pane")).toBe("");
});

test("same-ID creation cwd and verified native runtime cwd have distinct authorities", async () => {
  await using fixture = await nativeFixture();
  const creation = "/mnt/g/My Drive/fuyu  sktn/Personal-Drive";
  const runtime = "/mnt/g/my drive/fuyu  sktn/personal-drive";
  const id = "01a14aa8-a8bd-7520-a062-ad2fec436099";
  const path = await fixture.rollout(id, { cwd: creation });
  const prior = session({
    vendor: "codex",
    session_id: id,
    cwd: creation,
    pane_id: "pane",
  });
  expect((await writeFleetSession(prior, fixture.env)).ok).toBe(true);
  const observed = footer(id)
    .replace("~/project", runtime)
    .replace("Working", "Ready");
  const calls: string[][] = [];
  const apply = (args: string[]) => {
    calls.push(args);
    return Promise.resolve(true);
  };
  const agents = makeAgents();
  const result = await bindNativeCodexFooters(
    agents,
    () => Promise.resolve(observed),
    apply,
    fixture.env,
  );
  expect(result.get(id)).toMatchObject({
    cwd: runtime,
    model: "GPT-6.1-Sol",
    effort: "medium",
    ctx: prior.ctx,
    rate: prior.rate,
    name: prior.name,
  });
  const strictSeed = FleetSessionSchema.safeParse({ ...prior, cwd: runtime });
  expect(strictSeed.success).toBe(true);
  if (!strictSeed.success) return;
  expect(
    await readCodexNativeSession(strictSeed.data, fixture.env, path),
  ).toMatchObject({ na: true });
  for (const overrides of [
    { id: nextThread },
    { originator: "Claude Code" },
    { session_id: nextThread },
  ]) {
    await fixture.rollout(id, { cwd: creation, ...overrides });
    expect(
      (
        await bindNativeCodexFooters(
          agents,
          () => Promise.resolve(observed),
          apply,
          fixture.env,
        )
      ).size,
    ).toBe(0);
  }
});

test("complete native footer cannot bind a missing or over-limit exact rollout", async () => {
  await using fixture = await nativeFixture();
  const calls: string[][] = [];
  const apply = (args: string[]) => {
    calls.push(args);
    return Promise.resolve(true);
  };
  expect(
    (
      await bindNativeCodexFooters(
        makeAgents(),
        () => Promise.resolve(footer()),
        apply,
        fixture.env,
      )
    ).size,
  ).toBe(0);
  // Fixed session_meta limit stays 128 KiB; never scan history to recover a header.
  await fixture.rollout(footerThread, {
    base_instructions: { text: "x".repeat(128 * 1024) },
  });
  expect(
    (
      await bindNativeCodexFooters(
        makeAgents(),
        () => Promise.resolve(footer()),
        apply,
        fixture.env,
      )
    ).size,
  ).toBe(0);
  expect(calls.every((args) => !args.includes("--agent-session-id"))).toBe(
    true,
  );
  expect(await readFleetSession(footerThread, fixture.env)).toMatchObject({
    na: true,
  });
});

test("registration-only native reports cannot refresh prior fleet state without a footer", async () => {
  await using fixture = await nativeFixture();
  // This is a fresh list response whose source fields could have been written
  // by the projector on an earlier pass. The rollout and cwd match too, but
  // none of that proves this pane still displays the registered session.
  const parsed = AgentSchema.safeParse({
    agent: "codex",
    pane_id: "same-cwd-pane",
    tab_id: "same-cwd-tab",
    cwd: "/workspace/project",
    agent_session: {
      value: footerThread,
      source: "herdr:codex",
      kind: "id",
      agent: "codex",
    },
  });
  expect(parsed.success).toBe(true);
  if (!parsed.success) return;
  const agents = [parsed.data];
  await fixture.rollout(footerThread);
  const prior = session({
    vendor: "codex",
    session_id: footerThread,
    cwd: "/workspace/project",
    pane_id: "old-same-cwd-pane",
    model: "stale-model",
    effort: "ultra",
  });
  expect((await writeFleetSession(prior, fixture.env)).ok).toBe(true);
  const path = join(fixture.root, "fleet", "sessions", `${footerThread}.json`);
  const before = await stat(path, { bigint: true });
  const content = await readFile(path, "utf8");
  const calls: string[][] = [];
  const apply = (args: string[]) => {
    calls.push(args);
    return Promise.resolve(true);
  };
  const sessions = await bindNativeCodexFooters(
    agents,
    () => Promise.resolve(undefined),
    apply,
    fixture.env,
  );
  expect(sessions.get(footerThread)).toEqual({
    na: true,
    why: "native footer validation unavailable",
  });
  expect(agents[0]?.agent_session?.value).toBe(footerThread);
  expect(calls).toEqual([]);
  await projectAgents(agents, sessions, apply);
  const after = await stat(path, { bigint: true });
  expect(after.ino).toBe(before.ino);
  expect(after.mtimeNs).toBe(before.mtimeNs);
  expect(await readFile(path, "utf8")).toBe(content);
  expect(calls[0]).toEqual([
    "tab",
    "rename",
    "same-cwd-tab",
    "codex · n/a(session unavailable)",
  ]);
  expect(calls[1]).toContain("fleet_session_id=");
  expect(calls[1]).toContain("model=");
  expect(calls[1]).toContain("effort=");
});

test("untrusted provenance receives no provisional display ID", async () => {
  await using fixture = await nativeFixture();
  const sourceRow = ownerList.agents[0];
  expect(sourceRow).toBeDefined();
  if (sourceRow === undefined) return;
  for (const override of [
    { source: "dotfiles:herdr-projector" },
    { agent: "claude" },
    { kind: "name" },
  ]) {
    const parsed = AgentSchema.safeParse({
      ...sourceRow,
      agent_session: { ...sourceRow.agent_session, ...override },
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const agents = [parsed.data];
    const calls: string[][] = [];
    const sessions = await bindNativeCodexFooters(
      agents,
      () => Promise.resolve(undefined),
      (args) => {
        calls.push(args);
        return Promise.resolve(true);
      },
      fixture.env,
    );
    expect(sessions.size).toBe(0);
    expect(agents[0]?.agent_session).toBeUndefined();
    expect(calls.at(-1)).not.toContain("--agent-session-id");
  }
});
