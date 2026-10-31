// Renders the GENERATED half of $HOME — every deployed file that is a function of several repo
// declarations (plus machine facts), so it cannot be a symlink to one of them:
//   ~/.claude/settings.json  <- agents/claude/settings.json + ~/.claude/settings.private.json
//                               + zsh/timezone (env.TZ) + agents/hooks/hooks.toml (claude)
//   ~/.codex/hooks.json      <- agents/codex/hooks.json + agents/hooks/hooks.toml (codex)
//   ~/.claude/CLAUDE.md      <- agents/claude/CLAUDE.md
// Consumer: scripts/link-dots.ts (and therefore `mise run link:dots` + the post-merge hook), and
// `mise run doctor`, which renders into a scratch HOME and compares. Output is verdict lines.
//
// DATA FLOWS from declarations to rendered outputs, except for the named Claude Code UI settings
// carried over from the deployed settings file below. Until 2026-10-06 two of these
// were generated INTO the repo instead (`hooks:wire` rewrote entries inside the committed vendor
// files; `roster:render` rewrote a block inside agents/claude/CLAUDE.md): two writers per file,
// and a hand edit inside the generated part was silently undone.
//
// WHY settings.json IS GENERATED AND NOT SYMLINKED — the setting that forced it first:
// `autoMode` (auto-mode classifier rules: environment / allow / soft_deny / hard_deny) is
// documented as "Read from user settings, the --settings flag, and managed settings only. Ignored
// in project .claude/settings.json and local .claude/settings.local.json" (code.claude.com/docs,
// read 2026-08-17). So its content CANNOT be relocated to the project it describes, and its
// content is inherently machine- and repo-specific: this machine's autoMode block named a private
// repo's path, its API-key variable names, and where its sensitive documents live. Symlinking
// ~/.claude/settings.json at this PUBLIC repo therefore forced a choice between losing the setting
// and publishing a private project's structure. Generation is the third option: the shared half is
// committed, the private half stays in $HOME and is never seen by git.
//
// The cost, stated plainly: no output here is live-edited through the repo. After changing an
// input, run `mise run link:dots` (the post-merge hook already does this on every pull).
//
// NO FLAGS, ZERO-INSTALL IMPORTS — deliberate. With no argv read there is no Cleye boundary
// to owe (writing-bun-scripts BG1). Local imports use the committed zod bundle rather than
// node_modules. Inputs come from the environment so tests can point it at fixtures:
//   DOTFILES                  repo root            (default: this script's checkout)
//   DOTFILES_RENDER_REV       landed commit        (default: alpha in a jj checkout)
//   DOTFILES_RENDER_FROM_WORKING_COPY=1             explicit local render; forbidden with REV
//   HOME                      destination root     (default: os.homedir())
//   COMMAND_TARGET_HOME       command validation root (default: HOME; doctor uses the live HOME)
//   CLAUDE_SETTINGS_PRIVATE   overlay path         (default: $HOME/.claude/settings.private.json)
//
// MERGE SEMANTICS (settings): top-level keys only, and an overlay key REPLACES the base key
// outright. No deep merge — a deep merge of the `hooks` arrays has no defensible semantics
// (append? match on matcher? dedupe?), and guessing one would silently reorder security hooks.
// The registry hooks are wired AFTER the merge, so an overlay `hooks` still gets them.
//
// TIME ZONE: the human's zone NAME lives only in zsh/timezone (see zsh/zshenv). zsh hands it to
// every process it starts, but a Claude Code process started some other way (herdr's server, a
// session older than the file) had none, and its statusline and hooks read UTC (2026-10-06). So
// it is rendered into `env.TZ`, which Claude Code exports to everything it spawns. An `env.TZ`
// already in the base or overlay wins (one machine may override, as in zshenv); a machine without
// that zone file gets none, as in zshenv; a name the zone database does not know refuses the render.
//
// ALL OR NOTHING: every output is computed before any is written, so a bad input (an unreadable
// overlay, an invalid registry, unreadable guidance) leaves every deployed file as it was.
// Each write is atomic (temp file + rename): these files carry every security hook.
//
// Exit: 0 rendered or already current · 1 an input is missing or invalid (nothing written).

