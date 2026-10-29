import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { fromAsyncThrowable } from "neverthrow";
import { resolve } from "node:path";
import { jsonOf, z } from "../../agents/hooks/zod.ts";

const args = Bun.argv.slice(2);
const home = process.env["HOME"] ?? "";
const marker = process.env["FAKE_CLAUDE_MARKER"];

const InstalledPluginsSchema = z.looseObject({
  plugins: z.record(z.string(), z.array(z.looseObject({ scope: z.string() }))),
});
const installedPath = resolve(home, ".claude/plugins/installed_plugins.json");

async function readInstalledPlugins(): Promise<
  z.infer<typeof InstalledPluginsSchema> | Error
> {
  const contents = await fromAsyncThrowable(() =>
    readFile(installedPath, "utf8"),
  )();
  if (contents.isErr()) {
    const code = z.object({ code: z.string() }).safeParse(contents.error);
    if (code.success && code.data.code === "ENOENT") return { plugins: {} };
    return contents.error instanceof Error
      ? contents.error
      : new Error(String(contents.error));
  }
  const parsed = jsonOf(InstalledPluginsSchema).safeParse(contents.value);
  return parsed.success ? parsed.data : { plugins: {} };
}

function output(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function main(): Promise<void> {
  if (marker !== undefined) await appendFile(marker, `${args.join("\t")}\n`);

  if (args[0] === "plugin" && args[1] === "uninstall") {
    const id = args[2] ?? "";
    const scopeIndex = args.indexOf("--scope");
    const scope = scopeIndex < 0 ? "user" : (args[scopeIndex + 1] ?? "user");
    const installed = await readInstalledPlugins();
    if (installed instanceof Error) {
      process.stderr.write(`${installed.message}\n`);
      process.exit(1);
    }
    const records = (installed.plugins[id] ?? []).filter(
      (plugin) => plugin.scope !== scope,
    );
    if (records.length === 0) delete installed.plugins[id];
    else installed.plugins[id] = records;
    await mkdir(resolve(home, ".claude/plugins"), { recursive: true });
    await writeFile(installedPath, `${JSON.stringify(installed, null, 2)}\n`);
    output({ outcome: "ok", message: `uninstalled ${id} (${scope})` });
  } else {
    process.stderr.write(
      `unsupported fake Claude command: ${args.join(" ")}\n`,
    );
    process.exit(2);
  }
}

await main();
