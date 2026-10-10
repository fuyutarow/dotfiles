// Static liveness check for deployed $HOME surfaces that execute or link into this checkout.
// Consumer: humans/CI running `mise run lint:live-refs`; output is verdict lines.
import {
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  readdirSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  writeSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { cli } from "cleye";
import { fromThrowable } from "neverthrow";
import { jsonOf, z } from "../agents/hooks/zod.ts";
import { LINKS, type When } from "./config-registry.ts";
import {
  jjContext,
  jjCandidate,
  jjExport,
  selected,
  type JjPrecommit,
} from "../agents/skills/wiring-mise-tasks/scripts/jj-precommit.ts";
import { RENDER_INPUTS } from "./render-source.ts";

type Os = "mac" | "wsl" | "linux";
type Roots = { repo: string; home: string; os: Os };

const REPAIR =
  "restore the file or remove the reference in the same commit; after landing declarations, run `mise run deps && mise run link:dots` to refresh deployed files";

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    writeSync(2, "unknown flag(s): --__proto__\n");
    process.exit(2);
  }
}

function applies(when: When, os: Os): boolean {
  return (
    when === "all" ||
    (when === "mac" && os === "mac") ||
    (when === "wsl" && os === "wsl") ||
    (when === "linux" && os === "linux") ||
    (when === "not-mac" && os !== "mac")
  );
}

