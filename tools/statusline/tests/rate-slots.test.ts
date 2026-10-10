import { afterEach, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { err, ok } from "neverthrow";
import {
  buildDataframe,
  type BuildDataframeOptions,
} from "../src/build-dataframe.ts";
import { readCodexRate } from "../src/codex-rate.ts";
import { readJevUsage } from "../src/jev-usage.ts";
import { ClaudeStatuslineInputSchema } from "../src/adapters/claude-statusline.ts";
import { RATE_SOURCES, rateRow } from "../src/rate-limits.ts";
import { ESC } from "../src/ansi.ts";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
const plain = (text: string) =>
  text.replaceAll(new RegExp(`${ESC}\\[[0-9;]*m`, "gu"), "");
const now = () => Math.floor(Temporal.Now.instant().epochMilliseconds / 1000);
const rateEvent = (percent = 3) =>
  JSON.stringify({
    type: "event_msg",
    payload: {
      type: "token_count",
      rate_limits: {
        secondary: {
          used_percent: percent,
          window_minutes: 10080,
          resets_at: now() + 604800,
        },
      },
    },
  });
const jevEvent = (at = now()) =>
  JSON.stringify({
    kind: "run",
    started_at: Temporal.Instant.fromEpochMilliseconds(at * 1000).toString(),
    pick: {
      jev: {
        response: { usage: { input_tokens: 900000, output_tokens: 300000 } },
      },
    },
  });

const quietSources = {
  identity: () =>
    Promise.resolve({
      email: undefined,
      accountWhy: undefined,
      rlModel: [],
      modelCapsWhy: undefined,
      wfOn: false,
    }),
  agentName: () => Promise.resolve(ok(undefined)),
  rcState: () => Promise.resolve("unknown" as const),
  repoState: () => Promise.resolve({ branch: undefined, branchWhy: undefined }),
  jobScan: () => Promise.resolve({ jobs: [], orphans: 0 }),
  hostLoad: () =>
    Promise.resolve({
      cpuPct: err("fixture"),
      ram: err("fixture"),
      vram: undefined,
    }),
  routes: () => Promise.resolve(undefined),
  dispatchWarning: () => Promise.resolve(undefined),
  storage: () => Promise.resolve(ok([])),
  herdrReport: () => Promise.resolve(),
  codexRate: () => Promise.resolve(ok(undefined)),
  jevUsage: () => Promise.resolve(ok(undefined)),
} satisfies NonNullable<BuildDataframeOptions["sources"]>;

async function row(payload: unknown = {}, options: BuildDataframeOptions = {}) {
  const parsed = ClaudeStatuslineInputSchema.safeParse(payload);
  expect(parsed.success).toBe(true);
  if (!parsed.success) return "";
  return plain(
    rateRow(
      await buildDataframe(parsed.data, {
        ...options,
        sources: { ...quietSources, ...options.sources },
      }),
    ),
  );
}
function expectSlots(text: string, absent: string) {
  const slots = text.slice("Rate: ".length).split(" | ");
  expect(slots).toHaveLength(RATE_SOURCES.length);
  RATE_SOURCES.forEach((source, index) => {
    expect(slots[index]).toStartWith(`${source} `);
  });
  expect(text).toContain(`${absent} n/a`);
}
async function files() {
  const root = await mkdtemp(join(tmpdir(), "rate-slots-"));
  roots.push(root);
  const day = Temporal.Now.plainDateISO();
  const dir = join(
    root,
    String(day.year),
    String(day.month).padStart(2, "0"),
    String(day.day).padStart(2, "0"),
  );
  await mkdir(dir, { recursive: true });
  return {
    root,
    dir,
    file: join(dir, "rollout-newest.jsonl"),
    log: join(root, "runs.jsonl"),
  };
}

const modes = [
  "missing",
  "empty",
  "no rate info",
  "unparseable",
  "read error",
  "timeout",
  "exception",
  "stale",
] as const;
test.each([...modes])("codex slot: %s", async (mode) => {
  const { root, dir, file } = await files();
  if (mode === "no rate info") {
    const older = join(dir, "rollout-older.jsonl");
    await writeFile(older, rateEvent());
    await utimes(older, now() - 60, now() - 60);
    await writeFile(file, JSON.stringify({ type: "session_meta" }));
  }
  if (mode === "unparseable") await writeFile(file, "{broken json}\n");
  if (mode === "read error" || mode === "stale") {
    await writeFile(file, rateEvent());
    if (mode === "read error") await chmod(file, 0);
    else await utimes(file, now() - 3600, now() - 3600);
  }
  const source = () =>
    readCodexRate(mode === "missing" ? join(root, "missing") : root);
  if (mode === "read error") expect((await source()).isErr()).toBe(true);
  let codexSource = source;
  if (mode === "timeout") codexSource = () => new Promise(() => {});
  if (mode === "exception")
    codexSource = async () => {
      await Bun.file(join(root, "missing")).text();
      return ok(undefined);
    };
  const text = await row(
    {},
    {
      sources: { codexRate: codexSource },
      budgets: { codexRate: mode === "timeout" ? 10 : 1000 },
    },
  );
  expectSlots(text, "codex");
  if (mode === "timeout") expect(text).toContain("codex rate timeout 10ms");
});

test.each([...modes])("Jev slot: %s", async (mode) => {
  const { root, log } = await files();
  if (mode === "empty") await writeFile(log, "");
  if (mode === "no rate info")
    await writeFile(
      log,
      JSON.stringify({
        kind: "run",
        started_at: Temporal.Now.instant().toString(),
        pick: {},
      }),
    );
  if (mode === "unparseable") await writeFile(log, "{broken json}\n");
  if (mode === "stale") await writeFile(log, jevEvent(now() - 8 * 86400));
  if (mode === "read error") {
    await writeFile(log, jevEvent());
    await chmod(log, 0);
  }
  const source = () =>
    readJevUsage(now(), mode === "missing" ? join(root, "missing") : log);
  if (mode === "read error") expect((await source()).isErr()).toBe(true);
  let jevSource = source;
  if (mode === "timeout") jevSource = () => new Promise(() => {});
  if (mode === "exception")
    jevSource = async () => {
      await Bun.file(join(root, "missing")).text();
      return ok(undefined);
    };
  const text = await row(
    {},
    {
      sources: { jevUsage: jevSource },
      budgets: { jevUsage: mode === "timeout" ? 10 : 1000 },
    },
  );
  expectSlots(text, "Jev");
  if (mode === "timeout") expect(text).toContain("Jev usage timeout 10ms");
});

// Claude windows come from stdin, so filesystem failures apply to its supplemental caps
// source, rather than a sessions directory. The same failure table exercises that boundary.
test.each([...modes])("claude slot: %s", async (mode) => {
  let payload: unknown = {};
  if (mode === "empty") payload = { rate_limits: {} };
  if (mode === "no rate info")
    payload = { rate_limits: { five_hour: {}, seven_day: {} } };
  if (mode === "unparseable")
    payload = {
      rate_limits: { five_hour: "bad", seven_day: { used_percentage: "bad" } },
    };
  if (mode === "stale")
    payload = {
      rate_limits: { five_hour: { used_percentage: 20, resets_at: now() - 1 } },
    };
  let identitySource = quietSources.identity;
  if (mode === "timeout") identitySource = () => new Promise(() => {});
  if (mode === "read error" || mode === "exception")
    identitySource = async () => {
      await Bun.file("/definitely/missing/rate-slot-identity").text();
      return quietSources.identity();
    };
  const text = await row(payload, {
    sources: { identity: identitySource },
    budgets: { identity: 10 },
  });
  expectSlots(text, "claude");
  if (mode === "timeout") expect(text).toContain("account timeout 10ms");
});

test("all known provider values and resets remain in their slots", async () => {
  const { root, file, log } = await files();
  await writeFile(file, rateEvent());
  await writeFile(log, jevEvent());
  const text = await row(
    {
      rate_limits: {
        five_hour: { used_percentage: 15, resets_at: now() + 3600 },
      },
    },
    {
      sources: {
        codexRate: () => readCodexRate(root),
        jevUsage: () => readJevUsage(now(), log),
      },
    },
  );
  expect(text).toContain("claude 5h 15% ⟳");
  expect(text).toContain(" | codex 7d  3% ⟳");
  expect(text).toContain(" | Jev 7d spend $0.04");
});

test("empty and credits-only Codex objects retain the slot", () => {
  for (const credits of [undefined, "10"]) {
    const text = plain(
      rateRow({
        rlModel: [],
        codexRate: {
          windows: [],
          mtimeMs: now() * 1000,
          ...(credits === undefined ? {} : { credits }),
        },
      }),
    );
    expectSlots(text, "codex");
  }
});

test("an empty rollout file keeps codex n/a", async () => {
  const { root, file } = await files();
  await writeFile(file, "");
  expectSlots(
    await row({}, { sources: { codexRate: () => readCodexRate(root) } }),
    "codex",
  );
});

test("unrelated writes cannot freshen an old Codex rate event", async () => {
  const { root, file } = await files();
  await writeFile(
    file,
    rateEvent().replace(
      '"type":"event_msg"',
      `"timestamp":"${Temporal.Now.instant().subtract({ hours: 2 }).toString()}","type":"event_msg"`,
    ) + '\n{"type":"response_item"}\n',
  );
  expectSlots(
    await row({}, { sources: { codexRate: () => readCodexRate(root) } }),
    "codex",
  );
});

test("completed sources cannot bypass an exhausted budget", async () => {
  const text = await row(
    {},
    {
      sources: {
        identity: quietSources.identity,
        codexRate: () =>
          Promise.resolve(
            ok({
              windows: [{ minutes: 10080, percent: 3 }],
              mtimeMs: now() * 1000,
            }),
          ),
        jevUsage: () => Promise.resolve(ok({ costUsd: 0.04 })),
      },
      budgets: { identity: 0, codexRate: 0, jevUsage: 0 },
    },
  );
  for (const source of RATE_SOURCES) expectSlots(text, source);
});

test.each([...RATE_SOURCES])(
  "a renderer exception is contained within the %s slot",
  (source) => {
    const text = plain(
      rateRow({
        rlModel: [],
        rl5: source === "claude" ? 3 : undefined,
        rl5Reset: source === "claude" ? 1e20 : undefined,
        codexRate:
          source === "codex"
            ? {
                windows: [{ minutes: 10080, percent: 3, reset: 1e20 }],
                mtimeMs: now() * 1000,
              }
            : undefined,
        jevUsage:
          source === "Jev"
            ? Object.defineProperty({ costUsd: undefined }, "costUsd", {
                get: () => Temporal.Instant.from("invalid").epochMilliseconds,
              })
            : undefined,
      }),
    );
    expectSlots(text, source);
  },
);
