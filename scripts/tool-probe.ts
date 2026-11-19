// `bun scripts/tool-probe.ts <tool> <probe>` — run the probe a tool's tool.toml declares, so the
// mise task that offers it names the declaration, not the file. Consumer: the mise task each
// `[probes.*].task` names (e.g. doctor:clipboard). The probe's own exit code is this command's.
// Exit 2 when the tool, its declaration or the probe is unknown (stderr says which).
import { join } from "node:path";
import { cli } from "cleye";
import { consola } from "consola";
import { loadToolDeclarations } from "@dotfiles/shared/src/tool-declaration.ts";

const ROOT = join(import.meta.dir, "..");

let cliError: string | undefined;
function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__")
    cliError = `Unknown option '--${flag}'`;
}

export async function probeFile(
  root: string,
  tool: string,
  probe: string,
): Promise<
  { file: string; error?: undefined } | { file?: undefined; error: string }
> {
  const { declared } = await loadToolDeclarations(root);
  const found = declared.find(({ dir }) => dir === tool);
  if (found === undefined)
    return { error: `tools/${tool} has no valid tool.toml` };
  const entry = found.declaration.probes[probe];
  if (entry === undefined)
    return {
      error: `tools/${tool}/tool.toml declares no probe "${probe}" (declared: ${Object.keys(found.declaration.probes).join(", ")})`,
    };
  return { file: join(root, "tools", tool, entry.file) };
}

if (import.meta.main) {
  const argv = cli({
    name: "tool-probe",
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    parameters: ["<tool>", "<probe>"],
  });
  if (argv._.length !== 2 && cliError === undefined)
    cliError = `expected <tool> <probe>, got ${argv._.length} argument(s)`;
  const resolved =
    cliError === undefined
      ? await probeFile(ROOT, argv._.tool, argv._.probe)
      : { error: cliError };
  if (resolved.file === undefined) {
    consola.error(`tool-probe: ${resolved.error}`);
    process.exitCode = 2;
  } else {
    // bounded: the probe bounds each child it starts (READ_MS in the probe itself)
    const child = Bun.spawn(["bun", resolved.file], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    process.exitCode = await child.exited;
  }
}
