import { expect, test } from "bun:test";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { LINKS } from "../config-registry.ts";
import { RENDER_INPUTS } from "../render-source.ts";

test("commit candidate retires a hook before deployment, but refuses an unselected declaration update", async () => {
  const root = mkdtempSync(join(tmpdir(), "live-refs-commit-fixture-"));
  using _cleanup = {
    [Symbol.dispose]: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
  const base = join(root, "base");
  const rev = join(root, "rev");
  const bin = join(root, "bin");
  const home = join(root, "home");
  for (const dir of [base, bin, join(home, ".claude")])
    mkdirSync(dir, { recursive: true });
  for (const path of RENDER_INPUTS) {
    const dest = join(base, path);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(join(import.meta.dir, "../..", path), dest, { recursive: true });
  }
  for (const [, source] of LINKS) {
    if (
      source.startsWith("agents/hooks") ||
      source.startsWith("agents/models") ||
      source === "zsh/timezone"
    )
      continue;
    const dest = join(base, source);
    mkdirSync(dirname(dest), { recursive: true });
    if (statSync(join(import.meta.dir, "../..", source)).isDirectory()) {
      mkdirSync(dest, { recursive: true });
      writeFileSync(join(dest, "fixture"), "fixture\n");
    } else writeFileSync(dest, "fixture\n");
  }
  const settings = "agents/claude/settings.json";
  const retired = "agents/claude/hooks/retired.ts";
  const oldSettings = JSON.stringify({
    hooks: {
      PreToolUse: [
        {
          hooks: [
            {
              type: "command",
              command: "sh ~/.claude/hooks/run.sh retired.ts",
            },
          ],
        },
      ],
    },
  });
  writeFileSync(join(base, settings), oldSettings);
  writeFileSync(join(base, "agents/codex/hooks.json"), "{}");
  writeFileSync(join(base, "package.json"), "{}");
  for (const path of [
    "agents/commands/fixture.md",
    "agents/skills/fixture/SKILL.md",
    "agents/codex/AGENTS.md",
  ]) {
    mkdirSync(dirname(join(base, path)), { recursive: true });
    writeFileSync(join(base, path), "fixture\n");
  }
  writeFileSync(join(base, retired), "fixture hook\n");
  writeFileSync(join(base, "agents/claude/hooks/run.sh"), "fixture runner\n");
  writeFileSync(join(home, ".claude/settings.json"), oldSettings);
  cpSync(base, rev, { recursive: true });
  rmSync(join(rev, retired));
  writeFileSync(join(rev, settings), "{}");
  const fake = join(bin, "jj");
  writeFileSync(
    fake,
    `#!${process.execPath}\nimport {readFileSync} from "node:fs"; import {join} from "node:path";
const args=Bun.argv.slice(2); const source=args[args.indexOf("-r")+1] === "${"b".repeat(40)}" ? ${JSON.stringify(base)} : ${JSON.stringify(rev)};
if(args.includes("root")) console.log(${JSON.stringify(root)});
else if(args.includes("list")) { if(!args.some(a=>a.includes("executable"))) for await(const p of new Bun.Glob("**/*").scan({cwd:source,onlyFiles:true})) process.stdout.write(p+"\\0"); }
else if(args.includes("show")) { const p=JSON.parse((args.at(-1) ?? "").slice("root-file:".length)); process.stdout.write(readFileSync(join(source,p))); }
else process.exit(2);
`,
    { mode: 0o755 },
  );
  const paths = join(root, "paths");
  const run = async (selected: string[]) => {
    writeFileSync(paths, `${selected.join("\0")}\0`);
    const child = Bun.spawn(
      [process.execPath, join(import.meta.dir, "../live-refs.ts")],
      {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          HOME: home,
          PRECOMMIT_VCS: "jj",
          PRECOMMIT_REV: "a".repeat(40),
          PRECOMMIT_BASE: "b".repeat(40),
          PRECOMMIT_PATHS_FILE: paths,
        },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 60_000,
      },
    );
    const [out, err, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { out, err, exit };
  };
  const consistent = await run([retired, settings]);
  expect(consistent.exit, consistent.err).toBe(0);
  expect(consistent.out).toContain("PASS");
  expect(readFileSync(join(home, ".claude/settings.json"), "utf8")).toBe(
    oldSettings,
  );
  const inconsistent = await run([retired]);
  expect(inconsistent.exit, inconsistent.err).toBe(1);
  expect(inconsistent.err).toContain("retired.ts");
  expect(inconsistent.err).toContain("settings.json");
}, 120_000);
