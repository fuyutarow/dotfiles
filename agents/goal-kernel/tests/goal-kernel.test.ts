import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonText, z } from "../../hooks/zod.ts";
import {
  activateGoal,
  type GoalContract,
  goalKernelPaths,
  listRunEvents,
  processHookEvent,
  recordRunDecision,
} from "../kernel.ts";
import { buildPostmortem } from "../postmortem.ts";

// Every parsed value enters the test as `unknown` (decoded by the repo's zod codec) and is read
// through a schema (or compared whole with toEqual / toMatchObject).
const jsonValue = (text: string): unknown => jsonText.parse(text);

const SnapshotSchema = z.object({ north_star: z.string() });
const DenyOutputSchema = z.object({
  hookSpecificOutput: z.object({
    permissionDecision: z.string(),
    permissionDecisionReason: z.string(),
  }),
});
const ContextOutputSchema = z.object({
  hookSpecificOutput: z.object({
    hookEventName: z.string(),
    additionalContext: z.string(),
  }),
});
const StoredEventSchema = z.record(z.string(), z.unknown());
const StatusOutputSchema = z.object({
  active: z.object({ goal: z.object({ goal_version: z.number() }) }),
});
const PostmortemOutputSchema = z.object({
  report: z.object({ decisions: z.array(z.unknown()) }),
});

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "goal-kernel-"));
  mkdirSync(join(root, ".git"));
  return root;
}

function requiredRunId(result: Readonly<{ run_id?: string }>): string {
  if (result.run_id === undefined) {
    throw new Error("expected Goal Kernel hook result to include run_id");
  }
  return result.run_id;
}

function goal(overrides: Partial<GoalContract> = {}): GoalContract {
  return {
    schema_version: 1,
    goal_id: "harness-postmortem",
    goal_version: 1,
    supersedes_goal_digest: null,
    north_star:
      "A run id reconstructs the authority and evidence needed for a postmortem.",
    acceptance: [
      "The bound Goal version cannot change during a run.",
      "Prompt and tool payloads are not copied into the event ledger.",
    ],
    non_goals: ["Semantic alignment scoring"],
    decisions: [
      {
        decision_id: "D-001",
        summary: "Use native Claude and Codex hooks as the control plane.",
        parent_decision_id: null,
        evidence_refs: ["survey:maestro-pilot"],
      },
    ],
    authority: {
      actor: "human:test-owner",
      approved_at: "2026-08-03T00:00:00.000Z",
      source: "fixture",
    },
    ...overrides,
  };
}

function hookPayload(
  root: string,
  sessionId: string,
  event: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    cwd: root,
    session_id: sessionId,
    hook_event_name: event,
    transcript_path: null,
    ...extra,
  };
}

describe("immutable Goal authority", () => {
  test("activation snapshots an exact version and rejects an ambiguous rewrite", async () => {
    const root = workspace();
    const original = { ...goal() };
    const first = await activateGoal(root, original);

    original.north_star = "mutated source object";
    const snapshot = SnapshotSchema.parse(
      jsonValue(readFileSync(first.snapshot_path, "utf8")),
    );
    expect(snapshot.north_star).toContain("run id reconstructs");
    expect(snapshot.north_star).not.toContain("mutated");
    expect(first.goal_digest).toMatch(/^[a-f0-9]{64}$/u);

    expect(
      activateGoal(root, goal({ north_star: "conflict" })),
    ).rejects.toThrow("already has a different digest");
  });

  test("a run keeps its bound version when the active pointer changes", async () => {
    const root = workspace();
    const v1 = await activateGoal(root, goal());
    const v2Contract = goal({
      goal_version: 2,
      supersedes_goal_digest: v1.goal_digest,
      north_star: "Version two is the future-session North Star.",
    });
    const v2 = await activateGoal(root, v2Contract);

    const start = await processHookEvent(
      "claude",
      hookPayload(root, "session-old", "SessionStart", { source: "startup" }),
    );
    expect(start.exit_code).toBe(0);
    expect(start.stdout).toContain("Version two");

    await activateGoal(root, goal());
    await processHookEvent(
      "claude",
      hookPayload(root, "session-old", "PreToolUse", {
        tool_name: "Edit",
        tool_use_id: "tool-old",
        tool_input: { file_path: "x", new_string: "changed" },
      }),
    );
    const oldEvents = await listRunEvents(root, requiredRunId(start));
    expect(oldEvents.at(-1)?.goal_digest).toBe(v2.goal_digest);

    const fresh = await processHookEvent(
      "claude",
      hookPayload(root, "session-new", "SessionStart", { source: "startup" }),
    );
    expect(fresh.goal_digest).toBe(v1.goal_digest);
  });

  test("an activation lock interlocks concurrent writers instead of racing the version check", async () => {
    const root = workspace();
    const state = goalKernelPaths(root).state;
    mkdirSync(state, { recursive: true, mode: 0o700 });
    const lock = join(state, ".activation.lock");
    writeFileSync(lock, "{}\n", { mode: 0o600 });
    expect(activateGoal(root, goal())).rejects.toThrow("GK_BUSY");
    unlinkSync(lock);
    expect((await activateGoal(root, goal())).goal_version).toBe(1);
  });
});