import {
  access,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  unlink,
} from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { dirname, join } from "node:path";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";
import { obj } from "../agents/hooks/narrow.ts";
import { jsonText, z } from "../agents/hooks/zod.ts";
import { loadSlugs } from "../agents/hooks/slugs.ts";
import {
  LAND_HOSTS,
  renderedForPlatform,
  resolveRole,
  roleSystemdEnvironment,
} from "./config-registry.ts";
import { brewPrefix } from "./core-tools.ts";
import { prepareRenderSource } from "./render-source.ts";
import {
  type HookSpec,
  loadRegistry,
  HooksConfigSchema,
  type Vendor,
  wire,
  commandFor,
} from "./hook-registry.ts";

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

let cleanupSource = async (): Promise<void> => {};

function fatal(line: string, ...more: string[]): never {
  for (const l of [line, ...more]) process.stderr.write(`${l}\n`);
  void cleanupSource();
  return process.exit(1);
}

const home = process.env["HOME"] ?? homedir();
const commandTargetHome = process.env["COMMAND_TARGET_HOME"] ?? home;
const liveDotfiles = process.env["DOTFILES"] ?? join(import.meta.dir, "..");
const prepared = await attempt(() =>
  prepareRenderSource(
    liveDotfiles,
    process.env["DOTFILES_RENDER_FROM_WORKING_COPY"] === "1",
    process.env["DOTFILES_RENDER_REV"],
  ),
);
if (!prepared.ok)
  fatal(`FATAL: render inputs: ${errorMessage(prepared.error)}`);
if (prepared.value instanceof Error) fatal(`warn: ${prepared.value.message}`);
const source = prepared.value;
cleanupSource = async () => {
  if (source.root !== liveDotfiles)
    await rm(source.root, { recursive: true, force: true });
};
await using _source = { [Symbol.asyncDispose]: source.release };
const dotfiles = source.root;
print(`render source: ${source.description}`);
const committedRenderer = join(dotfiles, "scripts/render-home.ts");
if (dotfiles !== liveDotfiles && (await exists(committedRenderer))) {
  // Execute the landed renderer too: a later clean alpha may have changed the presentation/wire.
  // The exported tree has no jj metadata, so the child reads only these already pinned bytes.
  const rendered = Bun.spawn([process.execPath, committedRenderer], {
    stdout: "inherit",
    stderr: "inherit",
    timeout: 60_000,
    env: {
      ...process.env,
      DOTFILES: dotfiles,
      DOTFILES_RENDER_REV: undefined,
      DOTFILES_RENDER_FROM_WORKING_COPY: "0",
    },
  });
  const renderExitCode = await rendered.exited;
  await source.release();
  process.exit(renderExitCode);
}
const basePath = `${dotfiles}/agents/claude/settings.json`;
const overlayPath =
  process.env["CLAUDE_SETTINGS_PRIVATE"] ??
  `${home}/.claude/settings.private.json`;

async function readJson(
  path: string,
): Promise<Record<string, unknown> | Error> {
  const decoded = jsonText.safeParse(await readFile(path, "utf8"));
  if (!decoded.success) {
    return new Error(decoded.error.issues.map((i) => i.message).join("; "));
  }
  const parsed = obj(decoded.data);
  if (parsed === undefined) return new Error("not a JSON object");
  return parsed;
}

/** `config` with its `hooks` wired from the registry for `vendor`; FATAL (nothing written yet)
 * when its `hooks` is not a hook config. */
function withHooks(
  config: Record<string, unknown>,
  specs: HookSpec[],
  vendor: Vendor,
  from: string,
): Record<string, unknown> {
  const hooks = HooksConfigSchema.safeParse(config["hooks"] ?? {});
  if (!hooks.success) {
    fatal(
      `FATAL: ${from}: \`hooks\` is not a hook config — ${hooks.error.message}`,
    );
  }
  const identities = loadSlugs(`${dotfiles}/agents/hooks/hooks.toml`);
  if (identities instanceof Error)
    fatal(`FATAL: hook slug registry: ${identities.message}`);
  const wired = wire(hooks.data, specs, vendor);
  for (const hook of Object.values(wired).flatMap((groups) =>
    groups.flatMap((group) => group.hooks),
  )) {
    if (typeof hook["command"] !== "string") continue;
    const command = hook["command"];
    const identity = identities.identities.find(
      (h) =>
        h.commands.includes(
          command.replace(/^HOOK_SLUG=dotfiles:[\w:-]+ /u, ""),
        ) ||
        specs.some(
          (spec) =>
            h.script === `hooks/${spec.script}` && commandFor(spec) === command,
        ),
    );
    if (identity !== undefined)
      hook["command"] =
        `HOOK_SLUG=dotfiles:${identity.slug} ${command.replace(/^HOOK_SLUG=dotfiles:[\w:-]+ /u, "")}`;
  }
  return { ...config, hooks: wired };
}

