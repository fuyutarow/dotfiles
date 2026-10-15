import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findings } from "../live-refs.ts";

async function fixture(): Promise<{ home: string; repo: string }> {
  const root = await mkdtemp(join(tmpdir(), "live-refs-"));
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
    await mkdir(path, { recursive: true });
  }
  await writeFile(
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
  await writeFile(
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
  await writeFile(
    join(repo, "agents/hooks/hooks.toml"),
    '[[hook]]\nscript = "shared.ts"\nevent = "PreToolUse"\nfail_closed = true\nvendors = ["claude", "codex"]\n',
  );
  await writeFile(join(repo, "agents/claude/hooks/run.sh"), "#!/bin/sh\n");
  await writeFile(join(repo, "agents/codex/hooks/run.sh"), "#!/bin/sh\n");
  await writeFile(join(repo, "agents/hooks/shared.ts"), "// shared hook\n");
  await writeFile(
    join(repo, "agents/claude/hooks/declared.ts"),
    "// declared hook\n",
  );
  await writeFile(join(repo, "agents/codex/hooks/codex.ts"), "// codex hook\n");
  await writeFile(
    join(repo, "tools/statusline/src/statusline.ts"),
    "// statusline\n",
  );
  await writeFile(
    join(repo, "package.json"),
    JSON.stringify({
      bin: { statusline: "tools/statusline/src/statusline.ts" },
    }),
  );
  await writeFile(
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
  await writeFile(
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
  await symlink(join(repo, "agents/claude/hooks"), join(home, ".claude/hooks"));
  await symlink(join(repo, "agents/codex/hooks"), join(home, ".codex/hooks"));
  await symlink(join(repo, "agents/hooks"), join(home, ".agents/hooks"));
  return { home, repo };
}

describe("live repo references", () => {
  test("passes when links, deployed and declared commands, hook registry, and bin targets exist", async () => {
    const { home, repo } = await fixture();
    expect(await findings({ home, repo, os: "linux" })).toEqual([]);
  });

  test("reports a removed command target with its surface, dangling path, and repair", async () => {
    const { home, repo } = await fixture();
    const script = join(repo, "agents/claude/statusline-command.ts");
    await symlink(script, join(home, ".claude/statusline-command.ts"));
    await writeFile(
      join(home, ".claude/settings.json"),
      JSON.stringify({
        statusLine: { command: "bun ~/.claude/statusline-command.ts" },
      }),
    );

    const result = await findings({ home, repo, os: "linux" });
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("deployed ~/.claude/settings.json");
    expect(result[0]).toContain(script);
    expect(result[0]).toContain("restore the file");
    expect(result[0]).toContain("mise run deps && mise run link:dots");
  });

  test("checks declared and deployed hooks, hook-registry sources, and bin targets", async () => {
    const { home, repo } = await fixture();
    await writeFile(
      join(repo, "package.json"),
      JSON.stringify({
        bin: { missing: "tools/statusline/src/gone.ts" },
      }),
    );
    await writeFile(
      join(repo, "agents/hooks/hooks.toml"),
      '[[hook]]\nscript = "gone.ts"\nevent = "PreToolUse"\nfail_closed = true\nvendors = ["claude"]\n',
    );
    await writeFile(
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
    await writeFile(
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

    const result = await findings({ home, repo, os: "linux" });
    expect(
      result.some((line) => line.includes("package.json bin missing")),
    ).toBe(true);
    expect(
      result.some((line) =>
        /agents\/hooks\/hooks.toml:\d+ hook\[0\]/u.test(line),
      ),
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

  test("CLI failures retain source lines on piped stderr and unreadable inputs name the file", async () => {
    const { home, repo } = await fixture();
    const path = join(repo, "agents/claude/settings.json");
    await writeFile(
      path,
      '{\n  "hooks": {"PreToolUse": [{"hooks": [{"command": "sh ~/.claude/hooks/run.sh gone.ts"}]}]}\n}\n',
    );
    const run = () =>
      Bun.spawn([process.execPath, join(import.meta.dir, "../live-refs.ts")], {
        env: {
          ...process.env,
          HOME: home,
          DOTFILES: repo,
          PRECOMMIT_VCS: undefined,
        },
        stdout: "pipe",
        stderr: "pipe",
      });
    const missing = run();
    const diagnostic = await new Response(missing.stderr).text();
    expect(await missing.exited).toBe(1);
    expect(diagnostic).toContain("settings.json:2");
    expect(diagnostic).toContain("gone.ts");
    await writeFile(path, "{invalid");
    const invalid = run();
    expect(await new Response(invalid.stderr).text()).toContain(
      `${path}: cannot read JSON`,
    );
    expect(await invalid.exited).toBe(2);
  });
});
