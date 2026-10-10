import { expect, test } from "bun:test";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  lintHookSlugs,
  lintHookSource,
  lintHookLauncher,
} from "../lint-hook-slug.ts";
import { hookJson, hookMessage } from "../../agents/hooks/lib.ts";
import { loadSlugs } from "../../agents/hooks/slugs.ts";
import { jsonText } from "../../agents/hooks/zod.ts";

const root = resolve(import.meta.dir, "../..");

test("lint rejects bare prefixes in both shared emitters", () => {
  const dir = fixture();
  for (const path of ["agents/hooks/lib.ts", "agents/hooks/slug.sh"]) {
    const file = join(dir, path);
    const original = readFileSync(file, "utf8");
    writeFileSync(
      file,
      original
        .replaceAll("${HOOK_NAMESPACE}:", "")
        .replaceAll("dotfiles:%s", "%s"),
    );
    expect(lintHookSlugs(dir).join("\n")).toContain("lacks namespaced");
    writeFileSync(file, original);
  }
  rmSync(dir, { recursive: true, force: true });
});

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "hook-slug-"));
  mkdirSync(join(dir, "agents"));
  for (const topic of ["hooks", "claude", "codex"]) {
    cpSync(join(root, "agents", topic), join(dir, "agents", topic), {
      recursive: true,
    });
  }
  return dir;
}

test("all deployed owned hooks have unique identities and external hooks have explicit owners", () => {
  expect(lintHookSlugs(root)).toEqual([]);
  const registry = loadSlugs();
  expect(registry).not.toBeInstanceOf(Error);
  if (registry instanceof Error) return;
  expect(
    registry.external.find(
      (h) => h.command === "sh ~/.codex/herdr-agent-state.sh session",
    )?.owner,
  ).toBe("herdr");
});

test("missing slug, duplicate slug and unlisted command each fail the lint", () => {
  const dir = fixture();
  const registry = join(dir, "agents/hooks/hooks.toml");
  const original = readFileSync(registry, "utf8");
  writeFileSync(registry, original.replace('slug = "model-floor"\n', ""));
  expect(lintHookSlugs(dir).join("\n")).toContain("missing or invalid slug");
  writeFileSync(
    registry,
    original.replace('slug = "model-floor"', 'slug = "storage-headroom"'),
  );
  expect(lintHookSlugs(dir).join("\n")).toContain("duplicate slug");
  writeFileSync(
    registry,
    original.replace(
      "sh ~/.codex/herdr-agent-state.sh session",
      "sh ~/.codex/unlisted.sh",
    ),
  );
  expect(lintHookSlugs(dir).join("\n")).toContain("unlisted unowned command");
  rmSync(dir, { recursive: true, force: true });
});

test("raw literal and variable protocol emissions and raw stderr fail", () => {
  expect(lintHookLauncher('echo "raw diagnostic" >&2')).toHaveLength(1);
  expect(lintHookLauncher('printf \'{"reason":"raw"}\'')).toHaveLength(1);
  expect(lintHookLauncher('hook_stderr "diagnostic"')).toEqual([]);
  for (const source of [
    'console.log(JSON.stringify({decision:"block", reason:"raw"}));',
    'const reason="raw"; process.stdout.write(JSON.stringify({reason}));',
    'process.stderr.write("raw diagnostic");',
  ])
    expect(lintHookSource(source).length).toBeGreaterThan(0);
  expect(
    lintHookSource('process.stdout.write(hookJson({reason:"message"}));'),
  ).toEqual([]);
  const dir = fixture();
  writeFileSync(
    join(dir, "agents/hooks/enforce-model-floor.ts"),
    'console.log(JSON.stringify({permissionDecisionReason:"raw"}));',
  );
  expect(lintHookSlugs(dir).join("\n")).toContain("raw protocol message");
  rmSync(dir, { recursive: true, force: true });
});

