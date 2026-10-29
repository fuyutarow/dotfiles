import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const hook = join(import.meta.dir, "../enforce-coord-idle-turn.ts");
const user = (text: string) => ({
  type: "user",
  message: { content: [{ type: "text", text }] },
});
const assistant = (text: string) => ({
  type: "assistant",
  message: { content: [{ type: "text", text }] },
});
const dispatch = {
  type: "assistant",
  message: {
    content: [
      {
        type: "tool_use",
        name: "Bash",
        input: { command: "agx worker dispatch ticket" },
      },
    ],
  },
};
const result = {
  type: "user",
  message: { content: [{ type: "tool_result", tool_use_id: "1" }] },
};
const ended = [{ dispatcher_session: "session", state: "ended" }];

function run(
  options: {
    rows?: unknown;
    entries?: unknown[];
    active?: boolean;
    mode?: string;
  } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "coord-idle-"));
  const transcript = join(dir, "transcript");
  const calls = join(dir, "calls");
  writeFileSync(
    transcript,
    (options.entries ?? [user("work"), assistant("unresolved")])
      .map((entry) => JSON.stringify(entry))
      .join("\n"),
  );
  if (options.mode !== "missing") {
    writeFileSync(
      join(dir, "agx"),
      `#!${process.execPath}\nimport { appendFileSync } from "node:fs";\nappendFileSync(process.env.CALLS, JSON.stringify(process.argv.slice(2)) + "\\n");\nif (process.env.MODE === "timeout") await Bun.sleep(30000);\nif (process.env.MODE === "fail") process.exit(1);\nprocess.stdout.write(process.env.MODE === "invalid" ? "{" : process.env.ROWS);\n`,
      { mode: 0o755 },
    );
  }
  const child = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({
      session_id: "session",
      transcript_path: transcript,
      stop_hook_active: options.active ?? false,
    }),
    encoding: "utf8",
    timeout: 18000,
    env: {
      PATH: dir,
      CALLS: calls,
      MODE: options.mode ?? "ok",
      ROWS: JSON.stringify(options.rows ?? ended),
      CLAUDE_HOOK_QUIET: "1",
    },
  });
  const count = existsSync(calls)
    ? readFileSync(calls, "utf8").trim().split("\n").length
    : 0;
  expect(count).toBeLessThanOrEqual(1);
  return { ...child, count };
}

describe("idle coordinator Stop hook", () => {
  test("blocks an idle coordinator without a declaration", () => {
    const r = run();
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("base:coord 3.3");
    expect(r.count).toBe(1);
  });
  test("dispatch remains in the current turn across tool results", () => {
    expect(
      run({
        entries: [user("work"), dispatch, result, assistant("unresolved")],
      }).status,
    ).toBe(0);
    expect(
      run({
        entries: [
          user("old"),
          dispatch,
          result,
          assistant("old"),
          user("new"),
          assistant("unresolved"),
        ],
      }).status,
    ).toBe(2);
  });
  test("running or never dispatched sessions pass", () => {
    expect(
      run({
        rows: [...ended, { dispatcher_session: "session", state: "running" }],
      }).status,
    ).toBe(0);
    expect(
      run({ rows: [{ dispatcher_session: "other", state: "running" }] }).status,
    ).toBe(0);
  });
  test("declarations must be on the same line", () => {
    for (const text of [
      "workers=0 next check 14:30 JST",
      "workers=0 all-closed",
    ])
      expect(run({ entries: [user("work"), assistant(text)] }).status).toBe(0);
    expect(
      run({
        entries: [user("work"), assistant("workers=0\nnext check 14:30 JST")],
      }).status,
    ).toBe(2);
  });
  test("loop guard and unavailable agx fail open", () => {
    expect(run({ active: true }).status).toBe(0);
    for (const mode of ["missing", "fail", "invalid"])
      expect(run({ mode }).status).toBe(0);
  });
  test("hung agx is bounded and fails open", () => {
    const before = Temporal.Now.instant().epochMilliseconds;
    const r = run({ mode: "timeout" });
    expect(r.status).toBe(0);
    expect(Temporal.Now.instant().epochMilliseconds - before).toBeLessThan(
      17500,
    );
    expect(r.count).toBe(1);
  }, 20000);
});

const commands = (
  config: import("../../../scripts/hook-registry.ts").HooksConfig,
) =>
  Object.values(config)
    .flat()
    .flatMap((group) => group.hooks)
    .map((item) => item.command);

test("registry wires the hook only to Claude Stop", async () => {
  const { loadRegistry, wire } =
    await import("../../../scripts/hook-registry.ts");
  const registry = loadRegistry(join(import.meta.dir, ".."));
  expect(registry.errors).toEqual([]);
  const claude = wire({}, registry.specs, "claude");
  const codex = wire({}, registry.specs, "codex");
  expect(commands({ Stop: claude.Stop ?? [] })).toContain(
    "sh ~/.agents/hooks/run.sh enforce-coord-idle-turn.ts",
  );
  expect(commands(codex)).not.toContain(
    "sh ~/.agents/hooks/run.sh enforce-coord-idle-turn.ts",
  );
});
