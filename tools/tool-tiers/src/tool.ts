#!/usr/bin/env bun
import { cli as cleyeCli } from "cleye";
import { standardCli } from "@dotfiles/shared/src/cli.ts";
import cliPackage from "../package.json" with { type: "json" };
import { dirname, join } from "node:path";
import {
  declaredToolCommands,
  findToolCommandShadows,
  getTool,
  toolDeclaration,
  type ToolDeclaration,
} from "./tool-tiers.ts";

const cliArgv = () => process.argv.slice(2);
const cli = standardCli(cleyeCli, cliPackage, cliArgv);

const ROOT = join(import.meta.dir, "../../..");

function auditCommand(declaration: ToolDeclaration): boolean {
  const installed = Bun.which(declaration.command) !== null;
  const status = installed ? "✅" : "❌";
  process.stdout.write(
    `${status} ${declaration.command} (${declaration.tier} ${declaration.kind} ${declaration.package})\n`,
  );
  return !installed;
}

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("FATAL: unknown option --__proto__\n");
    process.exit(2);
  }
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "tool",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: ["<action>", "[command]"],
      help: {
        description:
          "Look up declared Homebrew tools or install one declared formula or cask on first need.",
      },
    },
    undefined,
    cliArgv(),
  );
  if (parsed._.length > 2) {
    process.stderr.write(
      "FATAL: tool accepts an action and at most one command\n",
    );
    process.exitCode = 2;
    return;
  }
  const [action, command] = parsed._;
  if (action === "audit" && command === undefined) {
    const declarations = await declaredToolCommands(ROOT);
    const missing = declarations
      .filter((declaration) => auditCommand(declaration))
      .map(({ command: name }) => name);
    const brew = Bun.which("brew");
    const shadows =
      brew === null
        ? []
        : await findToolCommandShadows(
            declarations.map(({ command: name }) => name),
            process.env["PATH"] ?? "",
            dirname(brew),
          );
    for (const shadow of shadows)
      process.stdout.write(
        `❌ ${shadow.command} shadow: ${shadow.shadow} (Homebrew: ${shadow.homebrew}) — rip ${shadow.shadow}\n`,
      );
    process.stdout.write("---\n");
    if (missing.length === 0 && shadows.length === 0)
      process.stdout.write(
        "All declared Homebrew commands installed without PATH shadows.\n",
      );
    else
      process.stdout.write(
        `${missing.length} missing; ${shadows.length} PATH shadow(s); use mise run tool:get <cmd> for missing commands and rip <shadow> for shadows.\n`,
      );
    process.exitCode = missing.length === 0 && shadows.length === 0 ? 0 : 1;
    return;
  }
  if (command === undefined || (action !== "which" && action !== "get")) {
    process.stderr.write(
      "FATAL: usage: tool which <cmd> | tool get <cmd> | tool audit\n",
    );
    process.exitCode = 2;
    return;
  }
  if (action === "which") {
    const declaration = await toolDeclaration(ROOT, command);
    process.stdout.write(
      declaration === undefined
        ? `${command} undeclared\n`
        : `${command} ${declaration.tier} ${declaration.kind} ${declaration.package}\n`,
    );
    return;
  }
  const result = await getTool(ROOT, command);
  if (result.status === "undeclared") {
    process.stderr.write(
      "declare it in Brewfile.core or Brewfile.ondemand first, or run it via uvx/bunx\n",
    );
    process.exitCode = 1;
    return;
  }
  if (result.status === "present") {
    process.stdout.write(
      `${command} is already installed (${result.declaration.tier} ${result.declaration.kind} ${result.declaration.package})\n`,
    );
    return;
  }
  if (result.status === "installed") {
    process.stdout.write(
      `installed ${command} (${result.declaration.tier} ${result.declaration.kind} ${result.declaration.package})\n`,
    );
    return;
  }
  process.stderr.write(
    `brew install ${result.declaration.kind === "cask" ? `--cask ${result.declaration.package}` : result.declaration.package} failed (exit ${result.exitCode})\n`,
  );
  process.exitCode = 1;
}

if (import.meta.main) {
  await main().catch((error: unknown) => {
    process.stderr.write(
      `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  });
}
