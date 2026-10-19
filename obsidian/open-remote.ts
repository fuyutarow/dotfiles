// Consumer: smart-open receiver. stdin is receiver-built, vouched SSH configuration.
// Reference: obsidian-remote-ssh 1.1.11 plugin/src/shadow/ShadowVaultBootstrap.ts
// and vaultNaming.ts. Identity lives in autoConnectProfileId, not the directory name.
import { createHash } from "node:crypto";
import { access, mkdir, readdir, rename } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { err, ok, type Result } from "neverthrow";
import { jsonOf, z } from "../agents/hooks/zod.ts";
import plugins from "./plugins.json";
import { openVault } from "./open-vault.ts";

export const RemoteRequest = z.object({
  alias: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,252}$/u),
  path: z.string().startsWith("/"),
  hostname: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  user: z.string().min(1),
  proxyjump: z.string().optional(),
  action: z.enum(["open", "forget"]).optional(),
});
type Request = z.infer<typeof RemoteRequest>;
const ObjectJson = jsonOf(z.record(z.string(), z.unknown()));
const home = () => process.env.HOME ?? "";
const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );
export const profileId = (alias: string, path: string): string =>
  `so-${createHash("sha256").update(`${alias}\0${path}`).digest("hex").slice(0, 16)}`;
const segment = (raw: string): string => {
  const clean = raw
    .replaceAll(/[^a-zA-Z0-9._ -]/gu, "_")
    .replaceAll(/_{2,}/gu, "_")
    .trim()
    .slice(0, 40)
    .trim();
  return clean === "" || clean === "." || clean === ".." ? "vault" : clean;
};
async function object(
  file: string,
): Promise<Result<Record<string, unknown>, string>> {
  if (!(await Bun.file(file).exists())) return ok({});
  // An unreadable/corrupt existing state must never silently lose secrets or host keys.
  const parsed = ObjectJson.safeParse(await Bun.file(file).text());
  return parsed.success ? ok(parsed.data) : err(`invalid JSON object: ${file}`);
}
export async function shadowPath(request: Request): Promise<string> {
  const base = join(home(), ".obsidian-remote/vaults");
  await mkdir(base, { recursive: true, mode: 0o700 });
  const id = profileId(request.alias, request.path);
  for (const entry of (await readdir(base)).toSorted()) {
    const data = join(base, entry, ".obsidian/plugins/remote-ssh/data.json");
    const state = await object(data);
    if (state.isOk() && state.value.autoConnectProfileId === id)
      return join(base, entry);
  }
  // Obsidian lists a vault by its directory name, so it reads `<alias>--<folder>` like the
  // plugin's own shadows; identity stays in data.json. A tail already taken by another path gets
  // its parent folder, then a counter.
  const parent = basename(dirname(request.path));
  const names = [
    basename(request.path),
    `${parent}-${basename(request.path)}`,
    ...[2, 3, 4, 5, 6, 7, 8, 9].map(
      (n) => `${parent}-${basename(request.path)}-${n}`,
    ),
  ].map((tail) => join(base, `${segment(request.alias)}--${segment(tail)}`));
  for (const candidate of names)
    if (!(await exists(candidate))) return candidate;
  return join(base, `${segment(request.alias)}--${segment(id)}`);
}

