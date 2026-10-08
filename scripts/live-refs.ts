// Static liveness check for deployed $HOME surfaces that execute or link into this checkout.
// Consumer: humans/CI running `mise run lint:live-refs`; output is verdict lines.
import {
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  readdirSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { cli } from "cleye";
import { fromThrowable } from "neverthrow";
import { jsonOf, z } from "../agents/hooks/zod.ts";
import { LINKS, type When } from "./config-registry.ts";

type Os = "mac" | "wsl" | "linux";
type Roots = { repo: string; home: string; os: Os };

const REPAIR =
  "restore the file, or run `mise run deps && mise run link:dots` first, so the new declaration is deployed before the old file is retired";

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("unknown flag(s): --__proto__\n");
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
    out.push(`FAIL ${surface}: dangling path ${resolved}; ${REPAIR}`);
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
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      commandsIn(entry, `${surface}[${index}]`, roots, out);
    });
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "command" && typeof child === "string") {
      checkCommand(surface, child, roots, out);
    } else {
      commandsIn(child, `${surface}.${key}`, roots, out);
    }
  }
}

function readJson(path: string): unknown {
  const parsed = jsonOf(z.unknown()).safeParse(readFileSync(path, "utf8"));
  if (parsed.success) return parsed.data;
  process.stderr.write(`FATAL: ${parsed.error.message}\n`);
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
    process.stderr.write(
      `FATAL: ${decoded.error instanceof Error ? decoded.error.message : String(decoded.error)}\n`,
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
    process.stderr.write(`FATAL: ${parsed.error.message}\n`);
    process.exit(2);
  }
  for (const [index, hook] of (parsed.data.hook ?? []).entries()) {
    if (typeof hook.script !== "string") continue;
    const script = join(roots.repo, "agents/hooks", hook.script);
    if (Array.isArray(hook.vendors) && hook.vendors.length > 0) {
      checkRepoPath(
        `declared agents/hooks/hooks.toml hook[${index}]`,
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
    if (existsSync(path)) commandsIn(readJson(path), surface, roots, out);
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
    if (existsSync(path)) commandsIn(readJson(path), surface, roots, out);
  }
  checkHookRegistry(roots, out);

  const parsedPkg = z
    .object({ bin: z.record(z.string(), z.unknown()).optional() })
    .safeParse(readJson(join(roots.repo, "package.json")));
  const pkg = parsedPkg.success ? parsedPkg.data : {};
  for (const [name, target] of Object.entries(pkg.bin ?? {})) {
    if (typeof target === "string") {
      checkRepoPath(
        `package.json bin ${name}`,
        join(roots.repo, target),
        roots,
        out,
      );
    }
  }
  return out;
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
    process.stderr.write(`unexpected positional argument: ${parsed._[0]}\n`);
    process.exitCode = 2;
    return;
  }
  const home = process.env.HOME ?? homedir();
  const repo = process.env.DOTFILES ?? join(home, "dotfiles");
  const os = systemOs();
  if (os === undefined) {
    process.stderr.write(`FATAL: unsupported platform: ${process.platform}\n`);
    process.exitCode = 2;
    return;
  }
  const result = findings({ home, repo, os });
  if (result.length > 0) {
    result.forEach((line) => {
      process.stdout.write(`${line}\n`);
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
      process.stderr.write(
        `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 2;
    },
  );
}
