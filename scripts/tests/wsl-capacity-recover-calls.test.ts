import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { err, ok } from "neverthrow";
import { jsonOf, z } from "../../tools/shared/src/zod.ts";
import type { StageRun } from "../wsl-capacity-recover.ts";
import { registry } from "../../tools/disk-reclaim/src/targets/index.ts";
import {
  controllerCalls,
  diskReclaimArgv,
  reclaimStages,
  runReclaimStages,
  type ReclaimStage,
} from "../wsl-capacity-recover.ts";

const ROOT = resolve(import.meta.dir, "../..");
const GiB = 1024 ** 3;
// Executables resolve against the PATH the systemd unit gives the controller, not the test's.
const SERVICE_PATH =
  readFileSync(
    join(ROOT, "wsl/wsl-capacity-recover.service.wsl"),
    "utf8",
  ).match(/^Environment=PATH=(.+)$/mu)?.[1] ?? "";

const MISE = Bun.which("mise") ?? "/home/linuxbrew/.linuxbrew/bin/mise";

function declaredTasks(): Set<string> {
  const listed = Bun.spawnSync([MISE, "tasks", "--json"], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(listed.exitCode).toBe(0);
  const rows = jsonOf(z.array(z.looseObject({ name: z.string() }))).safeParse(
    listed.stdout.toString(),
  );
  expect(rows.success).toBe(true);
  return new Set(rows.success ? rows.data.map((row) => row.name) : []);
}

// Resolve every task or CLI entry one controller command names; return what is undeclared.
function unresolved(
  call: ReclaimStage,
  tasks: Set<string>,
  targets: Set<string>,
): string[] {
  const [, verb, ...rest] = call.argv;
  const missing: string[] = [];
  if (verb === "run") {
    const task = rest[0];
    if (task === undefined || !tasks.has(task)) {
      missing.push(`${call.name}: mise task ${String(task)} is not declared`);
    }
    return missing;
  }
  if (verb !== "exec") {
    return [`${call.name}: unknown mise subcommand ${String(verb)}`];
  }
  const command = rest.slice(rest.indexOf("--") + 1);
  const executable = command[0];
  if (
    executable === undefined ||
    Bun.which(executable, { PATH: SERVICE_PATH }) === null
  ) {
    missing.push(
      `${call.name}: executable ${String(executable)} is not available`,
    );
    return missing;
  }
  if (executable !== "bun") return missing;
  const script = command[1];
  if (script === undefined || !existsSync(script)) {
    missing.push(`${call.name}: script ${String(script)} does not exist`);
    return missing;
  }
  if (script !== join(ROOT, "tools/disk-reclaim/src/reclaim.ts"))
    return missing;
  if (command[2] !== "run") {
    missing.push(`${call.name}: disk-reclaim subcommand ${String(command[2])}`);
  }
  const target = command[3];
  if (target === undefined || !targets.has(target)) {
    missing.push(`${call.name}: disk-reclaim target ${String(target)} unknown`);
  }
  return missing;
}

// A genuinely absent executable: the failure a stage naming a missing command produces.
async function spawnMissingCommand(): Promise<StageRun> {
  const proc = Bun.spawn(["/nonexistent/disk-reclaim"], { stdout: "ignore" });
  return { code: await proc.exited, timedOut: false, output: "" };
}

describe("WSL capacity recovery names only commands that exist", () => {
  const targets = new Set(registry.map((target) => target.name));

  test("every task, script, and disk-reclaim target the controller names resolves", () => {
    const tasks = declaredTasks();
    const calls = controllerCalls(MISE);
    expect(calls.map((call) => call.name)).toEqual([
      "tmpfs",
      "host",
      "builds",
      "clean",
      "cargo-clean",
    ]);
    const missing = calls.flatMap((call) => unresolved(call, tasks, targets));
    expect(missing).toEqual([]);
  });

  test("the resolver rejects a stage naming an undeclared mise task or target", () => {
    const tasks = declaredTasks();
    const retired: ReclaimStage[] = [
      {
        name: "host",
        argv: [MISE, "run", "reclaim:host", "--", "--execute"],
        timeoutMs: 1,
      },
      { name: "builds", argv: [MISE, "run", "reclaim:builds"], timeoutMs: 1 },
      { name: "clean", argv: [MISE, "run", "reclaim:clean"], timeoutMs: 1 },
      {
        name: "ghost",
        argv: diskReclaimArgv(MISE, "no-such-target"),
        timeoutMs: 1,
      },
      {
        name: "missing-executable",
        argv: [MISE, "exec", "--", "no-such-recovery-command"],
        timeoutMs: 1,
      },
    ];
    const missing = retired.flatMap((call) => unresolved(call, tasks, targets));
    expect(missing).toHaveLength(5);
  });

  test("under host pressure each stage executes in order with an explicit target", async () => {
    const executed: string[] = [];
    const stages = reclaimStages(MISE);
    const result = await runReclaimStages({
      stages,
      free: 10 * GiB,
      denyBytes: 60 * GiB,
      run: (stage) => {
        executed.push(stage.argv.join(" "));
        return Promise.resolve({ code: 0, timedOut: false, output: "ok" });
      },
      measure: () => ok(10 * GiB),
      log: () => {},
      warn: () => {},
    });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().failures).toEqual([]);
    expect(executed).toHaveLength(3);
    expect(executed[0]).toContain("reclaim.ts run host --yes");
    expect(executed[1]).toContain("reclaim.ts run builds --yes");
    expect(executed[2]).toContain("reclaim.ts run clean --yes");
  });

  test("stages stop once the host is above the deny line", async () => {
    const executed: string[] = [];
    let free = 10 * GiB;
    const result = await runReclaimStages({
      stages: reclaimStages(MISE),
      free,
      denyBytes: 60 * GiB,
      run: (stage) => {
        executed.push(stage.name);
        free = 70 * GiB;
        return Promise.resolve({ code: 0, timedOut: false, output: "ok" });
      },
      measure: () => ok(free),
      log: () => {},
      warn: () => {},
    });
    expect(executed).toEqual(["host"]);
    expect(result._unsafeUnwrap().free).toBe(70 * GiB);
  });

  test("a stage that errors, exits non-zero, or times out is reported as a failure", async () => {
    const warnings: string[] = [];
    const result = await runReclaimStages({
      stages: reclaimStages(MISE),
      free: 10 * GiB,
      denyBytes: 60 * GiB,
      run: (stage) => {
        if (stage.name === "host") {
          return spawnMissingCommand();
        }
        if (stage.name === "builds") {
          return Promise.resolve({ code: 1, timedOut: false, output: "bad" });
        }
        return Promise.resolve({ code: 0, timedOut: true, output: "" });
      },
      measure: () => ok(10 * GiB),
      log: () => {},
      warn: (message) => {
        warnings.push(message);
      },
    });
    const failures = result._unsafeUnwrap().failures;
    expect(failures).toHaveLength(3);
    expect(failures[0]).toContain("host");
    expect(failures[1]).toContain("builds: exit=1");
    expect(failures[2]).toContain("clean: exit=0 timeout=true");
    expect(warnings).toHaveLength(3);
  });

  test("a failed free-space measurement aborts the stage loop", async () => {
    const result = await runReclaimStages({
      stages: reclaimStages(MISE),
      free: 10 * GiB,
      denyBytes: 60 * GiB,
      run: () => Promise.resolve({ code: 0, timedOut: false, output: "" }),
      measure: () => err(new Error("statfs failed")),
      log: () => {},
      warn: () => {},
    });
    expect(result.isErr()).toBe(true);
  });
});
