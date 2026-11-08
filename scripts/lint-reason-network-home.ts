// Prevent declarations from overriding reason-network's state directory. No arguments; DOTFILES
// selects a fixture root. Fail closed on unreadable declarations.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { attempt } from "../agents/hooks/attempt.ts";

const declarations = [
  ".mcp.json",
  "agents/codex/config.declared.toml",
  "agents/hooks/hooks.toml",
  "agents/codex/hooks.json",
  "agents/claude/settings.json",
];

export async function reasonNetworkHomeViolations(
  root: string,
): Promise<string[]> {
  const zsh = new Bun.Glob("**/*");
  const paths = [...declarations];
  for await (const path of zsh.scan({
    cwd: join(root, "zsh"),
    onlyFiles: true,
    dot: true,
  }))
    paths.push(`zsh/${path}`);
  const violations: string[] = [];
  for (const path of paths) {
    const lines = (await readFile(join(root, path), "utf8")).split("\n");
    violations.push(
      ...lines.flatMap((line, index) =>
        !/^\s*#/u.test(line) &&
        /\b(?:REASON_NETWORK_HOME|TINCAN_HOME)\b["']?\s*(?:=|:)/u.test(line)
          ? [`${path}:${index + 1}: state directory override`]
          : [],
      ),
    );
  }
  return violations;
}

async function main(): Promise<number> {
  const result = await attempt(() =>
    reasonNetworkHomeViolations(
      process.env["DOTFILES"] ?? join(import.meta.dir, ".."),
    ),
  );
  if (!result.ok) {
    process.stderr.write(
      `reason-network home declarations: ${String(result.error)}\n`,
    );
    return 2;
  }
  for (const violation of result.value) process.stderr.write(`${violation}\n`);
  process.stdout.write(
    `reason-network home declarations: ${result.value.length === 0 ? "PASS" : "FAIL"}\n`,
  );
  return result.value.length === 0 ? 0 : 1;
}

if (import.meta.main) process.exitCode = await main();