const json = (v: unknown): string => `${JSON.stringify(v, null, 2)}\n`;

type Output = { dest: string; text: string; from: string };

function firstToken(
  command: string,
): { token: string; rest: string } | undefined {
  const match =
    /^\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)'|(\S+))(?:\s+([\s\S]*))?$/u.exec(
      command,
    );
  if (match === null) return undefined;
  const token = (match[1] ?? match[2] ?? match[3] ?? "").replaceAll(
    /\\([\\"'])/gu,
    "$1",
  );
  return { token, rest: match[4] ?? "" };
}

function expandHome(path: string): string {
  if (path === "~") return commandTargetHome;
  if (path.startsWith("~/")) return `${commandTargetHome}/${path.slice(2)}`;
  return path;
}

async function missingTarget(command: string): Promise<string | undefined> {
  let first = firstToken(command);
  while (first !== undefined && /^[A-Za-z_][A-Za-z0-9_]*=/u.test(first.token))
    first = firstToken(first.rest);
  if (first === undefined) return undefined;

  // `bun script.ts` executes the script target, so validate that path rather than Bun itself.
  const target =
    first.token === "bun" ? firstToken(first.rest)?.token : first.token;
  if (target === undefined) return undefined;
  const expanded = expandHome(target);
  const found = expanded.includes("/")
    ? await exists(expanded)
    : Bun.which(expanded) !== null;
  return found ? undefined : expanded;
}

function commandTargets(value: unknown): string[] {
  const found: string[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const record = obj(node);
    if (record === undefined) return;
    if (record["type"] === "command" && typeof record["command"] === "string")
      found.push(record["command"]);
    for (const child of Object.values(record)) visit(child);
  };
  visit(value);
  return found;
}

async function validateCommandTargets(
  settings: Record<string, unknown>,
  codex: Record<string, unknown>,
): Promise<void> {
  const statusLine = obj(settings["statusLine"]);
  const commands: string[] = [];
  if (typeof statusLine?.["command"] === "string")
    commands.push(statusLine["command"]);
  commands.push(
    ...commandTargets(settings["hooks"]),
    ...commandTargets(codex["hooks"]),
  );

  for (const command of commands) {
    const missing = await missingTarget(command);
    if (missing === undefined) continue;
    let repair: string;
    if (missing.startsWith(`${commandTargetHome}/.bun/bin/`)) {
      repair = `run \`mise run deps\` first (it creates ${missing})`;
    } else {
      repair = `install or restore the executable at ${missing}`;
    }
    fatal(
      `FATAL: command target is missing: ${JSON.stringify(command)} -> ${missing}`,
      `  repair: ${repair}`,
    );
  }
}

// ── inputs ───────────────────────────────────────────────────────────────────────────────────
const baseRead = await attempt(() => readJson(basePath));
if (!baseRead.ok || baseRead.value instanceof Error) {
  const error = baseRead.ok ? baseRead.value : baseRead.error;
  fatal(
    `FATAL: cannot read base settings ${basePath} — ${errorMessage(error)}`,
  );
}

let overlay: Record<string, unknown> = {};
let overlayKeys: string[] = [];
if (await exists(overlayPath)) {
  const overlayRead = await attempt(() => readJson(overlayPath));
  // Hard failure, not a skip: a malformed overlay means the private rules (which include
  // soft_deny entries protecting a court-of-record file) would vanish without a word.
  if (!overlayRead.ok || overlayRead.value instanceof Error) {
    const error = overlayRead.ok ? overlayRead.value : overlayRead.error;
    fatal(
      `FATAL: private overlay ${overlayPath} is not readable JSON — ${errorMessage(error)}`,
      "  refusing to render settings that would silently drop the private rules",
    );
  }
  overlay = overlayRead.value;
  overlayKeys = Object.keys(overlay).toSorted();
}

const registry = await attempt(() => loadRegistry(`${dotfiles}/agents/hooks`));
if (!registry.ok) {
  fatal(
    `FATAL: cannot read ${dotfiles}/agents/hooks/hooks.toml — ${errorMessage(registry.error)}`,
  );
}
if (registry.value.errors.length > 0) {
  fatal(
    "FATAL: agents/hooks/hooks.toml is invalid; refusing to render hook configs without its gates",
    ...registry.value.errors.map((e) => `  invalid: ${e}`),
  );
}
const { specs } = registry.value;

// ── ~/.claude/settings.json ──────────────────────────────────────────────────────────────────
const settings: Record<string, unknown> = { ...baseRead.value, ...overlay };
// Claude Code writes these keys through its UI; retain their deployed values across renders.
const claudeWrittenKeys = ["modelSettings"];
const deployedSettingsPath = `${home}/.claude/settings.json`;
if (await exists(deployedSettingsPath)) {
  // A malformed deployed file was previously overwritten; preserve that behavior.
  const deployed = await readJson(deployedSettingsPath);
  if (!(deployed instanceof Error))
    Object.assign(
      settings,
      Object.fromEntries(
        claudeWrittenKeys
          .filter((key) => Object.hasOwn(deployed, key))
          .map((key) => [key, deployed[key]]),
      ),
    );
}
const marketplaces = obj(settings["extraKnownMarketplaces"]);
if (marketplaces !== undefined && Object.hasOwn(marketplaces, "dotfiles")) {
  const remaining = { ...marketplaces };
  delete remaining["dotfiles"];
  if (Object.keys(remaining).length === 0)
    delete settings["extraKnownMarketplaces"];
  else settings["extraKnownMarketplaces"] = remaining;
}
const enabledPlugins = obj(settings["enabledPlugins"]);
if (
  enabledPlugins !== undefined &&
  Object.hasOwn(enabledPlugins, "dotfiles@dotfiles")
) {
  const remaining = { ...enabledPlugins };
  delete remaining["dotfiles@dotfiles"];
  if (Object.keys(remaining).length === 0) delete settings["enabledPlugins"];
  else settings["enabledPlugins"] = remaining;
}
const tzPath = `${dotfiles}/zsh/timezone`;
let tzNote = "";
if (await exists(tzPath)) {
  const zone = (await readFile(tzPath, "utf8")).trim();
  const known = await attempt(() => Temporal.Now.zonedDateTimeISO(zone));
  if (zone === "" || zone.includes("\n") || !known.ok) {
    fatal(
      `FATAL: ${tzPath} must hold one IANA zone name, got ${JSON.stringify(zone)}`,
    );
  }
  const env = obj(settings["env"]) ?? {};
  if (env["TZ"] !== undefined)
    tzNote = ` (env.TZ kept: ${JSON.stringify(env["TZ"])})`;
  else if (await exists(`/usr/share/zoneinfo/${zone}`)) {
    settings["env"] = { ...env, TZ: zone };
    tzNote = ` (env.TZ=${zone})`;
  } else tzNote = ` (no /usr/share/zoneinfo/${zone}: env.TZ not set)`;
}

const rolePath = join(dotfiles, "roles/roles.toml");
const roleInput = await attempt(async () =>
  Bun.TOML.parse(await Bun.file(rolePath).text()),
);
const roleSchema = z.strictObject({
  workstation: z.strictObject({
    tokio_worker_threads: z.union([z.literal(""), z.number().int().positive()]),
    rustc_wrapper: z.enum(["sccache", "none"]),
  }),
  "shared-light": z.strictObject({
    tokio_worker_threads: z.union([z.literal(""), z.number().int().positive()]),
    rustc_wrapper: z.enum(["sccache", "none"]),
  }),
});
if (!roleInput.ok)
  fatal(`FATAL: cannot read ${rolePath} — ${errorMessage(roleInput.error)}`);
const roles = roleSchema.safeParse(roleInput.value);
if (!roles.success)
  fatal(`FATAL: invalid ${rolePath} — ${roles.error.message}`);
for (const host of LAND_HOSTS) {
  if (!Object.hasOwn(roles.data, host.role))
    fatal(`FATAL: unknown role for ${host.alias}: ${host.role}`);
}
const role = resolveRole(hostname()).role;
const defaults = roles.data[role];
const outputs: Output[] = [
  {
    dest: `${home}/.config/dotfiles/role.env`,
    text: `DOTFILES_ROLE=${role}\nDOTFILES_ROLE_TOKIO_WORKER_THREADS=${defaults.tokio_worker_threads}\nDOTFILES_ROLE_RUSTC_WRAPPER=${defaults.rustc_wrapper}\n`,
    from: `${rolePath} + LAND_HOSTS`,
  },
  {
    dest: `${home}/.config/dotfiles/brew-prefix`,
    text: `${brewPrefix(commandTargetHome)}\n`,
    from: "scripts/config-registry.ts LAND_HOSTS + machine OS/hostname",
  },
  {
    dest: `${home}/.claude/settings.json`,
    text: json(withHooks(settings, specs, "claude", basePath)),
    from: `${basePath}${overlayKeys.length > 0 ? ` + ${overlayPath} [${overlayKeys.join(", ")}]` : " (no private overlay)"}${tzNote}`,
  },
];
if (process.platform === "linux") {
  const directory = `${home}/.config/environment.d`;
  if ((await lstat(directory).catch(() => null))?.isSymbolicLink() === true)
    fatal(`FATAL: ${directory} is a symlink; refusing to render through it`);
  const cpuProbe = await attempt(async () => {
    const proc = Bun.spawn(["/usr/bin/getconf", "_NPROCESSORS_ONLN"], {
      timeout: 5_000,
      stdout: "pipe",
      stderr: "ignore",
    });
    const [output, code] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);
    return code === 0 ? output.trim() : "";
  });
  // Like the shell reader, retain the role value if the CPU count is unavailable.
  const cpuText = cpuProbe.ok ? cpuProbe.value : "";
  const cpus = /^[0-9]+$/u.test(cpuText) ? Number(cpuText) : 0;
  const threads = defaults.tokio_worker_threads;
  const capped = threads !== "" && cpus > 0 ? Math.min(threads, cpus) : threads;
  outputs.push({
    dest: `${directory}/60-dotfiles-role.conf`,
    text:
      roleSystemdEnvironment(capped) +
      (defaults.rustc_wrapper === "sccache" ? "RUSTC_WRAPPER=sccache\n" : ""),
    from: `${rolePath} + LAND_HOSTS`,
  });
}