describe("hook enforcement and privacy", () => {
  test.each(["claude", "codex"] as const)(
    "%s silently ignores an unconfigured workspace",
    async (provider) => {
      const result = await processHookEvent(
        provider,
        hookPayload(workspace(), "unconfigured", "PreToolUse", {
          tool_name: "Bash",
          tool_use_id: "tool-1",
          tool_input: { command: "touch x" },
        }),
      );
      expect(result).toMatchObject({ exit_code: 0, stdout: "" });
    },
  );

  test.each(["Stop", "SubagentStop"])(
    "Codex %s always returns the JSON required by its protocol",
    async (event) => {
      const unconfigured = await processHookEvent(
        "codex",
        hookPayload(workspace(), "codex-neutral", event),
      );
      expect(jsonValue(unconfigured.stdout)).toEqual({});

      const root = workspace();
      await activateGoal(root, goal());
      const configured = await processHookEvent(
        "codex",
        hookPayload(root, "codex-neutral", event),
      );
      expect(jsonValue(configured.stdout)).toEqual({});
    },
  );

  test("a configured parent does not govern an unconfigured nested git workspace", async () => {
    const parent = workspace();
    await activateGoal(parent, goal());
    const nested = join(parent, "nested");
    mkdirSync(join(nested, ".git"), { recursive: true });
    const result = await processHookEvent(
      "codex",
      hookPayload(nested, "nested-session", "PreToolUse", {
        tool_name: "Bash",
        tool_use_id: "nested-tool",
        tool_input: { command: "true" },
      }),
    );
    expect(result).toMatchObject({ exit_code: 0, stdout: "" });
  });

  test("a checkout-style world-readable config cannot inject Goal context", async () => {
    const trusted = workspace();
    await activateGoal(trusted, goal());
    const target = workspace();
    const targetState = goalKernelPaths(target).state;
    mkdirSync(targetState, { recursive: true });
    writeFileSync(
      goalKernelPaths(target).config,
      readFileSync(goalKernelPaths(trusted).config, "utf8"),
    );
    chmodSync(targetState, 0o755);
    chmodSync(goalKernelPaths(target).config, 0o644);
    const result = await processHookEvent(
      "claude",
      hookPayload(target, "untrusted-config", "SessionStart", {
        source: "startup",
      }),
    );
    expect(result.exit_code).toBe(0);
    expect(result.stdout).toContain("GK_CONFIG_UNTRUSTED");
    expect(result.stdout).not.toContain("harness-postmortem");

    const preTool = await processHookEvent(
      "claude",
      hookPayload(target, "untrusted-config", "PreToolUse", {
        tool_name: "Bash",
        tool_use_id: "untrusted-tool",
        tool_input: { command: "true" },
      }),
    );
    const denied = DenyOutputSchema.parse(jsonValue(preTool.stdout));
    expect(denied.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(denied.hookSpecificOutput.permissionDecisionReason).toContain(
      "GK_CONFIG_UNTRUSTED",
    );
  });

  test.each(["claude", "codex"] as const)(
    "%s denies tools when configured authority is missing",
    async (provider) => {
      const root = workspace();
      await activateGoal(root, goal());
      unlinkSync(goalKernelPaths(root).active);
      const result = await processHookEvent(
        provider,
        hookPayload(root, `${provider}-broken`, "PreToolUse", {
          tool_name: "Bash",
          tool_use_id: "tool-1",
          tool_input: { command: "touch x" },
        }),
      );
      expect(result.exit_code).toBe(0);
      const output = DenyOutputSchema.parse(jsonValue(result.stdout));
      expect(output.hookSpecificOutput.permissionDecision).toBe("deny");
      expect(output.hookSpecificOutput.permissionDecisionReason).toContain(
        "GK_AUTHORITY_UNAVAILABLE",
      );
    },
  );

  test("the ledger hashes prompts, tool inputs, and responses without copying them", async () => {
    const root = workspace();
    await activateGoal(root, goal());
    const secret = "super-secret-value";
    const prompt = await processHookEvent(
      "codex",
      hookPayload(root, "privacy", "UserPromptSubmit", {
        turn_id: "turn-1",
        prompt: `password=${secret}`,
      }),
    );
    await processHookEvent(
      "codex",
      hookPayload(root, "privacy", "PreToolUse", {
        turn_id: "turn-1",
        tool_name: "Bash",
        tool_use_id: "tool-private",
        tool_input: {
          command: `curl -H 'Authorization: ${secret}' example.test`,
        },
      }),
    );
    await processHookEvent(
      "codex",
      hookPayload(root, "privacy", "PostToolUse", {
        turn_id: "turn-1",
        tool_name: "Bash",
        tool_use_id: "tool-private",
        tool_input: {
          command: `curl -H 'Authorization: ${secret}' example.test`,
        },
        tool_response: { output: secret, exit_code: 0 },
      }),
    );
    await processHookEvent(
      "codex",
      hookPayload(root, "privacy", "SessionEnd", {
        reason: `provider reason contains ${secret}`,
      }),
    );

    const encoded = JSON.stringify(
      await listRunEvents(root, requiredRunId(prompt)),
    );
    expect(encoded).not.toContain(secret);
    expect(encoded).not.toContain("password=");
    expect(encoded).not.toContain("Authorization");
    expect(encoded.match(/[a-f0-9]{64}/gu)?.length).toBeGreaterThanOrEqual(3);
  });

  test("post-hoc event edits fail content-digest verification", async () => {
    const root = workspace();
    await activateGoal(root, goal());
    const start = await processHookEvent(
      "claude",
      hookPayload(root, "tamper", "SessionStart", { source: "startup" }),
    );
    const eventsDir = join(
      goalKernelPaths(root).runs,
      requiredRunId(start),
      "events",
    );
    const eventName = readdirSync(eventsDir)[0];
    if (eventName === undefined) throw new Error("expected one run event");
    const eventPath = join(eventsDir, eventName);
    const event = StoredEventSchema.parse(
      jsonValue(readFileSync(eventPath, "utf8")),
    );
    event.event_type = "tampered";
    writeFileSync(eventPath, `${JSON.stringify(event)}\n`);
    expect(listRunEvents(root, requiredRunId(start))).rejects.toThrow(
      "digest mismatch",
    );
  });
});

describe("decision lineage and postmortem reconstruction", () => {
  test("one run id joins Goal, decisions, tool outcome, and a redacted Claude transcript", async () => {
    const root = workspace();
    await activateGoal(root, goal());
    const transcript = join(root, "claude-transcript.jsonl");
    writeFileSync(
      transcript,
      `${[
        {
          type: "user",
          message: {
            content: [
              {
                type: "text",
                text: "Investigate token=transcript-secret-value",
              },
            ],
          },
        },
        {
          type: "assistant",
          message: {
            content: [
              { type: "text", text: "I will inspect the harness." },
              {
                type: "tool_use",
                id: "tool-2",
                name: "Bash",
                input: {
                  command:
                    "OPENAI_API_KEY=transcript-secret-value bun test agents/goal-kernel",
                  token: "plain-json-secret",
                  credential: "opaque-tool-secret",
                },
              },
            ],
          },
        },
      ]
        .map((entry) => JSON.stringify(entry))
        .join("\n")}\n`,
    );
    const start = await processHookEvent(
      "claude",
      hookPayload(root, "postmortem", "SessionStart", {
        source: "startup",
        transcript_path: transcript,
      }),
    );
    const runId = requiredRunId(start);
    await recordRunDecision(root, runId, {
      schema_version: 1,
      decision_id: "D-002",
      summary: "Keep transcript ingestion read-only and on demand.",
      parent_decision_id: "D-001",
      evidence_refs: ["run:fixture"],
      authority: {
        actor: "human:test-owner",
        approved_at: "2026-08-03T00:01:00.000Z",
        source: "fixture",
      },
    });
    await processHookEvent(
      "claude",
      hookPayload(root, "postmortem", "PreToolUse", {
        tool_name: "Edit",
        tool_use_id: "tool-2",
        tool_input: { file_path: "README.md", new_string: "x" },
      }),
    );
    await processHookEvent(
      "claude",
      hookPayload(root, "postmortem", "PostToolUse", {
        tool_name: "Edit",
        tool_use_id: "tool-2",
        tool_input: { file_path: "README.md", new_string: "x" },
        tool_response: { ok: true },
      }),
    );

    const report = await buildPostmortem(root, runId, {
      include_transcript: true,
    });
    expect(report.goal.goal_id).toBe("harness-postmortem");
    expect(report.decisions.map((decision) => decision.decision_id)).toEqual([
      "D-001",
      "D-002",
    ]);
    expect(report.tools).toHaveLength(1);
    expect(report.tools[0]?.outcome).toBe("completed");
    expect(report.tools[0]?.workspace_paths).toEqual(["README.md"]);
    expect(report.transcript?.messages).toHaveLength(2);
    expect(report.transcript?.tool_calls).toHaveLength(1);
    expect(JSON.stringify(report.transcript)).toContain("[REDACTED]");
    expect(JSON.stringify(report)).not.toContain("transcript-secret-value");
    expect(JSON.stringify(report)).not.toContain("plain-json-secret");
    expect(JSON.stringify(report)).not.toContain("opaque-tool-secret");
    expect(report.transcript?.tool_calls[0]?.input_sha256).toMatch(
      /^[a-f0-9]{64}$/u,
    );
  });

  test("decision recording is serialized and a duplicate id cannot be appended", async () => {
    const root = workspace();
    await activateGoal(root, goal());
    const start = await processHookEvent(
      "claude",
      hookPayload(root, "decision-lock", "SessionStart", { source: "startup" }),
    );
    const runId = requiredRunId(start);
    const decision = {
      schema_version: 1 as const,
      decision_id: "D-002",
      summary: "Keep decision ids unique within the immutable run.",
      parent_decision_id: "D-001",
      evidence_refs: ["test:decision-lock"],
      authority: {
        actor: "human:test-owner",
        approved_at: "2026-08-03T00:01:00.000Z",
        source: "fixture",
      },
    };
    const lock = join(goalKernelPaths(root).runs, runId, ".decision.lock");
    writeFileSync(lock, "{}\n", { mode: 0o600 });
    expect(recordRunDecision(root, runId, decision)).rejects.toThrow("GK_BUSY");
    unlinkSync(lock);

    await recordRunDecision(root, runId, decision);
    expect(recordRunDecision(root, runId, decision)).rejects.toThrow(
      "already exists",
    );
    expect(
      (await listRunEvents(root, runId)).filter(
        (event) => event.event_type === "decision.recorded",
      ),
    ).toHaveLength(1);
  });

  test("Codex response_item messages are readable without chat copy/paste", async () => {
    const root = workspace();
    await activateGoal(root, goal());
    const transcript = join(root, "codex-transcript.jsonl");
    writeFileSync(
      transcript,
      `${[
        {
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Why did alignment fail?" }],
          },
        },
        {
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "The Goal was not bound." }],
          },
        },
        {
          type: "response_item",
          payload: {
            type: "function_call",
            name: "exec_command",
            call_id: "codex-call-1",
            arguments: JSON.stringify({
              command: "true",
              credential: "codex-opaque-secret",
            }),
          },
        },
      ]
        .map((entry) => JSON.stringify(entry))
        .join("\n")}\n`,
    );
    const start = await processHookEvent(
      "codex",
      hookPayload(root, "codex-transcript", "SessionStart", {
        source: "startup",
        transcript_path: transcript,
      }),
    );
    const report = await buildPostmortem(root, requiredRunId(start), {
      include_transcript: true,
    });
    expect(report.transcript?.format).toBe("codex-jsonl");
    expect(report.transcript?.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(report.transcript?.tool_calls[0]?.input_sha256).toMatch(
      /^[a-f0-9]{64}$/u,
    );
    expect(JSON.stringify(report)).not.toContain("codex-opaque-secret");
  });
});

describe("real protocol adapters", () => {
  test.each([
    ["claude", join(import.meta.dir, "../../claude/hooks/goal-kernel.ts")],
    ["codex", join(import.meta.dir, "../../codex/hooks/goal-kernel.ts")],
  ] as const)(
    "%s emits provider-compatible SessionStart JSON",
    async (provider, hook) => {
      const root = workspace();
      await activateGoal(root, goal());
      const result = spawnSync(process.execPath, [hook], {
        input: JSON.stringify(
          hookPayload(root, `${provider}-adapter`, "SessionStart", {
            source: "startup",
          }),
        ),
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      const output = ContextOutputSchema.parse(jsonValue(result.stdout));
      expect(output.hookSpecificOutput.hookEventName).toBe("SessionStart");
      expect(output.hookSpecificOutput.additionalContext).toContain(
        "harness-postmortem",
      );
    },
  );

  test.each(["Stop", "SubagentStop"])(
    "the Codex adapter emits valid neutral JSON for %s",
    (event) => {
      const hook = join(import.meta.dir, "../../codex/hooks/goal-kernel.ts");
      const result = spawnSync(process.execPath, [hook], {
        input: JSON.stringify(
          hookPayload(workspace(), "codex-adapter-neutral", event),
        ),
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      expect(jsonValue(result.stdout)).toEqual({});
    },
  );

  test.each([
    ["claude", join(import.meta.dir, "../../claude/hooks/run-goal-kernel.sh")],
    ["codex", join(import.meta.dir, "../../codex/hooks/run-goal-kernel.sh")],
  ] as const)(
    "%s runner blocks enforcement but not observation when Bun is unavailable",
    async (provider, runner) => {
      const root = workspace();
      await activateGoal(root, goal());
      const payload = JSON.stringify(
        hookPayload(root, `${provider}-runner`, "PreToolUse", {
          tool_name: "Bash",
          tool_use_id: "runner-tool",
          tool_input: { command: "true" },
        }),
      );
      const missingRuntime = join(root, "missing-bun");
      const enforce = spawnSync("/bin/sh", [runner, "--enforce"], {
        input: payload,
        encoding: "utf8",
        env: { ...process.env, GOAL_KERNEL_BUN: missingRuntime },
        cwd: root,
      });
      expect(enforce.status).toBe(2);
      expect(enforce.stderr).toContain("Bun runtime required");

      const observe = spawnSync("/bin/sh", [runner], {
        input: payload,
        encoding: "utf8",
        env: { ...process.env, GOAL_KERNEL_BUN: missingRuntime },
        cwd: root,
      });
      expect(observe.status).toBe(0);
      expect(observe.stderr).toContain("event was not observed");
      expect(jsonValue(observe.stdout)).toEqual({});

      const available = spawnSync("/bin/sh", [runner, "--enforce"], {
        input: payload,
        encoding: "utf8",
        env: { ...process.env, GOAL_KERNEL_BUN: process.execPath },
        cwd: root,
      });
      expect(available.status).toBe(0);
      expect(available.stdout).toBe("");
    },
  );

  test.each([
    ["claude", join(import.meta.dir, "../../claude/hooks/run-goal-kernel.sh")],
    ["codex", join(import.meta.dir, "../../codex/hooks/run-goal-kernel.sh")],
  ] as const)(
    "%s no-Bun runner silently passes unconfigured and nested Git workspaces",
    async (provider, runner) => {
      const parent = workspace();
      await activateGoal(parent, goal());
      const nested = join(parent, "nested");
      mkdirSync(join(nested, ".git"), { recursive: true });
      const roots = [workspace(), nested];

      for (const root of roots) {
        const result = spawnSync("/bin/sh", [runner, "--enforce"], {
          input: JSON.stringify(
            hookPayload(root, `${provider}-unconfigured`, "PreToolUse", {
              tool_name: "Bash",
              tool_use_id: "unconfigured-runner-tool",
              tool_input: { command: "true" },
            }),
          ),
          encoding: "utf8",
          env: {
            ...process.env,
            GOAL_KERNEL_BUN: join(parent, "missing-bun"),
          },
          cwd: root,
        });
        expect(result.status).toBe(0);
        expect(result.stdout).toBe("");
        expect(result.stderr).toBe("");
      }
    },
  );
});

describe("Cleye command boundary", () => {
  const cli = join(import.meta.dir, "..", "cli.ts");
  const run = (args: string[]) => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      encoding: "utf8",
    });
    return {
      code: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  };

  test("framework help, strict flags, and the prototype guard keep distinct exits", () => {
    expect(run(["--help"]).code).toBe(0);
    const unknown = run(["status", "--unknown"]);
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain("Unknown flag");
    const prototype = run(["status", "--__proto__"]);
    expect(prototype.code).toBe(2);
    expect(prototype.stderr).toContain("FATAL: unknown option '--__proto__'");
  });

  test("activate is non-interactive, machine-legible, and rejects excess positionals", () => {
    const root = workspace();
    const contract = join(root, "goal.json");
    writeFileSync(contract, `${JSON.stringify(goal())}\n`);
    const activated = run(["activate", contract, "--root", root, "--json"]);
    expect(activated.code).toBe(0);
    expect(jsonValue(activated.stdout)).toMatchObject({
      ok: true,
      command: "activate",
      goal_id: "harness-postmortem",
    });
    const status = run(["status", "--root", root, "--json"]);
    expect(status.code).toBe(0);
    expect(
      StatusOutputSchema.parse(jsonValue(status.stdout)).active.goal
        .goal_version,
    ).toBe(1);

    const extra = run([
      "activate",
      contract,
      "unexpected",
      "--root",
      workspace(),
    ]);
    expect(extra.code).toBe(2);
    expect(extra.stderr).toContain("unexpected argument 'unexpected'");
  });

  test("decide and postmortem join one run through the public CLI", async () => {
    const root = workspace();
    await activateGoal(root, goal());
    const start = await processHookEvent(
      "codex",
      hookPayload(root, "cli-postmortem", "SessionStart", {
        source: "startup",
      }),
    );
    const runId = requiredRunId(start);
    const decisionPath = join(root, "decision.json");
    writeFileSync(
      decisionPath,
      `${JSON.stringify({
        schema_version: 1,
        decision_id: "D-002",
        summary: "Expose one run-id readout through Cleye.",
        parent_decision_id: "D-001",
        evidence_refs: ["test:cli-postmortem"],
        authority: {
          actor: "human:test-owner",
          approved_at: "2026-08-03T00:01:00.000Z",
          source: "fixture",
        },
      })}\n`,
    );

    const decided = run([
      "decide",
      runId,
      decisionPath,
      "--root",
      root,
      "--json",
    ]);
    expect(decided.code).toBe(0);
    expect(jsonValue(decided.stdout)).toMatchObject({
      ok: true,
      command: "decide",
      event: { decision: { decision_id: "D-002" } },
    });

    const postmortem = run(["postmortem", runId, "--root", root, "--json"]);
    expect(postmortem.code).toBe(0);
    expect(jsonValue(postmortem.stdout)).toMatchObject({
      ok: true,
      command: "postmortem",
      report: { run_id: runId, provider: "codex", findings: [] },
    });
    expect(
      PostmortemOutputSchema.parse(jsonValue(postmortem.stdout)).report
        .decisions,
    ).toHaveLength(2);
  });
});
