import { expect, test } from "bun:test";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { LINKS } from "../config-registry.ts";
import { RENDER_INPUTS } from "../render-source.ts";
import { jsonOf, z } from "../../agents/hooks/zod.ts";

test("candidate render includes imported siblings and refuses an unselected declaration update", async () => {
  const root = await mkdtemp(join(tmpdir(), "live-refs-commit-fixture-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
  const base = join(root, "base");
  const rev = join(root, "rev");
  const bin = join(root, "bin");
  const home = join(root, "home");
  const config = join(root, "empty-config");
  for (const dir of [base, bin, config, join(home, ".claude")])
    await mkdir(dir, { recursive: true });
  for (const path of RENDER_INPUTS) {
    const dest = join(base, path);
    await mkdir(dirname(dest), { recursive: true });
    await cp(join(import.meta.dir, "../..", path), dest, { recursive: true });
  }
  for (const [, source] of LINKS) {
    if (
      source.startsWith("@google-drive/") ||
      source.startsWith("agents/hooks") ||
      source === "agents/agx/agx.toml" ||
      source === "zsh/timezone"
    )
      continue;
    const dest = join(base, source);
    await mkdir(dirname(dest), { recursive: true });
    if ((await lstat(join(import.meta.dir, "../..", source))).isDirectory()) {
      await mkdir(dest, { recursive: true });
      await writeFile(join(dest, "fixture"), "fixture\n");
    } else await writeFile(dest, "fixture\n");
  }
  const settings = "agents/claude/settings.json";
  const retired = "agents/claude/hooks/retired.ts";
  const narrow = "tools/shared/src/narrow.ts";
  const shape = "tools/shared/src/shape.ts";
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
  await writeFile(join(base, settings), oldSettings);
  await writeFile(join(base, "agents/codex/hooks.json"), "{}");
  // The global settings declaration is a render input too, even though this
  // fixture does not depend on a global tool row.
  await mkdir(join(base, "mise"), { recursive: true });
  await writeFile(join(base, "mise.toml"), "[tasks]\nfixture = 'true'\n");
  await writeFile(
    join(base, "mise/dotfiles.toml"),
    '[settings]\ndisable_tools = ["github:fuyutarow/agx", "github:fuyutarow/dx"]\n',
  );
  const manifest = jsonOf(z.record(z.string(), z.unknown())).safeParse(
    await readFile(join(base, "package.json"), "utf8"),
  );
  expect(manifest.success).toBe(true);
  if (!manifest.success) return;
  // Keep the frozen dependency graph, without unrelated installed command targets.
  await writeFile(
    join(base, "package.json"),
    JSON.stringify({ ...manifest.data, bin: {} }),
  );
  for (const path of [
    "agents/commands/fixture.md",
    "agents/skills/fixture/SKILL.md",
    "agents/codex/AGENTS.md",
  ]) {
    await mkdir(dirname(join(base, path)), { recursive: true });
    await writeFile(join(base, path), "fixture\n");
  }
  await writeFile(join(base, retired), "fixture hook\n");
  await writeFile(join(base, "agents/claude/hooks/run.sh"), "fixture runner\n");
  await writeFile(join(home, ".claude/settings.json"), oldSettings);
  await cp(base, rev, { recursive: true });
  await rm(join(rev, retired));
  await writeFile(join(rev, settings), "{}");
  const narrowSource = await readFile(join(rev, narrow), "utf8");
  const narrowWithSibling = narrowSource.replace(
    [
      "export function arr(v: unknown): readonly unknown[] | undefined {",
      "  return Array.isArray(v) ? v : undefined;",
      "}",
    ].join("\n"),
    'export { arr } from "./shape.ts";',
  );
  expect(narrowWithSibling).not.toBe(narrowSource);
  await writeFile(join(rev, narrow), narrowWithSibling);
  await writeFile(
    join(rev, shape),
    [
      "export function arr(v: unknown): readonly unknown[] | undefined {",
      "  return Array.isArray(v) ? v : undefined;",
      "}",
    ].join("\n"),
  );
  const fake = join(bin, "jj");
  await writeFile(
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
    await writeFile(paths, `${selected.join("\0")}\0`);
    const child = Bun.spawn(
      [process.execPath, join(import.meta.dir, "../live-refs.ts")],
      {
        cwd: root,
        env: {
          ...process.env,
          PATH: [bin, ...(process.env["PATH"] ?? "").split(":")]
            .filter(
              (path) =>
                !path.includes("/mise/installs/github-fuyutarow-agx/") &&
                !path.endsWith("/mise/shims"),
            )
            .join(":"),
          HOME: home,
          // Keep mise's ancestor discovery outside the operator's home tree.
          TMPDIR: "/tmp",
          AGX_CONFIG: undefined,
          XDG_CONFIG_HOME: config,
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
  const consistent = await run([retired, settings, narrow, shape]);
  expect(consistent.exit, consistent.err).toBe(0);
  expect(consistent.out).toContain("PASS");
  expect(await readFile(join(home, ".claude/settings.json"), "utf8")).toBe(
    oldSettings,
  );
  const inconsistent = await run([retired]);
  expect(inconsistent.exit, inconsistent.err).toBe(1);
  expect(inconsistent.err).toContain("retired.ts");
  expect(inconsistent.err).toContain("settings.json");
}, 120_000);
