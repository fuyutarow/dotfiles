// Provider-selection fixtures for scripts/install-ai-clis.ts. These never invoke a vendor
// installer: they inspect the bounded plan and execute only the script's --dry-run route.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { installPlan } from "../install-ai-clis.ts";

const REPO = join(import.meta.dir, "..", "..");
const SCRIPT = join(REPO, "scripts", "install-ai-clis.ts");

describe("install-ai-clis provider selection", () => {
  test("WSL deploys its explicit desktop launcher without selecting a Linux vendor installer", () => {
    const plan = installPlan("/fixture/dotfiles", "wsl");

    expect(plan.map((step) => step.label)).toEqual([
      "Claude Code (native self-updating)",
      "Codex (WSL desktop launcher)",
    ]);
    expect(plan[1]).toEqual({
      label: "Codex (WSL desktop launcher)",
      command: process.execPath,
      args: ["/fixture/dotfiles/agents/codex/codex-runtime.ts"],
    });
    expect(plan.flatMap((step) => step.args).join(" ")).not.toContain(
      "chatgpt.com/codex/install.sh",
    );
  });

  test("macOS and ordinary Linux retain the standalone Codex installer", () => {
    expect(installPlan("/fixture/dotfiles", "mac")).toEqual([
      {
        label: "Claude Code (native self-updating)",
        command: "sh",
        args: ["-c", "curl -fsSL https://claude.ai/install.sh | bash"],
      },
      {
        label: "Codex (standalone self-updating)",
        command: "sh",
        args: ["-c", "curl -fsSL https://chatgpt.com/codex/install.sh | sh"],
      },
    ]);
    expect(installPlan("/fixture/dotfiles", "linux")).toHaveLength(2);
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
