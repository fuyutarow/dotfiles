import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runHook, tempDir } from "./helpers.ts";

const HOOK = "detect-ccc-gpu-hold.ts";
const MIN = 60_000;

let daemon: ChildProcess;
let dir: string;

// A real process whose /proc cmdline reads "ccc run-daemon ...", so the hook's identity check
// runs against /proc exactly as it does in production.
beforeAll(async () => {
  daemon = spawn("bash", ["-c", 'exec -a "ccc run-daemon" sleep 300'], {
    stdio: "ignore",
  });
  await Bun.sleep(100);
  dir = tempDir("ccc-gpu-hold-");
  writeFileSync(
    join(dir, "nvidia-smi"),
    `#!/bin/sh
echo called >> "${dir}/smi.log"
case "$1" in
  --query-compute-apps=*) cat "${dir}/apps" ;;
  *) echo "37, 2385, 12288" ;;
esac
`,
  );
  writeFileSync(join(dir, "ccc"), `#!/bin/sh\ncat "${dir}/status"\n`);
  chmodSync(join(dir, "nvidia-smi"), 0o755);
  chmodSync(join(dir, "ccc"), 0o755);
});

afterAll(() => daemon.kill());

const INDEXING = "Projects:\n  /w/firedancer [idle]\n  /w/qoed [indexing]\n";
const IDLE = "Projects:\n  /w/firedancer [idle]\n";

function setup(opts: { apps: number[]; status?: string; state?: object }) {
  const state = join(tempDir("ccc-gpu-hold-state-"), "state.json");
  writeFileSync(join(dir, "apps"), opts.apps.map((p) => `${p}\n`).join(""));
  writeFileSync(join(dir, "status"), opts.status ?? INDEXING);
  writeFileSync(join(dir, "smi.log"), "");
  if (opts.state) writeFileSync(state, JSON.stringify(opts.state));
  const env = {
    CCC_GPU_HOLD_STATE: state,
    CCC_GPU_HOLD_NVIDIA_SMI: join(dir, "nvidia-smi"),
    CCC_GPU_HOLD_CCC: join(dir, "ccc"),
  };
  return { state, env };
}

// A state whose indexing streak began `minutes` ago under the fake daemon's PID.
const streak = (minutes: number, extra: object = {}) => ({
  pid: daemon.pid,
  indexing: ["/w/qoed"],
  indexingSinceMs: Date.now() - minutes * MIN,
  lastProbeMs: 0,
  alerted: {},
  ...extra,
});

const payload = (event = "PreToolUse", session = "s1") => ({
  hook_event_name: event,
  session_id: session,
  tool_name: "Bash",
  tool_input: { command: "ls" },
});
const probes = () =>
  readFileSync(join(dir, "smi.log"), "utf8").split("\n").filter(Boolean).length;

describe("detect-ccc-gpu-hold", () => {
  test("no nvidia-smi on the host: silent, no state written", () => {
    const { state, env } = setup({ apps: [] });
    const r = runHook(HOOK, payload(), {
      ...env,
      CCC_GPU_HOLD_NVIDIA_SMI: "/nonexistent/nvidia-smi",
    });
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
    expect(existsSync(state)).toBe(false);
  });

  test("indexing first observed: starts the clock, no alert yet", () => {
    const { state, env } = setup({ apps: [daemon.pid!] });
    expect(runHook(HOOK, payload(), env).stdout).toBe("");
    const s = JSON.parse(readFileSync(state, "utf8"));
    expect(s.pid).toBe(daemon.pid);
    expect(s.indexing).toEqual(["/w/qoed"]);
    expect(Date.now() - s.indexingSinceMs).toBeLessThan(MIN);
  });

  test("indexing past the threshold: alerts, labels util host-wide, never decides, never says stop", () => {
    const { env } = setup({ apps: [daemon.pid!], state: streak(20) });
    const r = runHook(HOOK, payload(), env);
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.systemMessage).toContain(
      "indexing /w/qoed on the GPU for 20 min",
    );
    const ctx: string = out.hookSpecificOutput.additionalContext;
    expect(ctx).toContain("host-wide GPU util 37%, VRAM 2385/12288 MiB");
    expect(ctx).toContain("NOT the daemon's load");
    expect(ctx).toContain("Do NOT stop ccc-daemon");
    expect(ctx).not.toContain("systemctl --user stop");
    expect(out.hookSpecificOutput.hookEventName).toBe("PreToolUse");
    expect(out.hookSpecificOutput.permissionDecision).toBeUndefined();
  });

  test("an IDLE hold never alerts, however long, and resets the streak", () => {
    const { state, env } = setup({
      apps: [daemon.pid!],
      status: IDLE,
      state: streak(400),
    });
    expect(runHook(HOOK, payload(), env).stdout).toBe("");
    expect(JSON.parse(readFileSync(state, "utf8")).indexingSinceMs).toBe(0);
  });

  test("UserPromptSubmit gets the same alert under its own event name", () => {
    const { env } = setup({ apps: [daemon.pid!], state: streak(20) });
    const out = JSON.parse(
      runHook(HOOK, payload("UserPromptSubmit"), env).stdout,
    );
    expect(out.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
  });

  test("a session alerted recently is not re-alerted; another session is", () => {
    const { env } = setup({
      apps: [daemon.pid!],
      state: streak(40, { alerted: { s1: Date.now() - 5 * MIN } }),
    });
    expect(runHook(HOOK, payload("PreToolUse", "s1"), env).stdout).toBe("");
    expect(runHook(HOOK, payload("PreToolUse", "s2"), env).stdout).toContain(
      "CCC-GPU-INDEXING",
    );
  });

  test("a different daemon PID restarts the clock", () => {
    const { state, env } = setup({
      apps: [daemon.pid!],
      state: streak(60, { pid: 1 }),
    });
    expect(runHook(HOOK, payload(), env).stdout).toBe("");
    const s = JSON.parse(readFileSync(state, "utf8"));
    expect(s.pid).toBe(daemon.pid);
    expect(Date.now() - s.indexingSinceMs).toBeLessThan(MIN);
  });

  test("a non-ccc compute app is not the daemon", () => {
    const { state, env } = setup({ apps: [process.pid], state: streak(60) });
    expect(runHook(HOOK, payload(), env).stdout).toBe("");
    const s = JSON.parse(readFileSync(state, "utf8"));
    expect(s.pid).toBeNull();
    expect(s.indexingSinceMs).toBe(0);
  });

  test("within the probe interval the cached observation is used, nothing is re-probed", () => {
    const { env } = setup({
      apps: [],
      status: IDLE,
      state: streak(20, { lastProbeMs: Date.now() - 10_000 }),
    });
    const r = runHook(HOOK, payload(), env);
    expect(r.stdout).toContain("CCC-GPU-INDEXING");
    // Only the alert's own host-wide util/VRAM query ran — no compute-apps probe.
    expect(probes()).toBe(1);
  });

  test("malformed stdin: exit 0, silent", () => {
    const { env } = setup({ apps: [] });
    const r = runHook(HOOK, "{not json", env);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });
});
