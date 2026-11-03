import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { z } from "@dotfiles/shared/src/zod.ts";
import { declaredBinaries, roots } from "../knip-gate.ts";

test("binary allowances follow declared packages and installer commands", () => {
  const brew = ['brew "vendor/tap/example"\ncask "widget"\n# brew "commented"'];
  const mapping = "example\texample-cli\nother\tother-cli\n";
  const installer =
    'const cccBin = values.cccBin ?? "ccc";\n["tool", "install", "--upgrade", "cocoindex-code[full]"]';
  const derive = (sources: string[], install = installer) =>
    declaredBinaries(sources, mapping, '[tools]\nrunner = "1"', install);
  const result = derive(brew);
  for (const name of [
    "example-cli",
    "widget",
    "runner",
    "ccc",
    "lsattr",
    "osascript",
  ])
    expect(result).toContain(name);
  for (const name of ["example", "other-cli", "commented", "undeclared"])
    expect(result).not.toContain(name);
  expect(derive([], "")).not.toContain("ccc");
  expect(derive([])).not.toContain("example-cli");
});

test("production roots follow the repository's entry declarations", async () => {
  const entries = await roots(resolve(import.meta.dir, "../.."));
  for (const entry of [
    "tools/baseline/src/baseline.ts", // package bin
    "scripts/linux-init.ts", // mise task
    "scripts/post-merge.ts", // mise task using mise which bun
    "agents/hooks/enforce-storage-headroom.ts", // shared hook
    "agents/codex/hooks/enforce-math-delimiters.ts", // vendor hook
    "agents/skills/compiling-latex/scripts/tex-oracle.ts", // skill
    "scripts/ccc-swap.ts", // skill references checkout CLI
    "agents/goal-kernel/cli.ts", // documented CLI
    "agents/research-control/cli.ts", // documented CLI
    "agents/codex/codex-update.ts", // topgrade
    "agents/codex/codex-wsl.ts", // generated launcher
    "agents/codex/windows-hook.ts", // Windows hook bridge
    "standard-presets/typescript/lint-knip.ts", // copied preset
    "scripts/guest-capacity-recover.ts", // systemd service
    "scripts/ws-gc-log.ts", // systemd service
    "tools/shared/src/gpu-stall-notify.ts", // systemd service
    "tools/statusline/src/sampler.ts", // systemd service
    "scripts/render-home.ts", // subprocess
    "scripts/tracked-files.ts", // subprocess
    "tools/agent-resource-run/src/scope-entry.ts", // dynamically spawned
    "tools/agent-resource-run/src/scope-controller.ts", // dynamically spawned
    "tools/smart-open/src/receive.ts", // launchd
    "tools/repo-retrieve/views/research-record-v1.ts", // documented operator command
    "agents/claude/hooks/copy-via-herdr-pane.ts", // quote subprocess
    "agents/claude/hooks/resolve-agent-name.ts", // quote subprocess
  ])
    expect(entries).toContain(entry);
  expect(entries).not.toContain("scripts/skills-links.ts");
});

test("knip ignores jj's internal working copies but still reports unlisted production files", async () => {
  const repo = resolve(import.meta.dir, "../..");
  const dir = await mkdtemp(join(tmpdir(), "knip-jj-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
  const write = async (path: string, text: string) => {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await Bun.write(join(dir, path), text);
  };
  await write(
    "package.json",
    JSON.stringify({
      name: "fixture",
      private: true,
      bin: { main: "./bin/main.ts" },
    }),
  );
  await write("bin/main.ts", "console.log(1);\n");
  await write("src/unlisted.ts", "export const unlisted = 1;\n");
  await write(
    ".jj/run/default/1/working_copy/archives/x/index.ts",
    "export const jj = 1;\n",
  );
  await Bun.write(
    join(dir, "knip.jsonc"),
    await Bun.file(join(repo, "knip.jsonc")).text(),
  );
  const child = Bun.spawn(
    [
      join(repo, "node_modules/.bin/knip"),
      "--production",
      "--no-progress",
      "--reporter",
      "json",
      "--config",
      "knip.jsonc",
    ],
    { cwd: dir, stdout: "pipe", stderr: "pipe" },
  );
  const [stdout] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const report = z
    .object({ issues: z.array(z.object({ file: z.string() }).loose()) })
    .loose()
    .safeParse(Bun.JSONC.parse(stdout));
  expect(report.success).toBe(true);
  const files = report.success
    ? report.data.issues.map((issue) => issue.file)
    : [];
  expect(files).toContain("src/unlisted.ts");
  expect(files.filter((file) => file.startsWith(".jj/"))).toEqual([]);
}, 60_000);