test("encoder preserves each vendor event shape and prefixes all message fields", () => {
  expect(
    hookJson(
      {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          additionalContext: "Advice",
          updatedInput: { reason: "tool argument" },
        },
      },
      "fixture",
    ),
  ).toContain('"updatedInput":{"reason":"tool argument"}');
  for (const vendor of ["claude", "codex"]) {
    const slug = `${vendor}-fixture`;
    for (const payload of [
      {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: "Denied",
        },
      },
      ...(vendor === "claude"
        ? [
            {
              hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "ask",
                permissionDecisionReason: "Ask",
              },
            },
          ]
        : []),
      {
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: "Context",
        },
      },
      { decision: "block", reason: "Stop" },
      {
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: "Advice",
        },
        systemMessage: "Notice",
      },
      ...(vendor === "codex"
        ? [{ continue: false, stopReason: "Compact" }]
        : []),
    ]) {
      const encoded = hookJson(payload, slug);
      const parsed = jsonText.safeParse(encoded);
      expect(parsed.success).toBe(true);
      expect(encoded).toContain(`[dotfiles:${slug}] `);
      expect(hookJson(parsed.success ? parsed.data : null, slug)).toBe(encoded);
    }
  }
  expect(hookMessage("search-route: retain text", "search-route")).toBe(
    "[dotfiles:search-route] retain text",
  );
  expect(hookMessage("[search-route] retain text", "search-route")).toBe(
    "[dotfiles:search-route] retain text",
  );
});

test("real hook process emits prefixed valid deny JSON", () => {
  const result = Bun.spawnSync(
    [
      process.execPath,
      join(root, "agents/claude/hooks/enforce-dispatch-contract.ts"),
    ],
    {
      stdin: Buffer.from(
        JSON.stringify({ tool_name: "Agent", tool_input: {}, cwd: root }),
      ),
      timeout: 5_000,
    },
  );
  expect(result.exitCode).toBe(0);
  expect(jsonText.safeParse(result.stdout.toString()).success).toBe(true);
  expect(result.stdout.toString()).toContain("[dotfiles:dispatch-contract] ");
});

test("both Goal Kernel launchers prefix missing-runtime stderr without changing exits", () => {
  const dir = mkdtempSync(join(tmpdir(), "hook-slug-launcher-"));
  mkdirSync(join(dir, ".git"));
  mkdirSync(join(dir, ".agent-state/goal-kernel"), { recursive: true });
  for (const vendor of ["claude", "codex"]) {
    mkdirSync(join(dir, `.${vendor}`));
    symlinkSync(
      join(root, `agents/${vendor}/hooks`),
      join(dir, `.${vendor}/hooks`),
    );
    const result = Bun.spawnSync(
      ["sh", join(dir, `.${vendor}/hooks/run-goal-kernel.sh`), "--enforce"],
      {
        cwd: dir,
        env: {
          ...process.env,
          GOAL_KERNEL_BUN: "/missing-hook-bun",
          HOOK_SLUG: "",
        },
        timeout: 5_000,
      },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout.toString()).toBe("");
    expect(result.stderr.toString()).toStartWith(
      `[dotfiles:${vendor}-goal-kernel] `,
    );
  }
  rmSync(dir, { recursive: true, force: true });
});

test("Goal Kernel adapters retain malformed-input exits and diagnostic text", () => {
  for (const vendor of ["claude", "codex"]) {
    const result = Bun.spawnSync(
      [process.execPath, join(root, `agents/${vendor}/hooks/goal-kernel.ts`)],
      {
        stdin: Buffer.from("null"),
        timeout: 5_000,
      },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toBe("");
    expect(result.stderr.toString()).toBe(
      `[dotfiles:${vendor}-goal-kernel] GK_HOOK_PAYLOAD: input must be an object\n`,
    );
  }
});

test("shell fallback reads the declared slug independently of TOML field order", () => {
  const dir = mkdtempSync(join(tmpdir(), "hook-slug-order-"));
  writeFileSync(
    join(dir, "hooks.toml"),
    '[[hook]]\nscript = "gate.ts"\nslug = "fixture-gate"\n',
  );
  const result = Bun.spawnSync(
    [
      "sh",
      "-c",
      '. "$1"; hook_slug "$2" gate.ts',
      "sh",
      join(root, "agents/hooks/slug.sh"),
      dir,
    ],
    {
      env: { ...process.env, HOOK_SLUG: "" },
      timeout: 5_000,
    },
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString().trim()).toBe("fixture-gate");
  expect(result.stderr.toString()).toBe("");
  rmSync(dir, { recursive: true, force: true });
});