export async function prepareShadow(
  target: string,
  request: Request,
): Promise<Result<void, string>> {
  const config = join(target, ".obsidian");
  const pluginDir = join(config, "plugins/remote-ssh");
  await mkdir(pluginDir, { recursive: true, mode: 0o700 });
  for (const file of ["main.js", "manifest.json"])
    if (!(await Bun.file(join(pluginDir, file)).exists()))
      return err(
        `Remote SSH is not installed: ${pluginDir}; run obsidian/apply.ts --vault ${target}`,
      );
  const id = profileId(request.alias, request.path);
  const dataFile = join(pluginDir, "data.json");
  const state = await object(dataFile);
  if (state.isErr()) return err(state.error);
  const data = state.value;
  const profile = {
    id,
    name: `${request.alias}:${request.path}`,
    host: request.hostname,
    port: request.port,
    username: request.user,
    authMethod: "privateKey",
    privateKeyPath: "~/.ssh/id_ed25519",
    proxyCommand:
      request.proxyjump === undefined || request.proxyjump === "none"
        ? ""
        : `/usr/bin/ssh -q -W %h:%p ${request.proxyjump}`,
    remotePath: request.path,
    connectTimeoutMs: 15_000,
    keepaliveIntervalMs: 10_000,
    keepaliveCountMax: 3,
    transport: "rpc",
    walkIgnoreDirs:
      plugins["remote-ssh"].settings.profiles.find((p) => p.id === "r99-u26")
        ?.walkIgnoreDirs ?? [],
  };
  const existing = z.array(z.unknown()).safeParse(data.profiles ?? []);
  const profiles = existing.success ? existing.data : [];
  const kept = profiles.filter((p) => {
    const parsed = z.object({ id: z.string() }).safeParse(p);
    return !parsed.success || parsed.data.id !== id;
  });
  await Bun.write(
    `${dataFile}.tmp`,
    JSON.stringify(
      {
        ...data,
        profiles: [...kept, profile],
        activeProfileId: id,
        autoConnectProfileId: id,
        onboardingCompleted: true,
        daemonDownloadConsented: true,
      },
      null,
      2,
    ),
  );
  await rename(`${dataFile}.tmp`, dataFile);
  // Match the upstream shadow's enabled-plugin seed; house plugins stay installed but inert.
  await Bun.write(join(config, "community-plugins.json"), '["remote-ssh"]\n');
  const appFile = join(config, "app.json");
  const app = await object(appFile);
  if (app.isErr() || Object.keys(app.value).length === 0)
    await Bun.write(appFile, '{"promptDelete":false}\n');
  const coreFile = join(config, "core-plugins.json");
  const core = (await Bun.file(coreFile).exists())
    ? jsonOf(z.array(z.string())).safeParse(await Bun.file(coreFile).text())
    : undefined;
  if (core?.success !== true || core.data.length === 0)
    await Bun.write(
      coreFile,
      JSON.stringify([
        "file-explorer",
        "global-search",
        "switcher",
        "graph",
        "backlink",
        "canvas",
        "outgoing-link",
        "tag-pane",
        "page-preview",
        "daily-notes",
        "templates",
        "note-composer",
        "command-palette",
        "editor-status",
        "bookmarks",
        "markdown-importer",
        "outline",
        "word-count",
        "file-recovery",
      ]),
    );
  return ok(undefined);
}

async function trust(): Promise<Result<void, string>> {
  const child = Bun.spawn(
    [process.execPath, join(import.meta.dir, "trust.ts")],
    {
      stdout: "ignore",
      stderr: "pipe",
      timeout: 100_000,
      killSignal: "SIGKILL",
    },
  );
  const [code, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);
  return code === 0
    ? ok(undefined)
    : err(`could not trust shadow vault: ${stderr.slice(0, 2000)}`);
}
if (import.meta.main) {
  const result = await Promise.try(async () => {
    const parsed = jsonOf(RemoteRequest).safeParse(await Bun.stdin.text());
    if (!parsed.success) return err("invalid receiver request");
    const request = parsed.data;
    if (request.action === "forget") {
      const { forgetShadow } = await import("./forget-shadow.ts");
      return forgetShadow({
        kind: "profile",
        value: profileId(request.alias, request.path),
      });
    }
    const target = await shadowPath(request);
    await mkdir(target, { recursive: true, mode: 0o700 });
    return openVault(target, () => prepareShadow(target, request), trust);
  }).then(
    (v) => v,
    (e: unknown) => err(String(e)),
  );
  result.match(
    () => {
      process.exitCode = 0;
    },
    (message) => {
      process.stderr.write(`FATAL: ${message}\n`);
      process.exitCode = 2;
    },
  );
}
