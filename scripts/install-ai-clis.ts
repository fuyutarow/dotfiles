// Install the declared AI CLI providers. Claude always remains on its native self-updating
// channel. Codex is provider-selected by agents/codex/runtime.toml: WSL deploys the Windows
// Desktop launcher; macOS and ordinary Linux retain the standalone vendor installer.
//
// Usage: bun scripts/install-ai-clis.ts [--dry-run] [--dotfiles <path>]
// Exit: 0 all selected installers succeeded · 1 an installer failed · 2 invalid input/runtime.

import { homedir } from "node:os";
import { join } from "node:path";
import { cli } from "cleye";
import {
  declaredProvider,
  hostKind,
  type CodexRuntime,
} from "../agents/codex/runtime.ts";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";

type Installer = { label: string; command: string; args: string[] };

let prototypeFlagSeen = false;
function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") prototypeFlagSeen = true;
}

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

/** Pure selection seam: fixtures prove WSL never routes Codex through its Linux installer. */
export function installPlan(
  provider: CodexRuntime["provider"],
  dotfiles: string,
): Installer[] {
  const claude: Installer = {
    label: "Claude Code (native self-updating)",
    command: "sh",
    args: ["-c", "curl -fsSL https://claude.ai/install.sh | bash"],
  };
  if (provider === "windows-desktop") {
    return [
      claude,
      {
        label: "Codex (Windows Desktop provider)",
        command: process.execPath,
        args: [join(dotfiles, "agents/codex/codex-runtime.ts")],
      },
    ];
  }
  return [
    claude,
    {
      label: "Codex (standalone self-updating)",
      command: "sh",
      args: ["-c", "curl -fsSL https://chatgpt.com/codex/install.sh | sh"],
    },
  ];
}

async function runInstaller(installer: Installer): Promise<number> {
  const signal = AbortSignal.timeout(10 * 60_000);
  const child = Bun.spawn([installer.command, ...installer.args], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    signal,
  });
  const code = await child.exited;
  if (signal.aborted) {
    process.stderr.write(`${installer.label} timed out after 10 minutes\n`);
    return 1;
  }
  return code;
}

async function main(): Promise<number | Error> {
  const parsed = cli(
    {
      name: "install-ai-clis.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: { description: "Install the declared native AI CLI providers." },
      flags: {
        dryRun: { type: Boolean, default: false },
        dotfiles: { type: String },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (prototypeFlagSeen) return new Error("Unknown option '--__proto__'");
  if (parsed._.length > 0)
    return new Error("This command does not take positional arguments");
  if (parsed.flags.dotfiles === "")
    return new Error("--dotfiles requires a value");

  const dotfiles =
    parsed.flags.dotfiles ??
    process.env.DOTFILES ??
    join(homedir(), "dotfiles");
  const provider = await declaredProvider(dotfiles, hostKind());
  if (provider.isErr())
    return new Error(`invalid runtime declaration: ${provider.error}`);
  const installers = installPlan(provider.value, dotfiles);
  for (const installer of installers) {
    if (parsed.flags.dryRun) {
      print(
        `[dry-run] ${installer.label}: ${installer.command} ${installer.args.join(" ")}`,
      );
      continue;
    }
    print(`installing: ${installer.label}`);
    if ((await runInstaller(installer)) !== 0) return 1;
  }
  return 0;
}

if (import.meta.main) {
  const result = await attempt(main);
  if (!result.ok) {
    process.stderr.write(`FATAL: ${errorMessage(result.error)}\n`);
    process.exitCode = 2;
  } else if (result.value instanceof Error) {
    process.stderr.write(`FATAL: ${result.value.message}\n`);
    process.exitCode = 2;
  } else {
    process.exitCode = result.value;
  }
}
