import { expect, test } from "bun:test";
import { resolve } from "node:path";
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
