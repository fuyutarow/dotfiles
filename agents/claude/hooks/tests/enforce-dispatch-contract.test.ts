import { afterAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { at, obj, parseJson, strAt } from "../../../hooks/narrow.ts";
import {
  HOMEBREW_AGX,
  isolatedTestEnv,
  TEST_TMPDIR,
  testPathWithStub,
} from "../../../../scripts/tests/support/test-isolation.ts";
const dotfilesRoot = realpathSync(resolve(import.meta.dir, "../../../../"));
const AGX_CONFIG = join(dotfilesRoot, "agents/agx/agx.toml");
const NO_USE_FOR_FIXTURE = join(
  dotfilesRoot,
  "scripts/tests/fixtures/agx-roster-no-use-for.json",
);
import { runHook } from "./helpers.ts";

// enforce-dispatch-contract: the Agent, Task and Workflow tools dispatch nothing. Every worker
// starts through the worker tool, so every one of these calls is denied with its entry points and the roster
// table. The roster itself loads strictly: an unknown key — including the retired `enabled`
// switch — rejects the load, and the hook then fails closed.
// Captured from the hook and production roster; use_for values are normalized below
// because the installed agx may omit that optional field.
const PRODUCTION_DENIAL =
  '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"[dotfiles:dispatch-contract] the Agent tool dispatches nothing — every worker starts with `agx worker run <ticket>` or `agx-worker run <ticket>`. Dispatch with `agx worker dispatch <ticket>` or `agx-worker dispatch <ticket>`. For durable runs use `systemd-run --user --unit=agt_<slug> --collect -- agx worker dispatch …`; continue with `agx worker run <ticket> --continue <run>` or `agx-worker run <ticket> --continue <run>`.\\nRoster (agx worker roster --json):\\n| default | id | route | AA | TB4 | SciCode | $in/cache/out | cost | use for |\\n| :-: | --- | --- | --: | --: | --: | --- | --: | --- |\\n| ○ | `luna-low` | codex | 22 | – | – | $0.10/$0.01/$0.50 | 1x | – |\\n| ○ | `luna-medium` | codex | 30 | 2.5 | 50.9 | $0.10/$0.01/$0.50 | 1x | – |\\n| ● | `luna-high` | codex | 33 | 4.5 | 50.3 | $0.10/$0.01/$0.50 | 1x | – |\\n| ○ | `luna-xhigh` | codex | 35 | 8.1 | 51.7 | $0.10/$0.01/$0.50 | 1x | – |\\n| ○ | `luna-max` | codex | 38 | 12.6 | 54.6 | $0.10/$0.01/$0.50 | 1x | – |\\n| ○ | `terra-low` | codex | 36 | 15.2 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-terra-vs-gpt-6-astra)) | 52.4 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-terra-vs-gpt-6-astra)) | $1/$0.05/$5 | 10x | – |\\n| ○ | `terra-medium` | codex | 41 | 32.3 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-terra-vs-gpt-6-astra)) | 51.6 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-terra-vs-gpt-6-astra)) | $1/$0.05/$5 | 10x | – |\\n| ○ | `terra-high` | codex | 44 | 41.9 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-terra-vs-gpt-6-astra)) | 51.6 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-terra-vs-gpt-6-astra)) | $1/$0.05/$5 | 10x | – |\\n| ○ | `terra-xhigh` | codex | 45 | 46.5 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-terra-vs-gpt-6-astra)) | 53.4 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-terra-vs-gpt-6-astra)) | $1/$0.05/$5 | 10x | – |\\n| ○ | `terra-max` | codex | 48 | 55.6 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-terra-vs-gpt-6-astra)) | 55.1 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-terra-vs-gpt-6-astra)) | $1/$0.05/$5 | 10x | – |\\n| ○ | `sol-low` | codex | 42 | 30.8 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | 53.2 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | $2/$0.10/$10 | 20x | – |\\n| ○ | `sol-medium` | codex | 48 | 48 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | 53.2 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | $2/$0.10/$10 | 20x | – |\\n| ○ | `sol-high` | codex | 50 | 51.5 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | 55.8 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | $2/$0.10/$10 | 20x | – |\\n| ○ | `sol-xhigh` | codex | 51 | 54 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | 55.7 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | $2/$0.10/$10 | 20x | – |\\n| ○ | `sol-max` | codex | 52 | 56.1 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | 54.2 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | $2/$0.10/$10 | 20x | – |\\n| ○ | `astra-low` | codex | 46 | 41.9 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | 54.1 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | $10/$1/$50 | 100x | – |\\n| ○ | `astra-medium` | codex | 50 | 49.5 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | 54.2 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | $10/$1/$50 | 100x | – |\\n| ○ | `astra-high` | codex | 51 | 54 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | 55.4 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | $10/$1/$50 | 100x | – |\\n| ○ | `astra-xhigh` | codex | 52 | 59.6 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | 55.7 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | $10/$1/$50 | 100x | – |\\n| ○ | `astra-max` | codex | 53 | 59.1 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | 56.5 ([AA](https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra)) | $10/$1/$50 | 100x | – |\\n| ○ | `haiku-low` | claude | 29 | 12.6 ([AA](https://artificialanalysis.ai/models/releases/comparisons/claude-haiku-5-5-vs-deepseek-v4-pro)) | – | $0.10/—/$0.50 | 1x | – |\\n| ○ | `haiku-medium` | claude | 34 | 15.2 ([AA](https://artificialanalysis.ai/models/releases/comparisons/claude-haiku-5-5-vs-deepseek-v4-pro)) | 49 ([AA](https://artificialanalysis.ai/models/comparisons/claude-haiku-5-5-medium-vs-claude-haiku-5-5-xhigh)) | $0.10/—/$0.50 | 1x | – |\\n| ○ | `haiku-high` | claude | 38 | 21.7 ([AA](https://artificialanalysis.ai/models/releases/comparisons/claude-haiku-5-5-vs-deepseek-v4-pro)) | 49 ([AA](https://artificialanalysis.ai/models/comparisons/claude-haiku-5-5-high-vs-claude-haiku-5-5-medium)) | $0.10/—/$0.50 | 1x | – |\\n| ○ | `haiku-xhigh` | claude | 41 | 29.3 ([AA](https://artificialanalysis.ai/models/releases/comparisons/claude-haiku-5-5-vs-deepseek-v4-pro)) | 52 ([AA](https://artificialanalysis.ai/models/comparisons/claude-haiku-5-5-vs-claude-haiku-5-5-xhigh)) | $0.10/—/$0.50 | 1x | – |\\n| ○ | `haiku-max` | claude | 43 | 32.8 ([AA](https://artificialanalysis.ai/models/releases/comparisons/claude-haiku-5-5-vs-deepseek-v4-pro)) | 55 ([AA](https://artificialanalysis.ai/models/comparisons/claude-haiku-5-5-vs-claude-haiku-5-5-xhigh)) | $0.10/—/$0.50 | 1x | – |\\n| ○ | `sonnet-low` | claude | 36 | – | – | $2/—/$10 | 20x | – |\\n| ○ | `sonnet-medium` | claude | 41 | 29.8 | 52.9 | $2/—/$10 | 20x | – |\\n| ○ | `sonnet-high` | claude | 47 | 43.9 | 53.7 | $2/—/$10 | 20x | – |\\n| ○ | `sonnet-xhigh` | claude | 52 | – | – | $2/—/$10 | 20x | – |\\n| ○ | `sonnet-max` | claude | 56 | – | – | $2/—/$10 | 20x | – |\\n| ○ | `opus-low` | claude | 42 | – | – | $4/—/$20 | 40x | – |\\n| ○ | `opus-medium` | claude | 51 | 52.5 | 59.3 | $4/—/$20 | 40x | – |\\n| ○ | `opus-high` | claude | 54 | – | – | $4/—/$20 | 40x | – |\\n| ○ | `opus-xhigh` | claude | 56 | – | – | $4/—/$20 | 40x | – |\\n| ○ | `opus-max` | claude | 58 | – | – | $4/—/$20 | 40x | – |\\n| ○ | `fable-low` | claude | 47 | – | – | $10/—/$50 | 100x | – |\\n| ○ | `fable-medium` | claude | 49 | – | – | $10/—/$50 | 100x | – |\\n| ○ | `fable-high` | claude | 51 | – | – | $10/—/$50 | 100x | – |\\n| ○ | `fable-xhigh` | claude | 53 | – | – | $10/—/$50 | 100x | – |\\n| ○ | `fable-max` | claude | 53 | – | – | $10/—/$50 | 100x | – |"}}\n';
const PRODUCTION_DENIAL_WITHOUT_USE_FOR: string | null = (() => {
  const output = obj(at(parseJson(PRODUCTION_DENIAL), "hookSpecificOutput"));
  const reason = strAt(output, "permissionDecisionReason");
  if (output === undefined || reason === undefined) return null;
  const projected = reason
    .split("\n")
    .map((line) => {
      if (!line.startsWith("| ● |") && !line.startsWith("| ○ |")) return line;
      const separator = line.lastIndexOf(" | ");
      return `${line.slice(0, separator + 3)}– |`;
    })
    .join("\n");
  return `${JSON.stringify({
    hookSpecificOutput: {
      ...output,
      permissionDecisionReason: projected,
    },
  })}\n`;
})();
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

const scratch = mkdtempSync(join(TEST_TMPDIR, "dispatch-roster-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});
const fixtureBin = join(scratch, "bin");
mkdirSync(fixtureBin);
const fixtureCli = join(fixtureBin, "agx");
const fixtureMise = join(fixtureBin, "mise");
expect(HOMEBREW_AGX, "agx must be installed in Homebrew PATH").toBeDefined();
if (HOMEBREW_AGX === undefined) process.exit(1);
const realCli = HOMEBREW_AGX;
writeFileSync(
  fixtureCli,
  `#!/bin/sh
if [ "$1 $2 $3" != "worker roster --json" ]; then exit 9; fi
case "$DISPATCH_ROSTER_FIXTURE_MODE" in
  failure) printf '%s' 'fixture failure' >&2; exit 7 ;;
  retired-enabled) printf '%s' 'unknown key enabled' >&2; exit 2 ;;
  invalid-json) printf '%s' 'not json'; exit 0 ;;
  invalid-shape) printf '%s' '{}'; exit 0 ;;
  invalid-choice) printf '%s' '{"default":"missing-route","choice":[{"id":"missing-route"}]}'; exit 0 ;;
  no-use-for) cat "$DISPATCH_ROSTER_FIXTURE_PATH"; exit 0 ;;
  slow) sleep 2.2; cat "$DISPATCH_ROSTER_FIXTURE_PATH"; exit 0 ;;
  timeout) exec sleep 30 ;;
esac
exec "$DISPATCH_ROSTER_REAL_CLI" "$@"
`,
);
chmodSync(fixtureCli, 0o755);
writeFileSync(
  fixtureMise,
  `#!/bin/sh
if [ "$#" -ne 8 ] || [ "$1" != "-C" ] || [ "$2" != "$DISPATCH_DOTFILES_ROOT" ] || [ "$3 $4 $5 $6 $7" != "exec -- agx worker roster" ] || [ "$8" != "--json" ]; then
  printf '%s\\n' "unexpected mise arguments: $*" >&2
  exit 9
fi
shift 5
exec "$DISPATCH_ROSTER_FIXTURE_CLI" "$@"
`,
);
chmodSync(fixtureMise, 0o755);
const dispatchHook = (
  tool: string,
  input: Record<string, unknown> = {},
  env: Record<string, string> = {},
  cwd?: string,
) =>
  runHook(
    HOOK,
    call(tool, input),
    isolatedTestEnv(scratch, testPathWithStub(fixtureBin), {
      DISPATCH_DOTFILES_ROOT: dotfilesRoot,
      DISPATCH_ROSTER_FIXTURE_CLI: fixtureCli,
      DISPATCH_ROSTER_REAL_CLI: realCli,
      AGX_CONFIG,
      ...env,
    }),
    cwd ?? dotfilesRoot,
    { inheritEnvironment: false },
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
    expect(d.reason).toContain("agx worker roster --json");
    expect(d.reason).toContain("enabled");
  });

  test("missing use_for displays as an en dash and present text is retained", () => {
    const result = dispatchHook(
      "Agent",
      {},
      {
        DISPATCH_ROSTER_FIXTURE_MODE: "no-use-for",
        DISPATCH_ROSTER_FIXTURE_PATH: NO_USE_FOR_FIXTURE,
      },
    );
    expect(result.code).toBe(0);
    const d = decisionOf(result.stdout);
    expect(d.reason).toContain(
      "| ● | `luna-low` | codex | 22 | – | – | $0.10/$0.01/$0.50 | 1x | – |",
    );
    expect(d.reason).toContain(
      "| ○ | `sonnet-low` | claude | 36 | – | – | —/—/— | — | fixture use_for text is retained |",
    );
  });

  test("a missing required choice field still fails closed", () => {
    const d = decisionOf(
      dispatchHook(
        "Agent",
        {},
        { DISPATCH_ROSTER_FIXTURE_MODE: "invalid-choice" },
      ).stdout,
    );
    expect(d.decision).toBe("deny");
    expect(d.reason).toContain("invalid roster JSON");
    expect(d.reason).toContain("route");
  });

  test("production denial matches the public CLI projection fixture from any cwd", () => {
    const result = dispatchHook("Agent", {}, { AGX_CONFIG }, scratch);
    expect(result.code).toBe(0);
    if (PRODUCTION_DENIAL_WITHOUT_USE_FOR === null) {
      expect(PRODUCTION_DENIAL_WITHOUT_USE_FOR).not.toBeNull();
      return;
    }
    expect(result.stdout).toBe(PRODUCTION_DENIAL_WITHOUT_USE_FOR);
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
    expect(d.reason).toContain("agx worker roster --json");
    expect(d.reason).toContain("missing.toml");
  });

  test.each([
    ["failure", "fixture failure"],
    ["invalid-json", "JSON"],
    ["invalid-shape", "invalid roster JSON"],
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
    expect(d.reason).toContain("agx worker roster --json");
    expect(d.reason).toContain(diagnostic);
  });

  test("a slow roster still appears in the normal denial", () => {
    const result = dispatchHook(
      "Agent",
      {},
      {
        DISPATCH_ROSTER_FIXTURE_MODE: "slow",
        DISPATCH_ROSTER_FIXTURE_PATH: NO_USE_FOR_FIXTURE,
      },
    );
    const d = decisionOf(result.stdout);
    expect(result.code).toBe(0);
    expect(d.decision).toBe("deny");
    expect(d.reason).toContain("the Agent tool dispatches nothing");
    expect(d.reason).toContain("| ● | `luna-low` | codex |");
    expect(d.reason).not.toContain("fix it");
  }, 10000);

  test("a hanging roster yields the contract and an unavailable note", () => {
    const result = dispatchHook(
      "Agent",
      {},
      {
        DISPATCH_ROSTER_FIXTURE_MODE: "timeout",
      },
    );
    const d = decisionOf(result.stdout);
    expect(result.code).toBe(0);
    expect(d.decision).toBe("deny");
    expect(d.reason).toContain("the Agent tool dispatches nothing");
    expect(d.reason).toContain("agx worker dispatch <ticket>");
    expect(d.reason).toContain(
      "Roster unavailable (agx worker roster --json timed out).",
    );
    expect(d.reason).not.toContain("fix it");
    expect(d.reason).not.toContain("| default |");
  }, 10000);

  test("missing command fails closed like an unreadable roster", () => {
    const d = decisionOf(
      runHook(HOOK, call("Agent"), { PATH: join(scratch, "empty-path") })
        .stdout,
    );
    expect(d.decision).toBe("deny");
    expect(d.reason).toContain("agx worker roster --json");
    expect(d.reason).toContain("cannot read roster");
  });

  test("missing mise fails closed like an unreadable roster", () => {
    const result = runHook(HOOK, call("Agent"), {
      PATH: join(scratch, "empty-path"),
    });
    expect(result.code).toBe(0);
    const d = decisionOf(result.stdout);
    expect(d.decision).toBe("deny");
    expect(d.reason).toContain("cannot read roster");
    expect(d.reason).toContain("mise");
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
