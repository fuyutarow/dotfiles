import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findings } from "../live-refs.ts";

function fixture(): { home: string; repo: string } {
  const root = mkdtempSync(join(tmpdir(), "live-refs-"));
  const home = join(root, "home");
  const repo = join(root, "repo");
  for (const path of [
    join(home, ".claude"),
    join(home, ".codex"),
    join(home, ".agents"),
    join(repo, "agents/claude/hooks"),
    join(repo, "agents/codex/hooks"),
    join(repo, "agents/hooks"),
    join(repo, "agents/codex"),
    join(repo, "tools/statusline/src"),
  ]) {
    mkdirSync(path, { recursive: true });
  }
  writeFileSync(
    join(repo, "agents/claude/settings.json"),
    JSON.stringify({
      statusLine: { command: "bun ~/.bun/bin/statusline" },
      hooks: {
        PreToolUse: [
          {
            hooks: [
              {
                type: "command",
                command: "sh ~/.claude/hooks/run.sh --fail-closed declared.ts",
              },
            ],
          },
        ],
      },
    }),
  );
  writeFileSync(
    join(repo, "agents/codex/hooks.json"),
    JSON.stringify({
      hooks: {
        PreToolUse: [
          {
            hooks: [
              {
                type: "command",
                command: "sh ~/.codex/hooks/run.sh --fail-closed codex.ts",
              },
            ],
          },
        ],
      },
    }),
  );
  writeFileSync(
    join(repo, "agents/hooks/hooks.toml"),
    '[[hook]]\nscript = "shared.ts"\nevent = "PreToolUse"\nfail_closed = true\nvendors = ["claude", "codex"]\n',
  );
  writeFileSync(join(repo, "agents/claude/hooks/run.sh"), "#!/bin/sh\n");
  writeFileSync(join(repo, "agents/codex/hooks/run.sh"), "#!/bin/sh\n");
  writeFileSync(join(repo, "agents/hooks/shared.ts"), "// shared hook\n");
  writeFileSync(
    join(repo, "agents/claude/hooks/declared.ts"),
    "// declared hook\n",
  );
  writeFileSync(join(repo, "agents/codex/hooks/codex.ts"), "// codex hook\n");
  writeFileSync(
    join(repo, "tools/statusline/src/statusline.ts"),
    "// statusline\n",
  );
  writeFileSync(
    join(repo, "package.json"),
    JSON.stringify({
      bin: { statusline: "tools/statusline/src/statusline.ts" },
    }),
  );
  writeFileSync(
    join(home, ".claude/settings.json"),
    JSON.stringify({
      statusLine: { command: "bun ~/.bun/bin/statusline" },
      hooks: {
        PreToolUse: [
          {
            hooks: [
              {
                type: "command",
                command: "sh ~/.claude/hooks/run.sh --fail-closed declared.ts",
              },
            ],
          },
        ],
      },
    }),
  );
  writeFileSync(
    join(home, ".codex/hooks.json"),
    JSON.stringify({
      hooks: {
        PreToolUse: [
          {
            hooks: [
              {
                type: "command",
                command: "sh ~/.codex/hooks/run.sh --fail-closed codex.ts",
              },
            ],
          },
        ],
      },
    }),
  );
  symlinkSync(join(repo, "agents/claude/hooks"), join(home, ".claude/hooks"));
  symlinkSync(join(repo, "agents/codex/hooks"), join(home, ".codex/hooks"));
  symlinkSync(join(repo, "agents/hooks"), join(home, ".agents/hooks"));
  return { home, repo };
}

describe("live repo references", () => {
  test("passes when links, deployed and declared commands, hook registry, and bin targets exist", () => {
    const { home, repo } = fixture();
    expect(findings({ home, repo, os: "linux" })).toEqual([]);
  });

  test("reports a removed command target with its surface, dangling path, and repair", () => {
    const { home, repo } = fixture();
    const script = join(repo, "agents/claude/statusline-command.ts");
    symlinkSync(script, join(home, ".claude/statusline-command.ts"));
    writeFileSync(
      join(home, ".claude/settings.json"),
      JSON.stringify({
        statusLine: { command: "bun ~/.claude/statusline-command.ts" },
      }),
    );

    const result = findings({ home, repo, os: "linux" });
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("deployed ~/.claude/settings.json");
    expect(result[0]).toContain(script);
    expect(result[0]).toContain("restore the file");
    expect(result[0]).toContain("mise run deps && mise run link:dots");
  });

  test("checks declared and deployed hooks, hook-registry sources, and bin targets", () => {
    const { home, repo } = fixture();
    writeFileSync(
      join(repo, "package.json"),
      JSON.stringify({
        bin: { missing: "tools/statusline/src/gone.ts" },
      }),
    );
    writeFileSync(
      join(repo, "agents/hooks/hooks.toml"),
      '[[hook]]\nscript = "gone.ts"\nevent = "PreToolUse"\nfail_closed = true\nvendors = ["claude"]\n',
    );
    writeFileSync(
      join(repo, "agents/claude/settings.json"),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              hooks: [
                {
                  type: "command",
                  command: "sh ~/.claude/hooks/run.sh missing-declared.ts",
                },
              ],
            },
          ],
        },
      }),
    );
    writeFileSync(
      join(home, ".codex/hooks.json"),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              hooks: [
                {
                  type: "command",
                  command: "sh ~/.codex/hooks/run.sh missing-deployed.ts",
                },
              ],
            },
          ],
        },
      }),
    );

    const result = findings({ home, repo, os: "linux" });
    expect(
      result.some((line) => line.includes("package.json bin missing")),
    ).toBe(true);
    expect(
      result.some((line) => line.includes("agents/hooks/hooks.toml hook[0]")),
    ).toBe(true);
    expect(
      result.some((line) =>
        line.includes("declared agents/claude/settings.json"),
      ),
    ).toBe(true);
    expect(
      result.some((line) => line.includes("deployed ~/.codex/hooks.json")),
    ).toBe(true);
  });
});