function under(path: string, root: string): boolean {
  // macOS exposes /var as a symlink to /private/var. Missing targets cannot be passed directly
  // to realpathSync, so canonicalize through their nearest existing parent before comparing.
  const rel = relative(
    resolveMissingPath(resolve(root)),
    resolveMissingPath(resolve(path)),
  );
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`));
}

function pointsIntoRepo(path: string, repo: string): boolean {
  if (under(path, repo)) return true;
  const realpath = fromThrowable(() =>
    realpathSync(path, { encoding: "utf8" }),
  )();
  if (realpath.isOk()) return under(realpath.value, repo);
  const stat = fromThrowable(lstatSync)(path, { throwIfNoEntry: false });
  if (stat.isErr()) return false;
  if (stat.value?.isSymbolicLink() === true) {
    const raw = readlinkSync(path);
    return pointsIntoRepo(
      isAbsolute(raw) ? raw : resolve(dirname(path), raw),
      repo,
    );
  }
  const parent = dirname(path);
  if (parent === path) return false;
  const parentRealpath = fromThrowable(() =>
    realpathSync(parent, { encoding: "utf8" }),
  )();
  return parentRealpath.isOk()
    ? under(parentRealpath.value, repo)
    : pointsIntoRepo(parent, repo);
}

function resolveMissingPath(path: string): string {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat?.isSymbolicLink() === true) {
    const raw = readlinkSync(path);
    return resolveMissingPath(
      isAbsolute(raw) ? raw : resolve(dirname(path), raw),
    );
  }
  const realpath = fromThrowable(() =>
    realpathSync(path, { encoding: "utf8" }),
  )();
  if (realpath.isOk()) return realpath.value;
  const parent = dirname(path);
  if (parent === path) return path;
  return join(resolveMissingPath(parent), path.slice(parent.length + 1));
}

function expandHome(path: string, home: string): string {
  if (path === "~") return home;
  if (path.startsWith("~/")) return join(home, path.slice(2));
  return path;
}

function checkRepoPath(
  surface: string,
  path: string,
  roots: Roots,
  out: string[],
): void {
  const expanded = expandHome(path, roots.home);
  const absolute = isAbsolute(expanded)
    ? expanded
    : resolve(roots.repo, expanded);
  const resolved = resolveMissingPath(absolute);
  if (!pointsIntoRepo(resolved, roots.repo)) return;
  if (!existsSync(absolute)) {
    out.push(`FAIL ${surface} → missing target ${resolved}; ${REPAIR}`);
  }
}

function checkLinkedPath(
  surface: string,
  path: string,
  roots: Roots,
  out: string[],
): void {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat?.isSymbolicLink() !== true) return;
  const raw = readlinkSync(path);
  const target = isAbsolute(raw) ? raw : resolve(dirname(path), raw);
  if (pointsIntoRepo(target, roots.repo)) {
    checkRepoPath(surface, target, roots, out);
  }
}

function checkCommand(
  surface: string,
  command: string,
  roots: Roots,
  out: string[],
): void {
  const tokens = command.match(/"(?:[^"\\]|\\.)*"|'[^']*'|[^\s]+/gu) ?? [];
  const words = tokens.map((token) =>
    token.replace(/^(?:"(.*)"|'(.*)')$/u, "$1$2"),
  );
  let runnerDir: string | undefined;
  for (const word of words) {
    runnerDir = checkCommandWord(word, runnerDir, surface, roots, out);
  }
}

function checkCommandWord(
  word: string,
  runnerDir: string | undefined,
  surface: string,
  roots: Roots,
  out: string[],
): string | undefined {
  if (word.startsWith("~") || isAbsolute(word)) {
    const expanded = expandHome(word, roots.home);
    const absolute = isAbsolute(expanded)
      ? expanded
      : resolve(roots.repo, expanded);
    if (!pointsIntoRepo(absolute, roots.repo)) return runnerDir;
    checkRepoPath(surface, absolute, roots, out);
    return absolute.endsWith("/run.sh") ? dirname(absolute) : runnerDir;
  }
  if (runnerDir !== undefined && /^[\w.-]+\.ts$/u.test(word)) {
    checkRepoPath(surface, join(runnerDir, word), roots, out);
  }
  return runnerDir;
}

function commandsIn(
  value: unknown,
  surface: string,
  roots: Roots,
  out: string[],
  source?: { text: string; offset: number },
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      commandsIn(entry, `${surface}[${index}]`, roots, out, source);
    });
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "command" && typeof child === "string") {
      checkCommand(commandReference(surface, child, source), child, roots, out);
    } else {
      commandsIn(child, `${surface}.${key}`, roots, out, source);
    }
  }
}

function commandReference(
  surface: string,
  command: string,
  source?: { text: string; offset: number },
): string {
  const encoded = JSON.stringify(command);
  const offset = source?.text.indexOf(encoded, source.offset) ?? -1;
  const line =
    offset < 0 ? 1 : (source?.text.slice(0, offset).split("\n").length ?? 1);
  if (source !== undefined && offset >= 0)
    source.offset = offset + encoded.length;
  return `${surface.replace(/(\.json).*$/u, "$1")}:${line} (${surface})`;
}

function referenceLine(source: string | undefined, value: string): number {
  const offset = source?.indexOf(JSON.stringify(value)) ?? -1;
  return offset < 0 ? 1 : (source?.slice(0, offset).split("\n").length ?? 1);
}

function readJson(path: string): unknown {
  const parsed = jsonOf(z.unknown()).safeParse(readFileSync(path, "utf8"));
  if (parsed.success) return parsed.data;
  writeSync(2, `FATAL: ${path}: cannot read JSON: ${parsed.error.message}\n`);
  return process.exit(2);
}

function checkLinks(roots: Roots, out: string[]): void {
  for (const [when, , destination] of LINKS) {
    if (applies(when, roots.os)) {
      checkLinkedPath(
        `deployed link ~/${destination}`,
        join(roots.home, destination),
        roots,
        out,
      );
    }
  }

  const skillLinks = [
    ".claude/commands",
    ".codex/AGENTS.md",
    ".codex/prompts",
    ".agents/skills",
    ".gemini/antigravity/global_workflows",
  ];
  for (const destination of skillLinks) {
    checkLinkedPath(
      `deployed link ~/${destination}`,
      join(roots.home, destination),
      roots,
      out,
    );
  }
  const claudeSkills = join(roots.home, ".claude/skills");
  if (existsSync(claudeSkills)) {
    for (const name of readdirSync(claudeSkills, { withFileTypes: true })
      .filter((entry) => entry.isSymbolicLink())
      .map((entry) => entry.name)) {
      checkLinkedPath(
        `deployed skill ~/${join(".claude/skills", name)}`,
        join(claudeSkills, name),
        roots,
        out,
      );
    }
  }
}

function checkHookRegistry(roots: Roots, out: string[]): void {
  const raw = readFileSync(join(roots.repo, "agents/hooks/hooks.toml"), "utf8");
  const decoded = fromThrowable(() => Bun.TOML.parse(raw))();
  if (decoded.isErr()) {
    writeSync(
      2,
      `FATAL: agents/hooks/hooks.toml: cannot parse registry: ${decoded.error instanceof Error ? decoded.error.message : String(decoded.error)}\n`,
    );
    process.exit(2);
  }
  const parsed = z
    .object({
      hook: z
        .array(
          z.object({
            script: z.unknown().optional(),
            vendors: z.unknown().optional(),
          }),
        )
        .optional(),
    })
    .safeParse(decoded.value);
  if (!parsed.success) {
    writeSync(
      2,
      `FATAL: agents/hooks/hooks.toml: cannot validate registry: ${parsed.error.message}\n`,
    );
    process.exit(2);
  }
  for (const [index, hook] of (parsed.data.hook ?? []).entries()) {
    if (typeof hook.script !== "string") continue;
    const script = join(roots.repo, "agents/hooks", hook.script);
    if (Array.isArray(hook.vendors) && hook.vendors.length > 0) {
      checkRepoPath(
        `declared agents/hooks/hooks.toml:${referenceLine(raw, hook.script)} hook[${index}]`,
        script,
        roots,
        out,
      );
    }
  }
}

export function findings(roots: Roots): string[] {
  const out: string[] = [];
  checkLinks(roots, out);

  for (const [surface, path] of [
    [
      "deployed ~/.claude/settings.json",
      join(roots.home, ".claude/settings.json"),
    ],
    ["deployed ~/.codex/hooks.json", join(roots.home, ".codex/hooks.json")],
  ] as const) {
    if (existsSync(path))
      commandsIn(readJson(path), surface, roots, out, {
        text: readFileSync(path, "utf8"),
        offset: 0,
      });
  }
  for (const [surface, path] of [
    [
      "declared agents/claude/settings.json",
      join(roots.repo, "agents/claude/settings.json"),
    ],
    [
      "declared agents/codex/hooks.json",
      join(roots.repo, "agents/codex/hooks.json"),
    ],
  ] as const) {
    if (existsSync(path))
      commandsIn(readJson(path), surface, roots, out, {
        text: readFileSync(path, "utf8"),
        offset: 0,
      });
  }
  checkHookRegistry(roots, out);

  const parsedPkg = z
    .object({ bin: z.record(z.string(), z.unknown()).optional() })
    .safeParse(readJson(join(roots.repo, "package.json")));
  const pkg = parsedPkg.success ? parsedPkg.data : {};
  for (const [name, target] of Object.entries(pkg.bin ?? {})) {
    if (typeof target === "string") {
      checkRepoPath(
        `package.json bin ${name}:${referenceLine(readFileSync(join(roots.repo, "package.json"), "utf8"), target)}`,
        join(roots.repo, target),
        roots,
        out,
      );
    }
  }
  return out;
}

// A commit is BASE plus selected REV paths. Render that view in a disposable HOME;
// deployment is deliberately later, and must never be a prerequisite for retirement.
export function candidateFindings(
  context: JjPrecommit,
  home: string,
  os: Os,
): string[] {
  const scratch = mkdtempSync(join(tmpdir(), "live-refs-candidate-"));
  const repo = join(scratch, "repo");
  const targetHome = join(scratch, "home");
  using _cleanup = {
    [Symbol.dispose]: () => {
      rmSync(scratch, { recursive: true, force: true });
    },
  };
  const entries = jjCandidate(context);
  // Liveness needs existence, not file contents. Export only render inputs and manifests.
  for (const path of entries.keys()) {
    const dest = join(repo, path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, "");
  }
  jjExport(
    context,
    repo,
    new Map(
      [...entries].filter(
        ([path]) =>
          selected(RENDER_INPUTS, path) || path.endsWith("package.json"),
      ),
    ),
  );
  const link = (source: string, destination: string): void => {
    const dest = join(targetHome, destination);
    if (lstatSync(dest, { throwIfNoEntry: false }) !== undefined) return;
    mkdirSync(dirname(dest), { recursive: true });
    symlinkSync(join(repo, source), dest);
  };
  for (const [when, source, destination] of LINKS)
    if (applies(when, os)) link(source, destination);
  link("agents/skills", ".agents/skills");
  link("agents/commands", ".claude/commands");
  link("agents/codex/AGENTS.md", ".codex/AGENTS.md");
  link("agents/commands", ".codex/prompts");
  for (const path of entries.keys()) {
    if (!path.endsWith("package.json")) continue;
    const pkg = z
      .object({ bin: z.record(z.string(), z.string()).optional() })
      .safeParse(readJson(join(repo, path)));
    if (!pkg.success) continue;
    for (const [name, target] of Object.entries(pkg.data.bin ?? {}))
      link(join(dirname(path), target), `.bun/bin/${name}`);
  }
  // bounded: native 60s timeout on the immutable candidate renderer.
  const rendered = Bun.spawnSync(
    [process.execPath, join(repo, "scripts/render-home.ts")],
    {
      env: {
        ...process.env,
        HOME: targetHome,
        DOTFILES: repo,
        COMMAND_TARGET_HOME: targetHome,
        CLAUDE_SETTINGS_PRIVATE:
          process.env.CLAUDE_SETTINGS_PRIVATE ??
          join(home, ".claude/settings.private.json"),
        DOTFILES_RENDER_REV: undefined,
        DOTFILES_RENDER_FROM_WORKING_COPY: "1",
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 60_000,
    },
  );
  const diagnostic = [
    rendered.stderr.toString().trim(),
    rendered.stdout.toString().trim(),
  ]
    .filter((text) => text !== "")
    .join("\n");
  if (rendered.exitCode !== 0)
    return [
      `FATAL: live-refs candidate render could not run (exit ${rendered.exitCode}, signal ${rendered.signalCode ?? "none"}): ${diagnostic === "" ? "no child diagnostics" : diagnostic}`,
    ];
  return findings({ repo, home: targetHome, os });
}

function systemOs(): Os | undefined {
  if (process.platform === "darwin") return "mac";
  if (process.platform !== "linux") return undefined;
  return /microsoft/iu.test(readFileSync("/proc/sys/kernel/osrelease", "utf8"))
    ? "wsl"
    : "linux";
}

function main(): void {
  const parsed = cli(
    {
      name: "live-refs.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length > 0) {
    writeSync(2, `unexpected positional argument: ${parsed._[0]}\n`);
    process.exitCode = 2;
    return;
  }
  const home = process.env.HOME ?? homedir();
  const repo = process.env.DOTFILES ?? resolve(import.meta.dir, "..");
  const os = systemOs();
  if (os === undefined) {
    writeSync(2, `FATAL: unsupported platform: ${process.platform}\n`);
    process.exitCode = 2;
    return;
  }
  const context = jjContext();
  const result =
    context === undefined
      ? findings({ home, repo, os })
      : candidateFindings(context, home, os);
  if (result.length > 0) {
    result.forEach((line) => {
      writeSync(2, `${line}\n`);
    });
    process.exitCode = 1;
    return;
  }
  process.stdout.write("PASS live repo references resolve\n");
}

if (import.meta.main) {
  fromThrowable(main)().match(
    () => {},
    (error) => {
      writeSync(
        2,
        `FATAL: live-refs check could not run: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 2;
    },
  );
}