// ── ~/.codex/hooks.json ──────────────────────────────────────────────────────────────────────
const codexPath = `${dotfiles}/agents/codex/hooks.json`;
const codex = await attempt(() => readJson(codexPath));
if (!codex.ok || codex.value instanceof Error) {
  const error = codex.ok ? codex.value : codex.error;
  fatal(`FATAL: cannot read ${codexPath} — ${errorMessage(error)}`);
}
outputs.push({
  dest: `${home}/.codex/hooks.json`,
  text: json(withHooks(codex.value, specs, "codex", codexPath)),
  from: `${codexPath} + agents/hooks/hooks.toml`,
});

await validateCommandTargets(settings, codex.value);

// ── ~/.claude/CLAUDE.md ──────────────────────────────────────────────────────────────────────
const mdPath = `${dotfiles}/agents/claude/CLAUDE.md`;
const md = await attempt(() => readFile(mdPath, "utf8"));
if (!md.ok) fatal(`FATAL: cannot read ${mdPath} — ${errorMessage(md.error)}`);
outputs.push({
  dest: `${home}/.claude/CLAUDE.md`,
  text: md.value,
  from: mdPath,
});

// ── write ────────────────────────────────────────────────────────────────────────────────────
// The registry (scripts/config-registry.ts RENDERED) is what doctor and lint:one-writer check; a
// render that writes a path it does not list, or skips one it lists, is a bug caught here.
const declared = renderedForPlatform(process.platform === "linux")
  .map((r) => `${home}/${r.dest}`)
  .toSorted();
