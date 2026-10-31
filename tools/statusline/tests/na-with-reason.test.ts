import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ok } from "neverthrow";
import { buildDataframe } from "../src/build-dataframe.ts";
import { render } from "../src/format.ts";
import { publishSnapshots } from "../src/sampler.ts";
import { snapshotWithFleetFacts } from "../src/snapshot-rate.ts";
import {
  writeFleetSession,
  type FleetSession,
} from "@dotfiles/shared/src/fleet-session.ts";
import {
  hasBareUnavailable,
  renderUnavailable,
  roles,
  unavailable,
} from "../src/ansi.ts";
import { observed, renderField } from "../src/field-state.ts";
import { diskSegment, tmpSegment } from "../src/storage-display.ts";
import { formatBytes } from "../src/host-display.ts";
import { codexRateSegment, jevUsageSegment } from "../src/provider-display.ts";
import { routeLines } from "../src/dispatch-display.ts";
import { jsonOf, z } from "../src/zod.ts";

const root = await mkdtemp(join(tmpdir(), "na-with-reason-"));
afterAll(() => rm(root, { recursive: true, force: true }));
const plain = (text: string) =>
  text.replaceAll(
    new RegExp(`${String.fromCodePoint(27)}\\[[0-9;]*m`, "gu"),
    "",
  );
