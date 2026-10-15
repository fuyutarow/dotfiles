import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { jsonOf, z } from "../../agents/hooks/zod.ts";

const args = Bun.argv.slice(2);
const home = process.env.HOME ?? "";
const marker = process.env.FAKE_CLAUDE_MARKER;
if (marker !== undefined) appendFileSync(marker, `${args.join("\t")}\n`);

const InstalledPluginsSchema = z.looseObject({
  plugins: z.record(z.string(), z.array(z.looseObject({ scope: z.string() }))),
});
const installedPath = resolve(home, ".claude/plugins/installed_plugins.json");

function readInstalledPlugins(): z.infer<typeof InstalledPluginsSchema> {
  if (!existsSync(installedPath)) return { plugins: {} };
  const parsed = jsonOf(InstalledPluginsSchema).safeParse(
    readFileSync(installedPath, "utf8"),
  );
  return parsed.success ? parsed.data : { plugins: {} };
}

function output(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

if (args[0] === "plugin" && args[1] === "uninstall") {
  const id = args[2] ?? "";
  const scopeIndex = args.indexOf("--scope");
  const scope = scopeIndex < 0 ? "user" : (args[scopeIndex + 1] ?? "user");
  const installed = readInstalledPlugins();
  const records = (installed.plugins[id] ?? []).filter(
    (plugin) => plugin.scope !== scope,
  );
  if (records.length === 0) delete installed.plugins[id];
  else installed.plugins[id] = records;
  mkdirSync(resolve(home, ".claude/plugins"), { recursive: true });
  writeFileSync(installedPath, `${JSON.stringify(installed, null, 2)}\n`);
  output({ outcome: "ok", message: `uninstalled ${id} (${scope})` });
} else {
  process.stderr.write(`unsupported fake Claude command: ${args.join(" ")}\n`);
  process.exit(2);
}
