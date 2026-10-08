import { afterAll, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { decodedJson } from "./decode.ts";
import { cleanupTempDirs, tempHome } from "./helpers.ts";
import { z } from "../src/zod.ts";

const GOLDEN = join(import.meta.dir, "golden");
// One-shot regeneration: GOLDEN_FROM=<entry.ts> bun test ... rewrites golden/ from that entry.
const GOLDEN_FROM = process.env.GOLDEN_FROM;
const NEW = join(import.meta.dir, "..", "src", "statusline.ts");
const PRELOAD = join(import.meta.dir, "parity-preload.ts");
const NOW = Temporal.Instant.from("2026-10-08T12:34:00Z").epochMilliseconds;
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
const runLine = (
  at: number,
  route: "codex" | "claude",
  source = "jev",
  host = HOST,
): string =>
  JSON.stringify({
    kind: "run",
    host,
    started_at: Temporal.Instant.fromEpochMilliseconds(at).toString(),
    pick: { source, choice: route === "codex" ? "luna-high" : "sonnet-medium" },
    stats: { route },
  });
const recent = (n: number, route: "codex" | "claude" = "claude"): string =>
  Array.from({ length: n }, (_, i) =>
    runLine(NOW - (i + 1) * 60_000, route),
  ).join("\n");
const cacheFor = (host = HOST, available = true): string =>
  JSON.stringify({ host, available });
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
): void => {
  const active = join(state, "active");
  writeFileSync(
    join(active, `${name}.json`),
    JSON.stringify({
      schema: 1,
      run_id: name,
      pid: process.pid,
      label,
      choice: "luna-high",
      pick_source: pickSource,
      started_at: "2026-10-08T12:31:00Z",
      cwd: "/fixture",
      dispatcher_session: "parity-session",
    }),
  );
  if (session !== undefined)
    writeFileSync(join(active, `${name}.progress.json`), progressFor(session));
};

