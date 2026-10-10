// Renders the GENERATED half of $HOME — every deployed file that is a function of several repo
// declarations (plus machine facts), so it cannot be a symlink to one of them:
//   ~/.claude/settings.json  <- agents/claude/settings.json + ~/.claude/settings.private.json
//                               + zsh/timezone (env.TZ) + agents/hooks/hooks.toml (claude)
//   ~/.codex/hooks.json      <- agents/codex/hooks.json + agents/hooks/hooks.toml (codex)
//   ~/.claude/CLAUDE.md      <- agents/claude/CLAUDE.md + agents/models/dispatch-roster.toml
//                                (including the rendered agx ticket-home/amendment contract)
// Consumer: scripts/link-dots.ts (and therefore `mise run link:dots` + the post-merge hook), and
// `mise run doctor`, which renders into a scratch HOME and compares. Output is verdict lines.
//
// DATA FLOWS ONE WAY (README → Design, INV-8): declaration (repo, hand-written) → render (here) →
// deployed ($HOME, never edited) → runtime. Every file has ONE writer: a human writes the repo
// inputs, this script writes the outputs, and nothing writes back. Until 2026-10-06 two of these
// were generated INTO the repo instead (`hooks:wire` rewrote entries inside the committed vendor
// files; `roster:render` rewrote a block inside agents/claude/CLAUDE.md): two writers per file,
// and a hand edit inside the generated part was silently undone. The only flow back is a CHECK
// (doctor reports a deployed file that is not a fresh render) — never data.
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
// NO FLAGS, NO DEPENDENCIES — deliberate. It must render on a half-set-up machine, before `mise run
// deps` has restored node_modules (link-dots.sh called it exactly then until 2026-10-05; the .ts
// port now runs after deps, but a render must not depend on that ordering holding). With no argv
// read there is no Cleye boundary to owe (writing-bun-scripts BG1). Every import is zero-install:
// attempt.ts, narrow.ts, the committed zod bundle, and the two pure modules built on them
// (hook-registry.ts, agents/models/roster.ts). Inputs come from the environment so tests can point
// it at fixtures:
//   DOTFILES                  repo root            (default: $HOME/dotfiles)
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
// overlay, an invalid registry, a roster that does not load) leaves every deployed file as it was.
// Each write is atomic (temp file + rename): these files carry every security hook.
//
// Exit: 0 rendered or already current · 1 an input is missing or invalid (nothing written).

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";
import { obj } from "../agents/hooks/narrow.ts";
import { jsonText } from "../agents/hooks/zod.ts";
import { loadSlugs } from "../agents/hooks/slugs.ts";
import { loadRoster, rosterPolicy } from "../agents/models/roster.ts";
import { RENDERED } from "./config-registry.ts";
import { brewPrefix } from "./core-tools.ts";
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

function fatal(line: string, ...more: string[]): never {
  for (const l of [line, ...more]) process.stderr.write(`${l}\n`);
  return process.exit(1);
}

const home = process.env.HOME ?? homedir();
const commandTargetHome = process.env.COMMAND_TARGET_HOME ?? home;
const dotfiles = process.env.DOTFILES ?? `${home}/dotfiles`;
const basePath = `${dotfiles}/agents/claude/settings.json`;
const overlayPath =
  process.env.CLAUDE_SETTINGS_PRIVATE ??
  `${home}/.claude/settings.private.json`;

function readJson(path: string): Record<string, unknown> | Error {
  const decoded = jsonText.safeParse(readFileSync(path, "utf8"));
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
  const hooks = HooksConfigSchema.safeParse(config.hooks ?? {});
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
    if (typeof hook.command !== "string") continue;
    const command = hook.command;
    const identity = identities.identities.find(
      (h) =>
        h.commands.includes(command) ||
        specs.some(
          (spec) =>
            h.script === `hooks/${spec.script}` && commandFor(spec) === command,
        ),
    );
    if (identity !== undefined)
      hook.command = `HOOK_SLUG=${identity.slug} ${command}`;
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

function missingTarget(command: string): string | undefined {
  const first = firstToken(command);
  if (first === undefined) return undefined;

  // `bun script.ts` executes the script target, so validate that path rather than Bun itself.
  const target =
    first.token === "bun" ? firstToken(first.rest)?.token : first.token;
  if (target === undefined) return undefined;
  const expanded = expandHome(target);
  const found = expanded.includes("/")
    ? existsSync(expanded)
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
    if (record.type === "command" && typeof record.command === "string")
      found.push(record.command);
    for (const child of Object.values(record)) visit(child);
  };
  visit(value);
  return found;
}

