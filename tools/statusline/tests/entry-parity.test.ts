import { afterAll, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { setDefaultTimeout } from "bun:test";
import { decodedJson } from "./decode.ts";
import {
  cleanupTempDirs,
  tempHome,
  coreSnapshot,
  seedAgxSnapshot,
} from "./helpers.ts";
import { z } from "../src/zod.ts";
import { version } from "../package.json";
import { hasBareUnavailable } from "../src/ansi.ts";
import routing from "./fixtures/agx-c5-1.5.0.json";

const GOLDEN = join(import.meta.dir, "golden");
setDefaultTimeout(30000);
// One-shot regeneration: GOLDEN_FROM=<entry.ts> bun test ... rewrites golden/ from that entry.
const GOLDEN_FROM = process.env["GOLDEN_FROM"];
// JSON escapes ANSI; inspect decoded presentation strings at the cache boundary.
function presentationStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value))
    return value.flatMap((entry) => presentationStrings(entry));
  if (typeof value === "object" && value !== null)
    return Object.values(value).flatMap((entry) => presentationStrings(entry));
  return [];
}
const NEW = join(import.meta.dir, "..", "src", "statusline.ts");
const PRELOAD = join(import.meta.dir, "parity-preload.ts");
const NOW = Temporal.Instant.from("2026-10-08T12:34:00Z").epochMilliseconds;
const SLOW = { timeout: 30_000 };
const WORKER_SESSION = "4f21abcd-7dab-7d61-8f9b-231c4cc9abcd";

const fixtures = [
  "not JSON",
  JSON.stringify({ context_window: { total_input_tokens: "bad" } }),
  "{}",
  JSON.stringify({
    cwd: "",
    workspace: { current_dir: "" },
    model: null,
    rate_limits: null,
  }),
  JSON.stringify({
    session_id: "parity-session",
    session_name: "fixture-title",
    cwd: "/fixture",
    model: { display_name: "Opus", id: "claude-opus-4-8[1m]" },
    effort: { level: "xhigh" },
    context_window: { total_input_tokens: 12345, used_percentage: 72 },
    cost: { total_lines_added: 3, total_lines_removed: 1 },
    worktree: { name: "feature" },
    rate_limits: {
      five_hour: { used_percentage: 0, resets_at: NOW / 1000 + 7200 },
      seven_day: { used_percentage: 95, resets_at: NOW / 1000 + 172800 },
    },
  }),
  JSON.stringify({
    model: { display_name: "Opus 4.8 (1M context)" },
    context_window: { current_usage: { input_tokens: 0 }, used_percentage: 0 },
    cost: { total_lines_added: 0, total_lines_removed: 0 },
  }),
];

const FULL_INPUT = fixtures[4] ?? "";
const HOST = "fixture-host";
const routingFor = (
  denominator = 5,
  codexPickCount = 0,
  state = "available",
  host = HOST,
) => ({
  ...routing,
  host,
  jev: {
    ...routing.jev,
    pick_count: denominator,
    denominator,
    codex_pick_count: codexPickCount,
    codex_share: denominator === 0 ? null : codexPickCount / denominator,
  },
  routes: { ...routing.routes, codex: { ...routing.routes.codex, state } },
});
const seedRouting = (state: string, value: unknown) => {
  writeFileSync(join(state, "routing-c5.json"), JSON.stringify(value));
};
const progressFor = (session: string): string =>
  JSON.stringify({
    schema: 1,
    at: "2026-10-08T12:33:00Z",
    last: "$ bun test",
    commands: 12,
    files: 3,
    session,
  });
const extraWorker = (
  state: string,
  name: string,
  session: string | undefined,
  pickSource = "fixture",
  label = name,
  dispatcherSession: string | null = "parity-session",
  pid = process.pid,
): void => {
  const active = join(state, "active");
  writeFileSync(
    join(active, `${name}.json`),
    JSON.stringify({
      schema: 1,
      run_id: name,
      pid,
      label,
      choice: "luna-high",
      pick_source: pickSource,
      started_at: "2026-10-08T12:31:00Z",
      cwd: "/fixture",
      ...(dispatcherSession === null
        ? {}
        : { dispatcher_session: dispatcherSession }),
    }),
  );
  if (session !== undefined)
    writeFileSync(join(active, `${name}.progress.json`), progressFor(session));
};
const AGX_FIXTURE_RUNNER =
  'const fs=require("node:fs");const path=require("node:path");const dir=path.join(process.env.AGX_STATE_DIR??"","active");const rows=fs.readdirSync(dir).sort().filter((name)=>name.endsWith(".json")&&!name.endsWith(".progress.json")).map((name)=>{const marker=JSON.parse(fs.readFileSync(path.join(dir,name),"utf8"));let alive=true;try{process.kill(marker.pid,0)}catch{alive=false}const progressPath=path.join(dir,`${marker.run_id}.progress.json`);let progress;try{progress=JSON.parse(fs.readFileSync(progressPath,"utf8"))}catch{}return{id:marker.run_id,ticket:marker.label,row:marker.choice,state:alive?"running":"ended",outcome:alive?null:"lost",health:alive?null:"orphaned",exit:null,cwd:marker.cwd,workspace:marker.cwd,writes:[],judgment:null,report_path:null,dispatcher_session:marker.dispatcher_session??null,vendor_session:marker.worker_session??progress?.session??null,started_at:marker.started_at,continues:marker.pick_source==="resume"?"previous":null,verify:[],last_progress_path:fs.existsSync(progressPath)?progressPath:null,pick_source:marker.pick_source,phase:marker.phase,cost_usd:marker.cost_usd}});process.stdout.write(JSON.stringify(rows));';