// Extra agent-dispatch state on top of the base worker, written before both entries run.
const stateVariants: [string, (state: string) => void][] = [
  [
    "codex-share warning shown: five recent Jev picks, none codex, codex route available",
    (state) => {
      writeFileSync(join(state, "runs.jsonl"), `${recent(5)}\n`);
      writeFileSync(join(state, "route-capability.json"), cacheFor());
    },
  ],
  [
    "codex-share warning with six picks and one non-Jev pick ignored",
    (state) => {
      writeFileSync(
        join(state, "runs.jsonl"),
        `${recent(6)}\n${runLine(NOW - 1000, "codex", "default")}\n`,
      );
      writeFileSync(join(state, "route-capability.json"), cacheFor());
    },
  ],
  [
    "no warning: a codex pick is present",
    (state) => {
      writeFileSync(
        join(state, "runs.jsonl"),
        `${recent(5)}\n${runLine(NOW - 1000, "codex")}\n`,
      );
      writeFileSync(join(state, "route-capability.json"), cacheFor());
    },
  ],
  [
    "no warning: fewer than five picks",
    (state) => {
      writeFileSync(join(state, "runs.jsonl"), `${recent(4)}\n`);
      writeFileSync(join(state, "route-capability.json"), cacheFor());
    },
  ],
  [
    "no warning: picks older than 24 hours",
    (state) => {
      writeFileSync(
        join(state, "runs.jsonl"),
        `${Array.from({ length: 5 }, () => runLine(NOW - 25 * 3_600_000, "claude")).join("\n")}\n`,
      );
      writeFileSync(join(state, "route-capability.json"), cacheFor());
    },
  ],
  [
    "no warning: route cache is for another host",
    (state) => {
      writeFileSync(join(state, "runs.jsonl"), `${recent(5)}\n`);
      writeFileSync(
        join(state, "route-capability.json"),
        cacheFor("elsewhere"),
      );
    },
  ],
  [
    "no warning: codex route unavailable",
    (state) => {
      writeFileSync(join(state, "runs.jsonl"), `${recent(5)}\n`);
      writeFileSync(
        join(state, "route-capability.json"),
        cacheFor(HOST, false),
      );
    },
  ],
  [
    "no warning: unreadable cache and log",
    (state) => {
      writeFileSync(join(state, "runs.jsonl"), `${recent(5)}\n`);
      writeFileSync(join(state, "route-capability.json"), "not json");
    },
  ],
  [
    "no warning: runs.jsonl missing",
    (state) => {
      writeFileSync(join(state, "route-capability.json"), cacheFor());
    },
  ],
  [
    "session ids sharing a UUIDv7 prefix render distinctly",
    (state) => {
      extraWorker(state, "w1", "0191abcd-0000-7000-8000-11111111abcd");
      extraWorker(state, "w2", "0191abcd-0000-7000-8000-22222222bcde");
    },
  ],
  [
    "session ids sharing their last four digits grow the tail",
    (state) => {
      extraWorker(state, "w1", "01234567-0000-7000-8000-11111111abcd");
      extraWorker(state, "w2", "01239999-0000-7000-8000-22222222abcd");
    },
  ],
  [
    "resume label identifies its row; a missing id reserves the column",
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
];

test.each(stateVariants.map(([name, setup], i) => [i, name, setup] as const))(
  "NEW matches the golden bytes with dispatch state %d: %s",
  (i, _name, setup) => {
    expectGolden(`state-${i}`, FULL_INPUT, setup);
  },
);

test.each(fixtures.map((input, i) => [i, input] as const))(
  "NEW matches the golden bytes for fixture %d: %s",
  (i, input) => {
    expectGolden(`fixture-${i}`, input);
  },
);

function expectGolden(
  name: string,
  input: string,
  extraState?: (state: string) => void,
): void {
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
    fake(
      "ps",
      "echo '9 02:00 /x/agent-resource-run --manifest /m/job.resource.json'\necho '1 00:30 /x/scratchpad/leak'",
    );
    fake(
      "vm_stat",
      "echo 'Mach Virtual Memory Statistics: (page size of 4096 bytes)'\necho 'Pages wired down: 1048576.'\necho 'Pages occupied by compressor: 0.'\necho 'Anonymous pages: 1048576.'\necho 'Pages purgeable: 0.'",
    );
    fake("nvidia-smi", "echo '3584, 12288'");
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
    extraState?.(join(home, "state"));
    const seed = () => {
      writeFileSync(
        join(cache, "statusline-cpu.json"),
        JSON.stringify({ total: 500, idle: 400, at: NOW - 5000 }),
      );
      writeFileSync(
        join(cache, "statusline-gpu.json"),
        JSON.stringify({ at: NOW, reading: { frac: " 3.5/12.0G", pct: 29.2 } }),
      );
      writeFileSync(
        join(cache, "statusline-agent-names.json"),
        JSON.stringify({
          "parity-session": {
            at: NOW,
            name: "fixture-name",
            hint: "fixture-title",
          },
        }),
      );
    };
    const env = {
      HOME: home,
      PATH: bin,
      PWD: "/fixture",
      TZ: "UTC",
      AGENT_ROUTER_STATE_DIR: join(home, "state"),
      CLAUDE_CODE_BRIDGE_SESSION_ID: "bridge",
    };
    const run = (entry: string) => {
      seed();
      const r = Bun.spawnSync([process.execPath, "--preload", PRELOAD, entry], {
        cwd: home,
        env,
        stdin: new Blob([input]),
        timeout: 6000,
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
      return { stdout, snapshots, sessionSnapshot };
    };
    const golden = join(GOLDEN, `${name}.json`);
    if (GOLDEN_FROM !== undefined) {
      mkdirSync(GOLDEN, { recursive: true });
      writeFileSync(golden, `${JSON.stringify(run(GOLDEN_FROM), null, 2)}\n`);
    }
    expect(existsSync(golden), `missing ${golden}`).toBe(true);
    // JSON round-trip: undefined snapshots drop out on both sides.
    expect(decodedJson(z.json(), JSON.stringify(run(NEW)) ?? "")).toEqual(
      decodedJson(z.json(), readFileSync(golden, "utf8")),
    );
  }
}

afterAll(cleanupTempDirs);
