import { afterAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { at, obj, parseJson, strAt } from "../../../hooks/narrow.ts";
const AGX_CONFIG = join(import.meta.dir, "../../../../agents/agx/agx.toml");
import { runHook } from "./helpers.ts";

// enforce-dispatch-contract: the Agent, Task and Workflow tools dispatch nothing. Every worker
// starts through the worker tool, so every one of these calls is denied with its entry points and the roster
// table. The roster itself loads strictly: an unknown key — including the retired `enabled`
// switch — rejects the load, and the hook then fails closed.
// Captured from the unchanged hook and production roster before SEP-ROSTER-HOOK-1023.
const PRODUCTION_DENIAL =
  '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"[dotfiles:dispatch-contract] the Agent tool dispatches nothing — every worker starts with `agx worker run <ticket>` or `agx-worker run <ticket>`. Dispatch with `agx worker dispatch <ticket>` or `agx-worker dispatch <ticket>`. For durable runs use `systemd-run --user --unit=agt_<slug> --collect -- agx worker dispatch …`; continue with `agx worker run <ticket> --continue <run>` or `agx-worker run <ticket> --continue <run>`.\\nRoster (agents/models/dispatch-roster.toml):\\n| default | id | route | AA | TB4 | SciCode | $in/cache/out | cost | use for |\\n| :-: | --- | --- | --: | --: | --: | --- | --: | --- |\\n| ○ | `luna-low` | codex | 22 | – | – | $0.10/$0.01/$0.50 | 1x | lowest-cost simple work: narrow extraction, lookup, or routine text |\\n| ○ | `luna-medium` | codex | 30 | 2.5 | 50.9 | $0.10/$0.01/$0.50 | 1x | bulk read-only work: extraction, inventory, summaries, simple edits |\\n| ● | `luna-high` | codex | 33 | 4.5 | 50.3 | $0.10/$0.01/$0.50 | 1x | the default worker: clear-spec code and text, fixes, tests |\\n| ○ | `luna-xhigh` | codex | 35 | 8.1 | 51.7 | $0.10/$0.01/$0.50 | 1x | wide or risky refactors across many files (measured 2026-10-06: 3/3 complete, 0 regressions where luna-high was 6/7 with 2), and harder reasoning; still weak at long terminal sessions |\\n| ○ | `luna-max` | codex | 38 | 12.6 | 54.6 | $0.10/$0.01/$0.50 | 1x | the deepest luna for work needing maximum luna capability |\\n| ○ | `terra-low` | codex | 28 | 1.5 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-astra-vs-gpt-5-6-terra)) | 49.9 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-astra-vs-gpt-5-6-terra)) | $2/$0.20/$12 | 23.3x | low-cost contained reasoning when luna-low\'s capability is insufficient |\\n| ○ | `terra-medium` | codex | 30 | 1 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-astra-vs-gpt-5-6-terra)) | 50.5 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-astra-vs-gpt-5-6-terra)) | $2/$0.20/$12 | 23.3x | routine reasoning tasks where luna\'s lower index is insufficient |\\n| ○ | `terra-high` | codex | 34 | 1.5 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-astra-vs-gpt-5-6-terra)) | 52.4 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-astra-vs-gpt-5-6-terra)) | $2/$0.20/$12 | 23.3x | moderately difficult reasoning when luna-high is insufficient |\\n| ○ | `terra-xhigh` | codex | 38 | 10.1 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-astra-vs-gpt-5-6-terra)) | 52.3 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-astra-vs-gpt-5-6-terra)) | $2/$0.20/$12 | 23.3x | hard reasoning when luna-max\'s measured capability is insufficient |\\n| ○ | `terra-max` | codex | 42 | 35.4 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-astra-vs-gpt-5-6-terra)) | 55 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-astra-vs-gpt-5-6-terra)) | $2/$0.20/$12 | 23.3x | deep terra reasoning where the strongest luna effort is insufficient |\\n| ○ | `sol-low` | codex | 42 | 30.8 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | 53.2 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | $2/$0.10/$10 | 20x | strong low-effort coding or reasoning; multi-step terminal/agentic work where small models fall short |\\n| ○ | `sol-medium` | codex | 48 | 48 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | 53.2 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | $2/$0.10/$10 | 20x | difficult coding and reasoning with a strong cost-to-capability balance for multi-step terminal/agentic work |\\n| ○ | `sol-high` | codex | 50 | 51.5 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | 55.8 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | $2/$0.10/$10 | 20x | high-difficulty code and tool tasks needing near-top capability for multi-step terminal/agentic work |\\n| ○ | `sol-xhigh` | codex | 51 | 54 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | 55.7 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | $2/$0.10/$10 | 20x | very hard multi-step coding and reasoning requiring near-frontier capability for multi-step terminal/agentic work |\\n| ○ | `sol-max` | codex | 52 | 56.1 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | 54.2 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | $2/$0.10/$10 | 20x | deep sol reasoning for tasks beyond lower-effort sol, including multi-step terminal/agentic work |\\n| ○ | `astra-low` | codex | 46 | 41.9 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | 54.1 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | $10/$1/$50 | 100x | high-capability low-effort work for multi-step terminal/agentic tasks where Sol 6.1 low is insufficient |\\n| ○ | `astra-medium` | codex | 50 | 49.5 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | 54.2 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | $10/$1/$50 | 100x | difficult multi-step terminal/agentic tasks needing stronger capability than Sol 6.1 medium |\\n| ○ | `astra-high` | codex | 51 | 54 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | 55.4 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | $10/$1/$50 | 100x | very difficult multi-step terminal/agentic work where Sol 6.1 high is insufficient |\\n| ○ | `astra-xhigh` | codex | 52 | 59.6 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | 55.7 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | $10/$1/$50 | 100x | frontier-level multi-step terminal/agentic work at high reasoning effort |\\n| ○ | `astra-max` | codex | 53 | 59.1 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | 56.5 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | $10/$1/$50 | 100x | deepest astra reasoning for the most demanding multi-step terminal/agentic work |\\n| ○ | `haiku-low` | claude | 29 | 12.6 ([AA](https://artificialanalysis.ai/models/releases/comparisons/claude-haiku-5-5-vs-deepseek-v4-pro)) | – | $0.10/—/$0.50 | 1x | short tasks and quick Claude Code hook edits |\\n| ○ | `haiku-medium` | claude | 34 | 15.2 ([AA](https://artificialanalysis.ai/models/releases/comparisons/claude-haiku-5-5-vs-deepseek-v4-pro)) | 49 ([AA](https://artificialanalysis.ai/models/comparisons/claude-haiku-5-5-medium-vs-claude-haiku-5-5-xhigh)) | $0.10/—/$0.50 | 1x | short tasks and quick Claude Code hook edits needing more care than haiku-low |\\n| ○ | `haiku-high` | claude | 38 | 21.7 ([AA](https://artificialanalysis.ai/models/releases/comparisons/claude-haiku-5-5-vs-deepseek-v4-pro)) | 49 ([AA](https://artificialanalysis.ai/models/comparisons/claude-haiku-5-5-high-vs-claude-haiku-5-5-medium)) | $0.10/—/$0.50 | 1x | Claude Code hook-sensitive edits needing stronger follow-through |\\n| ○ | `haiku-xhigh` | claude | 41 | 29.3 ([AA](https://artificialanalysis.ai/models/releases/comparisons/claude-haiku-5-5-vs-deepseek-v4-pro)) | 52 ([AA](https://artificialanalysis.ai/models/comparisons/claude-haiku-5-5-vs-claude-haiku-5-5-xhigh)) | $0.10/—/$0.50 | 1x | demanding tasks needing high follow-through |\\n| ○ | `haiku-max` | claude | 43 | 32.8 ([AA](https://artificialanalysis.ai/models/releases/comparisons/claude-haiku-5-5-vs-deepseek-v4-pro)) | 55 ([AA](https://artificialanalysis.ai/models/comparisons/claude-haiku-5-5-vs-claude-haiku-5-5-xhigh)) | $0.10/—/$0.50 | 1x | most demanding Haiku tasks |\\n| ○ | `sonnet-low` | claude | 36 | – | – | $2/—/$10 | 20x | low-effort reasoning |\\n| ○ | `sonnet-medium` | claude | 41 | 29.8 | 52.9 | $2/—/$10 | 20x | multi-step terminal/agentic work with strong measured capability |\\n| ○ | `sonnet-high` | claude | 47 | 43.9 | 53.7 | $2/—/$10 | 20x | hard agentic work, long tool loops, live harness edits |\\n| ○ | `sonnet-xhigh` | claude | 52 | – | – | $2/—/$10 | 20x | very hard agentic work |\\n| ○ | `sonnet-max` | claude | 56 | – | – | $2/—/$10 | 20x | hard long-running agentic work |\\n| ○ | `opus-low` | claude | 42 | – | – | $4/—/$20 | 40x | low-effort design judgment |\\n| ○ | `opus-medium` | claude | 51 | 52.5 | 59.3 | $4/—/$20 | 40x | ambiguous specs, design judgment, factual accuracy, multi-repo changes |\\n| ○ | `opus-high` | claude | 54 | – | – | $4/—/$20 | 40x | hard design and reasoning |\\n| ○ | `opus-xhigh` | claude | 56 | – | – | $4/—/$20 | 40x | very hard design, accuracy, and multi-repo work |\\n| ○ | `opus-max` | claude | 58 | – | – | $4/—/$20 | 40x | most demanding judgment tasks |\\n| ○ | `fable-low` | claude | 47 | – | – | $10/—/$50 | 100x | high-capability low-effort reasoning |\\n| ○ | `fable-medium` | claude | 49 | – | – | $10/—/$50 | 100x | difficult tasks needing more capability than sonnet-medium |\\n| ○ | `fable-high` | claude | 51 | – | – | $10/—/$50 | 100x | very difficult tasks |\\n| ○ | `fable-xhigh` | claude | 53 | – | – | $10/—/$50 | 100x | frontier reasoning for long multi-step tasks |\\n| ○ | `fable-max` | claude | 53 | – | – | $10/—/$50 | 100x | hardest reasoning tasks |"}}\n';
const HOOK = "enforce-dispatch-contract.ts";
const decisionOf = (stdout: string) => {
  const text = stdout.trim();
  const parsed = text === "" ? undefined : parseJson(stdout);
  if (text !== "") expect(parsed).not.toBeUndefined();
  const output =
    parsed === undefined ? undefined : at(parsed, "hookSpecificOutput");
  return {
    decision: strAt(output, "permissionDecision"),
    reason: strAt(output, "permissionDecisionReason") ?? "",
    output: obj(output),
  };
};
const call = (tool: string, input: Record<string, unknown> = {}) => ({
  tool_name: tool,
  tool_input: { prompt: "x", ...input },
});

const scratch = mkdtempSync(join(tmpdir(), "dispatch-roster-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});
const fixtureBin = join(scratch, "bin");
mkdirSync(fixtureBin);
const fixtureCli = join(fixtureBin, "agx-worker");
const realCli = Bun.which("agx-worker") ?? "";
writeFileSync(
  fixtureCli,
  `#!/bin/sh
if [ "$1 $2" != "roster --json" ]; then exit 9; fi
case "$DISPATCH_ROSTER_FIXTURE_MODE" in
  failure) printf '%s' 'fixture failure' >&2; exit 7 ;;
  retired-enabled) printf '%s' 'unknown key enabled' >&2; exit 2 ;;
  invalid-json) printf '%s' 'not json'; exit 0 ;;
  invalid-shape) printf '%s' '{}'; exit 0 ;;
  timeout) exec sleep 5 ;;
esac
exec "$DISPATCH_ROSTER_REAL_CLI" "$@"
`,
);
chmodSync(fixtureCli, 0o755);
const dispatchHook = (
  tool: string,
  input: Record<string, unknown> = {},
  env: Record<string, string> = {},
  cwd?: string,
) =>
  runHook(
    HOOK,
    call(tool, input),
    {
      PATH: `${fixtureBin}${delimiter}${process.env.PATH ?? ""}`,
      DISPATCH_ROSTER_REAL_CLI: realCli,
      AGX_CONFIG,
      ...env,
    },
    cwd,
  );
describe("enforce-dispatch-contract", () => {
  test.each([
    ["Agent", { subagent_type: "sonnet-high" }],
    ["Agent", { subagent_type: "luna-high" }],
    ["Agent", { subagent_type: "Explore" }],
    ["Task", { subagent_type: "general-purpose" }],
    ["Workflow", { script: "export const meta = {}" }],
  ])(
    "%s %o is denied with the agx worker entry points and the roster",
    (tool, input) => {
      const d = decisionOf(dispatchHook(tool, input).stdout);
      expect(d.decision).toBe("deny");
      expect(d.reason).toContain(`the ${tool} tool dispatches nothing`);
      expect(d.reason).toContain(
        "every worker starts with `agx worker run <ticket>` or `agx-worker run <ticket>`",
      );
      expect(d.reason).toContain("agx worker dispatch <ticket>");
      expect(d.reason).toContain("agx-worker dispatch <ticket>");
      expect(d.reason).toContain(
        "systemd-run --user --unit=agt_<slug> --collect -- agx worker dispatch …",
      );
      expect(d.reason).toContain("agx worker run <ticket> --continue <run>");
      expect(d.reason).toContain("agx-worker run <ticket> --continue <run>");
      expect(d.reason).not.toMatch(
        /\bagx (?:run|dispatch|check|ls|judge|stats|roster|doctor|jev)\b/u,
      );
      // the table names every candidate, claude rows included, with its measured numbers and cost
      expect(d.reason).toContain("| ● | `luna-high` | codex | 33 | 4.5 |");
      expect(d.reason).toContain("| ○ | `sonnet-high` | claude | 47 | 43.9 |");
    },
  );

  test("a roster CLI rejection fails closed", () => {
    const d = decisionOf(
      dispatchHook(
        "Agent",
        {},
        { DISPATCH_ROSTER_FIXTURE_MODE: "retired-enabled" },
      ).stdout,
    );
    expect(d.decision).toBe("deny");
    expect(d.reason).toContain("agx-worker roster --json");
    expect(d.reason).toContain("enabled");
  });

  test("production denial matches the captured original bytes from any cwd", () => {
    const result = dispatchHook("Agent", {}, { AGX_CONFIG }, scratch);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(PRODUCTION_DENIAL);
  });

  test("unreadable roster fails closed through the CLI", () => {
    const result = dispatchHook(
      "Task",
      {},
      {
        AGX_CONFIG: join(scratch, "missing.toml"),
      },
    );
    expect(result.code).toBe(0);
    const d = decisionOf(result.stdout);
    expect(d.decision).toBe("deny");
    expect(d.reason).toContain("agx-worker roster --json");
    expect(d.reason).toContain("missing.toml");
  });

  test.each([
    ["failure", "fixture failure"],
    ["invalid-json", "JSON"],
    ["invalid-shape", "invalid roster JSON"],
    ["timeout", "ETIMEDOUT"],
  ])("%s CLI fails closed and names the command", (name, diagnostic) => {
    const started = performance.now();
    const result = dispatchHook(
      "Workflow",
      {},
      {
        DISPATCH_ROSTER_FIXTURE_MODE: name,
      },
    );
    expect(performance.now() - started).toBeLessThan(4000);
    expect(result.code).toBe(0);
    const d = decisionOf(result.stdout);
    expect(d.decision).toBe("deny");
    expect(d.reason).toContain("agx-worker roster --json");
    expect(d.reason).toContain(diagnostic);
  });

  test("missing command fails closed like an unreadable roster", () => {
    const d = decisionOf(
      runHook(HOOK, call("Agent"), { PATH: join(scratch, "empty-path") })
        .stdout,
    );
    expect(d.decision).toBe("deny");
    expect(d.reason).toContain("agx-worker roster --json");
    expect(d.reason).toContain("cannot read roster");
  });

  test("the hook has no agents/models import", () => {
    const source = readFileSync(join(import.meta.dir, "..", HOOK), "utf8");
    expect(source).not.toMatch(/(?:from\s*|import\s*\()["'][^"']*models\//u);
  });

  test("other tools pass untouched", () => {
    expect(
      decisionOf(dispatchHook("Bash", { command: "ls" }).stdout).decision,
    ).toBeUndefined();
  });
});