// Historical case titles stay stable for alpha failure-name comparison. Warning
// cases now supply C5 responses; the owner has already scoped their host/window.
const stateVariants: [string, (state: string) => void][] = [
  [
    "codex-share warning shown: five recent Jev picks, none codex, codex route available",
    (state) => {
      seedRouting(state, routingFor());
    },
  ],
  [
    "codex-share warning with six picks and one non-Jev pick ignored",
    (state) => {
      seedRouting(state, { ...routingFor(6), fallback_count: 1 });
    },
  ],
  [
    "no warning: a codex pick is present",
    (state) => {
      seedRouting(state, routingFor(6, 1));
    },
  ],
  [
    "no warning: fewer than five picks",
    (state) => {
      seedRouting(state, routingFor(4));
    },
  ],
  [
    "no warning: picks older than 24 hours",
    (state) => {
      seedRouting(state, routingFor(0));
    },
  ],
  [
    "no warning: route cache is for another host",
    (state) => {
      seedRouting(state, routingFor(5, 0, "available", "elsewhere"));
    },
  ],
  [
    "no warning: codex route unavailable",
    (state) => {
      seedRouting(state, routingFor(5, 0, "unavailable"));
    },
  ],
  [
    "no warning: unreadable cache and log",
    (state) => {
      seedRouting(state, "invalid C5 response");
    },
  ],
  [
    "no warning: runs.jsonl missing",
    (state) => {
      seedRouting(state, routingFor(5, 0, "unknown"));
    },
  ],
  [
    "session ids sharing a UUIDv7 prefix stay hidden",
    (state) => {
      extraWorker(state, "w1", "0191abcd-0000-7000-8000-11111111abcd");
      extraWorker(state, "w2", "0191abcd-0000-7000-8000-22222222bcde");
    },
  ],
  [
    "session ids sharing their last four digits stay hidden",
    (state) => {
      extraWorker(state, "w1", "01234567-0000-7000-8000-11111111abcd");
      extraWorker(state, "w2", "01239999-0000-7000-8000-22222222abcd");
    },
  ],
  [
    "resume label identifies its row without a session column",
    (state) => {
      extraWorker(
        state,
        "w1",
        "0191abcd-0000-7000-8000-11111111abcd",
        "resume",
        "resume: w1",
      );
      extraWorker(state, "w2", undefined);
    },
  ],
  [
    "resume and fresh workers with one shared id both show the complete id",
    (state) => {
      extraWorker(
        state,
        "w1",
        "0191abcd-0000-7000-8000-11111111abcd",
        "resume",
        "resume: w1",
      );
      extraWorker(state, "w2", "0191abcd-0000-7000-8000-11111111abcd");
    },
  ],
  [
    "short, empty and dash-only session ids",
    (state) => {
      extraWorker(state, "w1", "ab");
      extraWorker(state, "w2", "abcdef");
      extraWorker(state, "w3", "");
      extraWorker(state, "w4", "----");
    },
  ],
  [
    "Claude, Codex and Jev providers use pipes between groups",
    (state) => {
      const sessions = join(
        state,
        "..",
        ".codex",
        "sessions",
        "2026",
        "10",
        "08",
      );
      mkdirSync(sessions, { recursive: true });
      const rollout = join(sessions, "rollout-providers.jsonl");
      writeFileSync(
        rollout,
        `${JSON.stringify({
          type: "event_msg",
          payload: {
            type: "token_count",
            rate_limits: {
              primary: {
                used_percent: 15,
                window_minutes: 300,
                resets_at: NOW / 1000 + 7200,
              },
              secondary: {
                used_percent: 12,
                window_minutes: 10080,
                resets_at: NOW / 1000 + 172800,
              },
            },
          },
        })}\n`,
      );
      utimesSync(rollout, NOW / 1000, NOW / 1000);
      writeFileSync(
        join(state, "runs.jsonl"),
        `${JSON.stringify({
          kind: "run",
          started_at: "2026-10-08T12:33:00Z",
          pick: {
            jev: {
              response: { usage: { input_tokens: 48_000, output_tokens: 100 } },
            },
          },
        })}\n`,
      );
    },
  ],
  [
    "other, unattributed and stale markers render one summary row",
    (state) => {
      extraWorker(
        state,
        "other",
        undefined,
        "fixture",
        "other",
        "other-session",
      );
      extraWorker(state, "none", undefined, "fixture", "none", null);
      extraWorker(state, "empty", undefined, "fixture", "empty", "");
      extraWorker(
        state,
        "dead",
        undefined,
        "fixture",
        "dead",
        null,
        2_147_483_000,
      );
    },
  ],
  [
    "one summary item renders without extra separators",
    (state) => {
      extraWorker(
        state,
        "other",
        undefined,
        "fixture",
        "other",
        "other-session",
      );
    },
  ],
  ["no summary row renders when every count is zero", () => {}],
];

