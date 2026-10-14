import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { jsonOf, z } from "../../agents/hooks/zod.ts";

const StateSchema = z.object({
  marketplaces: z.array(z.strictObject({ name: z.string(), path: z.string() })),
  plugins: z.array(
    z.strictObject({ id: z.string(), scope: z.string(), enabled: z.boolean() }),
  ),
});
type State = z.infer<typeof StateSchema>;

const args = Bun.argv.slice(2);
const home = process.env.HOME ?? "";
const statePath = resolve(home, ".claude/.fake-plugin-state.json");
const marker = process.env.FAKE_CLAUDE_MARKER;
if (marker !== undefined) appendFileSync(marker, `${args.join("\t")}\n`);

function readState(): State {
  if (!existsSync(statePath)) return { marketplaces: [], plugins: [] };
  const parsed = jsonOf(StateSchema).safeParse(readFileSync(statePath, "utf8"));
  if (!parsed.success) {
    process.stderr.write(
      `invalid fake Claude state: ${parsed.error.message}\n`,
    );
    process.exit(2);
  }
  return parsed.data;
}

function writeState(state: State): void {
  mkdirSync(resolve(home, ".claude"), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function output(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

const state = readState();
if (args[0] === "plugin" && args[1] === "marketplace" && args[2] === "list") {
  output(
    state.marketplaces.map(({ name, path }) => ({
      name,
      path,
      source: "directory",
    })),
  );
} else if (
  args[0] === "plugin" &&
  args[1] === "marketplace" &&
  args[2] === "add"
) {
  const root = args[3] ?? "";
  const manifestPath = resolve(root, ".claude-plugin/marketplace.json");
  const manifest = jsonOf(z.object({ name: z.string() })).safeParse(
    readFileSync(manifestPath, "utf8"),
  );
  if (!manifest.success) {
    process.stderr.write(
      `invalid fake marketplace manifest: ${manifest.error.message}\n`,
    );
    process.exit(2);
  }
  const existing = state.marketplaces.find(
    (entry) => entry.name === manifest.data.name,
  );
  if (existing === undefined)
    state.marketplaces.push({ name: manifest.data.name, path: root });
  writeState(state);
  output({ outcome: "ok", message: `added ${manifest.data.name}` });
} else if (args[0] === "plugin" && args[1] === "list") {
  output(state.plugins);
} else if (args[0] === "plugin" && args[1] === "install") {
  const id = args[2] ?? "";
  const scopeIndex = args.indexOf("--scope");
  const scope = scopeIndex < 0 ? "user" : (args[scopeIndex + 1] ?? "user");
  const existing = state.plugins.find(
    (entry) => entry.id === id && entry.scope === scope,
  );
  if (existing === undefined) state.plugins.push({ id, scope, enabled: true });
  else existing.enabled = true;
  writeState(state);
  output({ outcome: "ok", message: `installed ${id}` });
} else if (args[0] === "plugin" && args[1] === "enable") {
  const id = args[2] ?? "";
  const plugin = state.plugins.find((entry) => entry.id === id);
  if (plugin === undefined) {
    process.stderr.write(`unknown fake plugin: ${id}\n`);
    process.exit(1);
  }
  plugin.enabled = true;
  writeState(state);
  output({ outcome: "ok", message: `enabled ${id}` });
} else {
  process.stderr.write(`unsupported fake Claude command: ${args.join(" ")}\n`);
  process.exit(2);
}