const produced = outputs.map((o) => o.dest).toSorted();
if (!Bun.deepEquals(declared, produced)) {
  fatal(
    "FATAL: render-home's outputs differ from scripts/config-registry.ts RENDERED",
    `  declared: ${declared.join(", ")}`,
    `  produced: ${produced.join(", ")}`,
  );
}
for (const { dest, text, from } of outputs) {
  // One lstat per destination: undefined = absent; a symlink is the older layout (below).
  const st = await lstat(dest).catch(() => null);
  // Already current → no write, no churn (this runs on every pull via the post-merge hook).
  if (st?.isFile() === true && (await readFile(dest, "utf8")) === text) {
    print(`current: ${dest} <- ${from}`);
    continue;
  }
  await mkdir(dirname(dest), { recursive: true });
  const tmpPath = `${dest}.rendering`;
  await Bun.write(tmpPath, text);
  // The older layout had a SYMLINK here pointing into the repo. rename() would replace the link
  // itself, but unlink first so the transition is explicit and reported.
  let replaced = "";
  if (st?.isSymbolicLink() === true) {
    replaced = " (replaced the old symlink into the repo)";
    await unlink(dest);
  }
  await rename(tmpPath, dest);
  print(`rendered: ${dest} <- ${from}${replaced}`);
}