const check = (text: string) => {
  expect(plain(text)).not.toMatch(/\bn\/a\b(?! \()/u);
  expect(hasBareUnavailable(text)).toBe(false);
};

test("unavailable values have one mandatory reason-bearing renderer", () => {
  const reasonRequired: undefined extends Parameters<
    typeof roles.unavailable
  >[1]
    ? false
    : true = true;
  expect(reasonRequired).toBe(true);
  // This assignment fails typechecking if the reason parameter becomes optional again.
  const required: Parameters<typeof roles.unavailable> = [
    "field",
    unavailable("timeout"),
  ];
  expect(plain(roles.unavailable(...required))).toBe("field n/a (timeout)");
  for (const why of ["timeout", "", "  ", "sampler returned n/a"]) {
    check(renderUnavailable(unavailable(why)));
    check(renderField("field", observed(undefined, why)));
  }
  for (const state of [
    { kind: "fresh", value: "n/a" },
    { kind: "stale", value: "CPU n/a", age: 1000 },
  ] as const) {
    const rendered = renderField("field", state);
    check(rendered);
    expect(plain(rendered)).toContain("stored value has no unavailable reason");
  }
  for (const text of [
    "n/a",
    "name n/a · x",
    "\u001B[33mn/a\u001B[0m",
    "n/a ()",
  ])
    expect(hasBareUnavailable(text)).toBe(true);
});

test("every unavailable leaf and every layout carries reasons, including retained fields", async () => {
  const frame = await buildDataframe(
    { cwd: root },
    { ownerSnapshot: Promise.resolve(undefined) },
  );
  const outputs = [
    diskSegment({
      kind: "reading",
      label: "disk",
      usedG: 0,
      totalG: 0,
      freeG: Number.NaN,
    }),
    tmpSegment({
      kind: "reading",
      label: "tmp",
      freeG: 1,
      totalG: 2,
      inodeUsedPct: undefined,
    }),
    ...[-1, Number.NaN, Number.POSITIVE_INFINITY].map((bytes) =>
      formatBytes(bytes),
    ),
    codexRateSegment(undefined),
    codexRateSegment({ windows: [], mtimeMs: 0 }),
    jevUsageSegment(undefined),
    ...routeLines(
      [
        {
          alive: true,
          label: "worker",
          choice: "terra",
          dispatcherSession: "s",
          displayId: undefined,
          pickSource: "fixture",
          phase: undefined,
          workerSession: undefined,
          markerCostUsd: undefined,
          secs: undefined,
          doing: undefined,
        },
      ],
      "s",
    ),
    renderField("field", {
      kind: "stale",
      value: renderUnavailable(unavailable("timeout")),
      age: 1000,
    }),
  ];
  for (const layout of [
    undefined,
    "location",
    "session",
    "shared",
    "block",
    "snapshot",
  ] as const)
    outputs.push(render(frame, layout === undefined ? {} : { layout }));
  for (const output of outputs) check(output);
});

test.each([false, true])(
  "Stop uses the statusline formatter's exact fields (rich input: %s)",
  async (rich) => {
    const priorRoot = process.env["STATUSLINE_CACHE_ROOT"];
    const priorHome = process.env["HOME"];
    const priorRuntime = process.env["XDG_RUNTIME_DIR"];
    const home = join(root, "home");
    process.env["HOME"] = home;
    process.env["STATUSLINE_CACHE_ROOT"] = join(home, ".cache/claude");
    process.env["XDG_RUNTIME_DIR"] = join(home, "runtime");
    using _env = {
      [Symbol.dispose]: () => {
        if (priorRoot === undefined)
          delete process.env["STATUSLINE_CACHE_ROOT"];
        else process.env["STATUSLINE_CACHE_ROOT"] = priorRoot;
        if (priorHome === undefined) delete process.env["HOME"];
        else process.env["HOME"] = priorHome;
        if (priorRuntime === undefined) delete process.env["XDG_RUNTIME_DIR"];
        else process.env["XDG_RUNTIME_DIR"] = priorRuntime;
      },
    };
    {
      const df = await buildDataframe(
        {
          cwd: root,
          sessionId: "parity",
          context: {
            inputTokens: 609800,
            ...(rich ? { usedPercent: 61 } : {}),
          },
          ...(rich
            ? {
                rateLimits: {
                  fiveHour: { usedPercent: 23 },
                  sevenDay: { usedPercent: 47 },
                },
              }
            : {}),
        },
        { ownerSnapshot: Promise.resolve(undefined) },
      );
      const snapshot = render(df, { layout: "snapshot" }).split("\n");
      const full = render(df, { layout: "block" });
      for (const row of snapshot) expect(full).toContain(row);
      await publishSnapshots([], [df]);
      const cached = jsonOf(
        z.object({ rows: z.array(z.object({ ansi: z.string() })) }),
      ).safeParse(
        await readFile(
          join(home, ".cache/claude/statusline-session/parity.json"),
          "utf8",
        ),
      );
      expect(cached.success).toBe(true);
      if (!cached.success) return;
      expect(cached.data.rows.map((row) => row.ansi)).toEqual(
        snapshot.slice(0, 2),
      );
      const child = Bun.spawn(
        [
          process.execPath,
          join(
            import.meta.dir,
            "../../../agents/claude/hooks/log-sys-snapshot.ts",
          ),
        ],
        {
          env: { ...process.env, HOME: home },
          stdin: new Blob([
            JSON.stringify({ hook_event_name: "Stop", session_id: "parity" }),
          ]),
          stdout: "pipe",
          stderr: "pipe",
          timeout: 10000,
        },
      );
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(code, stderr).toBe(0);
      const decoded = jsonOf(z.object({ systemMessage: z.string() })).safeParse(
        stdout,
      );
      expect(decoded.success).toBe(true);
      if (!decoded.success) return;
      const message = decoded.data.systemMessage;
      for (const row of snapshot) expect(message).toContain(row);
      check(message);
      if (!rich) {
        expect(plain(message)).toContain(
          "Ctx: 610k n/a (input has no context percentage)",
        );
        expect(plain(message)).toContain(
          "5h n/a (input has no Claude 5h rate limit)",
        );
      }
    }
  },
);

test("snapshot publication composes same-session fleet Claude with cached Codex through the core renderer", async () => {
  const home = join(root, "mixed-provider-home");
  const runtime = join(home, "runtime");
  await mkdir(runtime, { recursive: true });
  const priorRoot = process.env["STATUSLINE_CACHE_ROOT"];
  const priorHome = process.env["HOME"];
  const priorRuntime = process.env["XDG_RUNTIME_DIR"];
  process.env["HOME"] = home;
  process.env["STATUSLINE_CACHE_ROOT"] = join(home, ".cache/claude");
  process.env["XDG_RUNTIME_DIR"] = runtime;
  using _env = {
    [Symbol.dispose]: () => {
      if (priorRoot === undefined) delete process.env["STATUSLINE_CACHE_ROOT"];
      else process.env["STATUSLINE_CACHE_ROOT"] = priorRoot;
      if (priorHome === undefined) delete process.env["HOME"];
      else process.env["HOME"] = priorHome;
      if (priorRuntime === undefined) delete process.env["XDG_RUNTIME_DIR"];
      else process.env["XDG_RUNTIME_DIR"] = priorRuntime;
    },
  };

  const now = Temporal.Now.instant().epochMilliseconds;
  const future5 = Math.floor(now / 1000) + 60 * 60;
  const future7 = Math.floor(now / 1000) + 6 * 24 * 60 * 60;
  const fleet = {
    schema: 1,
    session_id: "mixed-provider",
    vendor: "claude",
    name: "dotfiles-agt_test",
    model: "Opus",
    effort: "high",
    ctx: { tokens: 609_800, pct: 61 },
    rate: {
      five_h_pct: 1,
      seven_d_pct: 91,
      resets: `5h=${Temporal.Instant.fromEpochMilliseconds(future5 * 1000).toString()};7d=${Temporal.Instant.fromEpochMilliseconds(future7 * 1000).toString()}`,
    },
    cwd: root,
    pane_id: null,
    updated_at: Temporal.Now.instant().toString(),
  } satisfies FleetSession;
  expect((await writeFleetSession(fleet)).ok).toBe(true);

  const codexReset = future7;
  let codexReads = 0;
  const frame = await buildDataframe(
    { cwd: root, sessionId: "mixed-provider" },
    {
      ownerSnapshot: Promise.resolve(undefined),
      sources: {
        codexRate: () => {
          codexReads += 1;
          return Promise.resolve(
            ok({
              windows: [{ minutes: 10080, percent: 8, reset: codexReset }],
              mtimeMs: now,
            }),
          );
        },
      },
    },
  );
  expect(
    snapshotWithFleetFacts(frame, { ...fleet, session_id: "other-session" }),
  ).toBe(frame);
  expect(
    plain(render(frame, { layout: "snapshot" }).split("\n")[1] ?? ""),
  ).toContain("claude n/a");
  expect(
    plain(render(frame, { layout: "snapshot" }).split("\n")[1] ?? ""),
  ).toContain("codex 7d  8%");

  await publishSnapshots([], [frame]);
  expect(codexReads).toBe(1);
  const cached = jsonOf(
    z.object({ rows: z.array(z.object({ ansi: z.string() })) }),
  ).safeParse(
    await readFile(
      join(home, ".cache/claude/statusline-session/mixed-provider.json"),
      "utf8",
    ),
  );
  expect(cached.success).toBe(true);
  if (!cached.success) return;
  const expected = render(snapshotWithFleetFacts(frame, fleet), {
    layout: "snapshot",
  }).split("\n");
  expect(cached.data.rows.map((row) => row.ansi)).toEqual(expected.slice(0, 2));
  expect(plain(cached.data.rows[0]?.ansi ?? "")).toContain("Ctx: 610k 61%");
  const rate = plain(cached.data.rows[1]?.ansi ?? "");
  expect(rate).toContain("claude 5h  1%");
  expect(rate).toContain("7d 91%");
  expect(rate).toContain("codex 7d  8%");
  expect(rate.match(/⟳/gu)?.length).toBe(3);

  const child = Bun.spawn(
    [
      process.execPath,
      join(import.meta.dir, "../../../agents/claude/hooks/log-sys-snapshot.ts"),
    ],
    {
      env: {
        ...process.env,
        HOME: home,
        XDG_RUNTIME_DIR: runtime,
        XDG_STATE_HOME: join(home, ".local/state"),
      },
      stdin: new Blob([
        JSON.stringify({
          hook_event_name: "Stop",
          session_id: "mixed-provider",
        }),
      ]),
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10000,
    },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code, stderr).toBe(0);
  const decoded = jsonOf(z.object({ systemMessage: z.string() })).safeParse(
    stdout,
  );
  expect(decoded.success).toBe(true);
  if (!decoded.success) return;
  const message = plain(decoded.data.systemMessage);
  expect(message).toContain("Ctx: 610k 61%");
  expect(message).toContain("claude 5h  1%");
  expect(message).toContain("7d 91%");
  expect(message).toContain("codex 7d  8%");
});
