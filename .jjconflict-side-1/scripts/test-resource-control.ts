// Launcher for `mise run test:resource-control`. Consumer: mise (exit code only; the suite's own
// output streams through untouched).
//
// WHY A LAUNCHER AND NOT A ONE-LINE TASK. The receipt integration test in
// agents/resource-control/tests/agent-resource-run.test.ts verifies a receipt-bearing CHILD from
// inside a receipt-bearing PARENT, so the `bun test` process itself must run under the runner's
// own admission — the task-owned outer envelope examples/resource-runner-tests.resource.json
// (README, "Child admission receipt"). From 2026-08-21 to 2026-09-12 the task never did that, so
// the test only passed when someone wrapped it by hand. The decision "can the runner admit here?"
// is control flow, and wiring-mise-tasks' contract keeps control flow out of TOML bodies (a body
// with a branch cannot be imported or tested), hence this file.
//
// Wrapped when the runner can admit: Linux with a live user systemd (`is-system-running` reports
// running or degraded — degraded still has a working manager, it just has failed units). Anywhere
// else (macOS, no user manager) the suite runs plain and the receipt test declares its own SKIP
// with the wrapped command printed. Measured 2026-09-12 wrapped on WSL2: 38 pass / 0 skip,
// PASS job=resource-runner-tests code=0.
//
// NO FLAGS: mise is the only caller and passes nothing, so there is no Cleye boundary to owe
// (writing-bun-scripts BG1).

const SUITE = [
  "bun",
  "test",
  "agents/resource-control",
  "agents/serena-control",
];
const ENVELOPE =
  "agents/resource-control/examples/resource-runner-tests.resource.json";

function userSystemdCanAdmit(): boolean {
  if (process.platform !== "linux") return false;
  if (!Bun.which("systemctl")) return false;
  const probe = Bun.spawnSync(["systemctl", "--user", "is-system-running"], {
    stdout: "pipe",
    stderr: "ignore",
    timeout: 5_000,
  });
  const state = probe.stdout.toString().trim();
  return state === "running" || state === "degraded";
}

const command = userSystemdCanAdmit()
  ? [
      "bun",
      "agents/resource-control/agent-resource-run.ts",
      "--manifest",
      ENVELOPE,
      "--",
      ...SUITE,
    ]
  : SUITE;

// The wrapped form is bounded by the envelope's own walltime; the plain form is the suite
// itself, which mise's caller (a human or CI) already bounds — a second timer here would only
// race the test runner's own.
// bounded: envelope walltime (wrapped) / caller-bounded suite (plain)
const run = Bun.spawnSync(command, {
  stdio: ["inherit", "inherit", "inherit"],
});
process.exitCode = run.exitCode ?? 1;