test.each(stateVariants.map(([name, setup], i) => [i, name, setup] as const))(
  "NEW matches the golden bytes with dispatch state %d: %s",
  (i, _name, setup) => {
    return expectGolden(`state-${i}`, FULL_INPUT, setup);
  },
  SLOW,
);

test.each(fixtures.map((input, i) => [i, input] as const))(
  "NEW matches the golden bytes for fixture %d: %s",
  (i, input) => {
    return expectGolden(`fixture-${i}`, input);
  },
  SLOW,
);

async function expectGolden(
  name: string,
  input: string,
  extraState?: (state: string) => void,
): Promise<void> {
  {
    const home = tempHome();
    const bin = join(home, "bin");
    const cache = join(home, ".cache", "claude");
    const active = join(home, "state", "active");
    mkdirSync(bin);
    mkdirSync(cache, { recursive: true });
    mkdirSync(active, { recursive: true });
    const fake = (binaryName: string, body: string) => {
      const path = join(bin, binaryName);
      writeFileSync(path, `#!/bin/sh\n${body}\n`);
      chmodSync(path, 0o755);
    };
    fake("git", "echo fixture-branch");
    fake("mise", 'shift 5\nexec "$HOME/bin/agx" "$@"');
    fake(
      "agx",
      `if [ "$1" = "status" ]; then exec "${process.execPath}" -e 'process.stdout.write(await Bun.file(process.env.HOME + "/agx-status.json").text())'; fi
if [ "$1" = "worker" ] && [ "$4" = "jev" ]; then echo '{}'; exit 0; fi
if [ "$1" = "worker" ]; then exec "${process.execPath}" -e 'process.stdout.write(await Bun.file(process.env.AGX_STATE_DIR + "/routing-c5.json").text())'; fi
exec "${process.execPath}" -e '${AGX_FIXTURE_RUNNER}'`,
    );
    fake(
      "ps",
      "echo '9 02:00 /x/agent-resource-run --manifest /m/job.resource.json'\necho '1 00:30 /x/scratchpad/leak'",
    );
    fake(
      "vm_stat",
      "echo 'Mach Virtual Memory Statistics: (page size of 4096 bytes)'\necho 'Pages wired down: 1048576.'\necho 'Pages occupied by compressor: 0.'\necho 'Anonymous pages: 1048576.'\necho 'Pages purgeable: 0.'",
    );
    fake("nvidia-smi", "echo '0, 0, 3584, 12288'");
    writeFileSync(
      join(home, ".claude.json"),
      JSON.stringify({
        oauthAccount: { emailAddress: "fixture@example.test" },
        cachedUsageUtilization: {
          utilization: {
            limits: [
              {
                kind: "weekly_scoped",
                percent: 100,
                resets_at: "2026-10-10T12:34:00Z",
                scope: { model: { display_name: "Fable" } },
              },
            ],
          },
        },
      }),
    );
    writeFileSync(join(home, ".claude", "settings.json"), '{"ultracode":true}');
    writeFileSync(
      join(active, "worker.json"),
      JSON.stringify({
        schema: 1,
        run_id: "worker",
        pid: process.pid,
        label: "日本語 worker",
        choice: "luna-high",
        pick_source: "fixture",
        started_at: "2026-10-08T12:32:00Z",
        cwd: "/fixture",
        dispatcher_session: "parity-session",
      }),
    );
    writeFileSync(
      join(active, "worker.progress.json"),
      JSON.stringify({
        schema: 1,
        at: "2026-10-08T12:33:00Z",
        last: "$ bun test",
        commands: 12,
        files: 3,
        session: WORKER_SESSION,
      }),
    );
    seedRouting(join(home, "state"), routingFor(0, 0, "unknown"));
    extraState?.(join(home, "state"));
    const seed = async () => {
      await writeFile(
        join(cache, "statusline-cpu.json"),
        JSON.stringify({ total: 500, idle: 400, at: NOW - 5000 }),
      );
      await mkdir(join(home, "gpu-state"), { recursive: true });
      await writeFile(
        join(home, "gpu-state", "gpu-owner.json"),
        JSON.stringify({
          schema: 1,
          attemptAt: NOW,
          sampledAt: NOW,
          devices: [],
          processes: [],
          samples: [
            {
              ts: NOW,
              nextTs: NOW + 60_000,
              utilPct: 0,
              memUsedGiB: 3.5,
              memTotalGiB: 12,
            },
          ],
        }),
      );
      await writeFile(
        join(cache, "statusline-agent-names.json"),
        JSON.stringify({
          "parity-session": {
            at: NOW,
            name: "fixture-name",
            hint: "fixture-title",
          },
        }),
      );
      await mkdir(join(cache, "statusline"), { recursive: true });
      await writeFile(
        join(cache, "statusline/recover-health.json"),
        JSON.stringify({ capturedAt: NOW, health: null }),
      );
    };
    const env = {
      HOME: home,
      PATH: bin,
      PWD: "/fixture",
      TZ: "UTC",
      AGX_STATE_DIR: join(home, "state"),
      XDG_RUNTIME_DIR: "",
      XDG_STATE_HOME: join(home, "gpu-state"),
      AGX_DISPATCHER_SESSION: "",
      CLAUDE_CODE_SESSION_ID: "",
      CLAUDE_CODE_BRIDGE_SESSION_ID: "bridge",
    };
    const agxRows = Bun.spawnSync([join(bin, "agx"), "ls", "--json"], {
      cwd: home,
      env,
    });
    expect(agxRows.exitCode, agxRows.stderr.toString()).toBe(0);
    const snapshotPath = seedAgxSnapshot(
      env,
      coreSnapshot(agxRows.stdout.toString(), NOW),
      "/fixture",
    );
    expect(existsSync(snapshotPath)).toBe(true);
    const owner = decodedJson(
      z.object({
        fields: z.record(z.string(), z.object({ value: z.unknown() })),
      }),
      readFileSync(snapshotPath, "utf8"),
    );
    writeFileSync(
      join(home, "agx-status.json"),
      JSON.stringify(owner.fields["agx:/fixture"]?.value),
    );
    const run = async (entry: string) => {
      await seed();
      const sampler = Bun.spawnSync(
        [
          process.execPath,
          "--preload",
          PRELOAD,
          join(import.meta.dir, "sample-fixture.ts"),
        ],
        { cwd: home, env, stdin: new Blob([input]), timeout: 30000 },
      );
      expect(sampler.exitCode, sampler.stderr.toString()).toBe(0);
      const r = Bun.spawnSync([process.execPath, "--preload", PRELOAD, entry], {
        cwd: home,
        env,
        stdin: new Blob([input]),
        timeout: 30_000,
      });
      expect(r.exitCode, r.stderr.toString()).toBe(0);
      expect(r.stderr.toString()).toBe("");
      const snapshots =
        input.startsWith("{") && !input.includes('"bad"')
          ? readFileSync(join(cache, "statusline-sys.json"), "utf8")
          : undefined;
      const sessionSnapshot = input.includes("parity-session")
        ? readFileSync(
            join(cache, "statusline-session", "parity-session.json"),
            "utf8",
          )
        : undefined;
      const stdout = r.stdout.toString();
      expect(hasBareUnavailable(stdout)).toBe(false);
      const cacheStrings = [snapshots, sessionSnapshot].flatMap((snapshot) =>
        snapshot === undefined
          ? []
          : presentationStrings(decodedJson(z.json(), snapshot)),
      );
      for (const text of cacheStrings)
        expect(hasBareUnavailable(text)).toBe(false);
      return { stdout, snapshots, sessionSnapshot };
    };
    const golden = join(GOLDEN, `${name}.json`);
    if (GOLDEN_FROM !== undefined) {
      mkdirSync(GOLDEN, { recursive: true });
      writeFileSync(
        golden,
        `${JSON.stringify(await run(GOLDEN_FROM), null, 2)}\n`,
      );
    }
    expect(existsSync(golden), `missing ${golden}`).toBe(true);
    // JSON round-trip: undefined snapshots drop out on both sides.
    const expected = readFileSync(golden, "utf8")
      .replaceAll("5ab1a046da60", HOST)
      // Land bumps package.json after admitting a changeset; the suffix follows that import.
      .replaceAll(/v\d+\.\d+\.\d+/gu, `v${version}`);
    expect(decodedJson(z.json(), JSON.stringify(await run(NEW)) ?? "")).toEqual(
      decodedJson(z.json(), expected),
    );
  }
}

afterAll(cleanupTempDirs);