function validateCommandTargets(
  settings: Record<string, unknown>,
  codex: Record<string, unknown>,
): void {
  const statusLine = obj(settings.statusLine);
  const commands: string[] = [];
  if (typeof statusLine?.command === "string")
    commands.push(statusLine.command);
  commands.push(
    ...commandTargets(settings.hooks),
    ...commandTargets(codex.hooks),
  );

  for (const command of commands) {
    const missing = missingTarget(command);
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
if (existsSync(overlayPath)) {
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
const tzPath = `${dotfiles}/zsh/timezone`;
let tzNote = "";
if (existsSync(tzPath)) {
  const zone = readFileSync(tzPath, "utf8").trim();
  const known = await attempt(() => Temporal.Now.zonedDateTimeISO(zone));
  if (zone === "" || zone.includes("\n") || !known.ok) {
    fatal(
      `FATAL: ${tzPath} must hold one IANA zone name, got ${JSON.stringify(zone)}`,
    );
  }
  const env = obj(settings.env) ?? {};
  if (env.TZ !== undefined)
    tzNote = ` (env.TZ kept: ${JSON.stringify(env.TZ)})`;
  else if (existsSync(`/usr/share/zoneinfo/${zone}`)) {
    settings.env = { ...env, TZ: zone };
    tzNote = ` (env.TZ=${zone})`;
  } else tzNote = ` (no /usr/share/zoneinfo/${zone}: env.TZ not set)`;
}

const outputs: Output[] = [
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

validateCommandTargets(settings, codex.value);

// ── ~/.claude/CLAUDE.md ──────────────────────────────────────────────────────────────────────
const BEGIN = "<!-- roster:begin -->";
const END = "<!-- roster:end -->";
const mdPath = `${dotfiles}/agents/claude/CLAUDE.md`;
const rosterPath = `${dotfiles}/agents/models/dispatch-roster.toml`;
const md = await attempt(() => readFileSync(mdPath, "utf8"));
if (!md.ok) fatal(`FATAL: cannot read ${mdPath} — ${errorMessage(md.error)}`);
const roster = await loadRoster(rosterPath);
if (!roster.ok) fatal(`FATAL: cannot load ${rosterPath} — ${roster.error}`);
const b = md.value.indexOf(BEGIN);
const e = md.value.indexOf(END);
if (b < 0 || e < b)
  fatal(`FATAL: markers ${BEGIN} … ${END} not found in ${mdPath}`);
outputs.push({
  dest: `${home}/.claude/CLAUDE.md`,
  // rosterPolicy also supplies the generated agx run-control guidance; its source stays in roster.ts.
  text: `${md.value.slice(0, b)}${BEGIN}\n<!-- RENDERED from agents/models/dispatch-roster.toml by scripts/render-home.ts — edit the roster, then \`mise run link:dots\`. -->\n${rosterPolicy(roster.value)}\n${END}${md.value.slice(e + END.length)}`,
  from: `${mdPath} + ${rosterPath}`,
});

// ── write ────────────────────────────────────────────────────────────────────────────────────
// The registry (scripts/config-registry.ts RENDERED) is what doctor and lint:one-writer check; a
// render that writes a path it does not list, or skips one it lists, is a bug caught here.
const declared = RENDERED.map((r) => `${home}/${r.dest}`).toSorted();
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
  const st = lstatSync(dest, { throwIfNoEntry: false });
  // Already current → no write, no churn (this runs on every pull via the post-merge hook).
  if (st?.isFile() === true && readFileSync(dest, "utf8") === text) {
    print(`current: ${dest} <- ${from}`);
    continue;
  }
  mkdirSync(dirname(dest), { recursive: true });
  const tmpPath = `${dest}.rendering`;
  await Bun.write(tmpPath, text);
  // The older layout had a SYMLINK here pointing into the repo. rename() would replace the link
  // itself, but unlink first so the transition is explicit and reported.
  let replaced = "";
  if (st?.isSymbolicLink() === true) {
    replaced = " (replaced the old symlink into the repo)";
    unlinkSync(dest);
  }
  renameSync(tmpPath, dest);
  print(`rendered: ${dest} <- ${from}${replaced}`);
}
