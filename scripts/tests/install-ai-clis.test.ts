// Provider-selection fixtures for scripts/install-ai-clis.ts. These never invoke a vendor
// installer: they inspect the bounded plan and execute only the script's --dry-run route.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installPlan } from "../install-ai-clis.ts";

const REPO = join(import.meta.dir, "..", "..");
const SCRIPT = join(REPO, "scripts", "install-ai-clis.ts");

function fixtureDotfiles(provider: "standalone" | "windows-desktop"): string {
  const dotfiles = mkdtempSync(join(tmpdir(), "install-ai-clis-"));
  mkdirSync(join(dotfiles, "agents", "codex"), { recursive: true });
  writeFileSync(
    join(dotfiles, "agents", "codex", "runtime.toml"),
    `[providers]\nmac = "standalone"\nlinux = "standalone"\nwsl = "${provider}"\n`,
  );
  return dotfiles;
}

describe("install-ai-clis provider selection", () => {
  test("Windows Desktop selection deploys its runtime facade and never selects Linux Codex", () => {
    const dotfiles = fixtureDotfiles("windows-desktop");
    const plan = installPlan("windows-desktop", dotfiles);

    expect(plan.map((step) => step.label)).toEqual([
      "Claude Code (native self-updating)",
      "Codex (Windows Desktop provider)",
    ]);
    expect(plan[1]).toEqual({
      label: "Codex (Windows Desktop provider)",
      command: process.execPath,
      args: [join(dotfiles, "agents/codex/codex-runtime.ts")],
    });
    expect(plan.flatMap((step) => step.args).join(" ")).not.toContain(
      "chatgpt.com/codex/install.sh",
    );
  });

  test("native standalone selection retains the vendor Codex installer", () => {
    const plan = installPlan("standalone", "/fixture/dotfiles");

    expect(plan[1]).toEqual({
      label: "Codex (standalone self-updating)",
      command: "sh",
      args: ["-c", "curl -fsSL https://chatgpt.com/codex/install.sh | sh"],
    });
  });

  test("dry-run resolves the declared local provider without executing an installer", () => {
    const proc = Bun.spawnSync(
      [process.execPath, SCRIPT, "--dry-run", "--dotfiles", REPO],
      {
        env: { ...process.env, DOTFILES: REPO },
      },
    );
    const output = proc.stdout.toString() + proc.stderr.toString();

    expect(proc.exitCode, output).toBe(0);
    expect(output).toContain("[dry-run] Claude Code (native self-updating)");
    expect(output).not.toContain("installing:");
  });
});
