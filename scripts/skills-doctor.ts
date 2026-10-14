// `mise run lint:skills-wiring` checks repository-owned skill declarations only.

import { resolve } from "node:path";
import { cli } from "cleye";
import {
  readDeclaration,
  skillFiles,
  thirdPartySkillFiles,
} from "./skills-declaration.ts";
import { readDotfilesPlugin } from "./skills-plugin.ts";

const USAGE = "Usage: bun scripts/skills-doctor.ts [--dotfiles <path>]\n";

type Finding = { level: "FAIL"; line: string };

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

let prototypeFlagSeen = false;
function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") prototypeFlagSeen = true;
}

function checkPluginManifest(dotfiles: string): Finding[] {
  const plugin = readDotfilesPlugin(dotfiles);
  return plugin.isErr()
    ? [{ level: "FAIL", line: `PLUGIN: ${plugin.error}` }]
    : [];
}

function checkRepoProvenance(dotfiles: string): Finding[] {
  const declaration = readDeclaration(dotfiles);
  if (declaration.isErr())
    return [{ level: "FAIL", line: `DECLARATION: ${declaration.error}` }];
  return thirdPartySkillFiles(
    skillFiles(resolve(dotfiles, "agents/skills")),
    declaration.value,
  ).map(({ path, skill }) => ({
    level: "FAIL",
    line: `THIRD-PARTY: ${path} has declared vendor provenance for "${skill}"; remove it from agents/skills`,
  }));
}

function main(): void {
  const parsed = cli(
    {
      name: "skills-doctor.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description:
          "Check the Claude plugin manifest and in-house versus third-party skill boundary in this repository.",
      },
      flags: {
        dotfiles: { type: String },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (prototypeFlagSeen) {
    process.stderr.write(`unknown flag(s): --__proto__\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (parsed.flags.dotfiles === "") {
    process.stderr.write(`--dotfiles requires a non-empty value\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (parsed._.length > 0) {
    process.stderr.write(
      `unexpected positional argument: ${parsed._[0]}\n${USAGE}`,
    );
    process.exitCode = 2;
    return;
  }

  const dotfiles =
    parsed.flags.dotfiles ??
    process.env.DOTFILES ??
    resolve(import.meta.dir, "..");
  const findings = [
    ...checkPluginManifest(dotfiles),
    ...checkRepoProvenance(dotfiles),
  ];
  for (const finding of findings) print(`❌ ${finding.line}`);

  const failures = findings.filter(
    (finding) => finding.level === "FAIL",
  ).length;
  if (failures > 0) {
    print(`SKILLS-WIRING FAIL: ${failures} problem(s)`);
    process.exitCode = 1;
    return;
  }
  print(
    "✅ SKILLS-WIRING PASS: plugin manifest and in-house skill tree are valid",
  );
}

process.on("uncaughtException", (error) => {
  process.stderr.write(
    `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});

main();
process.exit(process.exitCode ?? 0);
