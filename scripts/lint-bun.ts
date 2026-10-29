// Production Bun script floor: selected jj snapshot bytes, or local production-surface scan.
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { jsonOf, z } from "../agents/hooks/zod.ts";
import {
  jjCandidate,
  jjChanged,
  jjContext,
  jjExport,
} from "../agents/skills/wiring-mise-tasks/scripts/jj-precommit.ts";
import { lintTmpLeaks } from "./lint-tmp-leaks.ts";

const PATTERNS = [
  "scripts/*.ts",
  "android/line-notifications.ts",
  "tools/repo-retrieve/src/*.ts",
  "tools/disk-reclaim/src/*.ts",
  "tools/storage-headroom/src/*.ts",
  "tools/statusline/src/*.ts",
  "tools/shared/src/*.ts",
  "agents/claude/*.ts",
  "agents/claude/hooks/*.ts",
  "agents/hooks/*.ts",
  "agents/models/*.ts",
  "agents/skills/*/scripts/**/*.ts",
  "agents/goal-kernel/cli.ts",
  "tools/agent-resource-run/src/*.ts",
  "tools/serena-foreground/src/*.ts",
  "tools/smart-open/src/*.ts",
];
const EXCLUDE = "agents/claude/hooks/repo-retrieve.ts";
const checker = join(
  import.meta.dir,
  "../agents/skills/writing-bun-scripts/scripts/script-check.ts",
);
const Manifest = jsonOf(
  z.object({
    name: z.string().optional(),
    workspaces: z.array(z.string()).optional(),
    bin: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
    dependencies: z.record(z.string(), z.string()).optional(),
    devDependencies: z.record(z.string(), z.string()).optional(),
  }),
);
const Lock = z.object({
  workspaces: z.record(
    z.string(),
    z.object({
      name: z.string().optional(),
      dependencies: z.record(z.string(), z.string()).optional(),
      devDependencies: z.record(z.string(), z.string()).optional(),
    }),
  ),
});

function pinned(
  deps: Record<string, string> | undefined,
  lockedDeps: Record<string, string> | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(deps ?? {}).filter(
      ([name, version]) => lockedDeps?.[name] === version,
    ),
  );
}

async function sanctioned(
  root: string,
  file: string,
  specifier: string,
): Promise<boolean> {
  const path = relative(root, resolve(file));
  if (path.startsWith(`..${sep}`) || path === "..") return false;
  let directory = dirname(resolve(file));
  while (directory !== root && directory.startsWith(`${root}${sep}`)) {
    if (await Bun.file(join(directory, "package.json")).exists()) break;
    directory = dirname(directory);
  }
  if (directory === root || !directory.startsWith(`${root}${sep}`))
    return false;
  const workspace = relative(root, directory).split(sep).join("/");
  if (workspace === "tools/shared") return false;
  const suffix = specifier.slice("@dotfiles/shared/".length);
  if (!/^src\/[\w.-]+\.ts$/u.test(suffix)) return false;
  return Promise.try(async () => {
    const rootPackage = Manifest.safeParse(
      await Bun.file(join(root, "package.json")).text(),
    );
    const workspacePackage = Manifest.safeParse(
      await Bun.file(join(directory, "package.json")).text(),
    );
    const sharedPackage = Manifest.safeParse(
      await Bun.file(join(root, "tools/shared/package.json")).text(),
    );
    const lock = Lock.safeParse(
      Bun.JSONC.parse(await Bun.file(join(root, "bun.lock")).text()),
    );
    return (
      rootPackage.success &&
      workspacePackage.success &&
      sharedPackage.success &&
      lock.success &&
      (rootPackage.data.workspaces?.some((pattern) =>
        new Bun.Glob(pattern).match(workspace),
      ) ??
        false) &&
      workspacePackage.data.dependencies?.["@dotfiles/shared"] ===
        "workspace:*" &&
      sharedPackage.data.name === "@dotfiles/shared" &&
      lock.data.workspaces["tools/shared"]?.name === "@dotfiles/shared" &&
      lock.data.workspaces[workspace]?.dependencies?.["@dotfiles/shared"] ===
        "workspace:*" &&
      (await Bun.file(join(root, "tools/shared", suffix)).exists())
    );
  }).catch(() => false);
}

async function check(paths: string[], root: string): Promise<number> {
  if (paths.length === 0) {
    process.stdout.write("lint:bun: no selected production script\n");
    return 0;
  }
  const stage = await mkdtemp(join(tmpdir(), "lint-bun-workspaces-"));
  const replacements = new Map<string, string>();
  const stagedPaths = await Promise.all(
    paths.map(async (file) => {
      const absolute = resolve(file);
      let directory = dirname(absolute);
      while (directory !== root && directory.startsWith(`${root}${sep}`)) {
        if (await Bun.file(join(directory, "package.json")).exists()) break;
        directory = dirname(directory);
      }
      if (directory === root || !directory.startsWith(`${root}${sep}`))
        return file;
      return Promise.try(async () => {
        const rootManifest = Manifest.safeParse(
          await Bun.file(join(root, "package.json")).text(),
        );
        const manifestText = await Bun.file(
          join(directory, "package.json"),
        ).text();
        const manifest = Manifest.safeParse(manifestText);
        const lock = await Promise.try(async () =>
          Lock.safeParse(
            Bun.JSONC.parse(await Bun.file(join(root, "bun.lock")).text()),
          ),
        ).catch(() => null);
        const workspace = relative(root, directory).split(sep).join("/");
        if (
          !rootManifest.success ||
          !manifest.success ||
          !(
            rootManifest.data.workspaces?.some((pattern) =>
              new Bun.Glob(pattern).match(workspace),
            ) ?? false
          ) ||
          (await Bun.file(join(directory, "bun.lock")).exists())
        )
          return file;
        const locked =
          lock?.success === true ? lock.data.workspaces[workspace] : undefined;
        const stagedDirectory = join(stage, workspace);
        const stagedFile = join(stage, relative(root, absolute));
        await mkdir(dirname(stagedFile), { recursive: true });
        await copyFile(absolute, stagedFile);
        const bin = manifest.data.bin;
        let targets: string[] = [];
        if (typeof bin === "string") targets = [bin];
        else if (bin !== undefined) targets = Object.values(bin);
        for (const target of targets) {
          if (typeof target !== "string") continue;
          const original = resolve(directory, target);
          if (
            !original.startsWith(`${directory}${sep}`) ||
            !(await Bun.file(original).exists())
          )
            continue;
          const staged = join(stage, relative(root, original));
          await mkdir(dirname(staged), { recursive: true });
          await copyFile(original, staged);
        }
        await Bun.write(
          join(stagedDirectory, "package.json"),
          JSON.stringify({
            ...manifest.data,
            dependencies: pinned(
              manifest.data.dependencies,
              locked?.dependencies,
            ),
            devDependencies: pinned(
              manifest.data.devDependencies,
              locked?.devDependencies,
            ),
          }),
        );
        await Bun.write(join(stagedDirectory, "bun.lock"), "{}");
        let ancestor = dirname(absolute);
        while (ancestor.startsWith(root)) {
          if (await Bun.file(join(ancestor, ".zero-dep")).exists()) {
            const marker = join(stage, relative(root, ancestor), ".zero-dep");
            await mkdir(dirname(marker), { recursive: true });
            await copyFile(join(ancestor, ".zero-dep"), marker);
          }
          if (ancestor === root) break;
          ancestor = dirname(ancestor);
        }
        replacements.set(stagedFile, file);
        return stagedFile;
      }).catch(() => file);
    }),
  );
  const result = Bun.spawnSync(["bun", checker, ...stagedPaths], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 300_000,
  });
  let output = result.stdout.toString();
  for (const [staged, original] of replacements)
    output = output.replaceAll(staged, original);
  await rm(stage, { recursive: true, force: true });
  const lines = output.split("\n");
  let removed = 0;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]?.match(
      /^FAIL (.*): unpinned external dependency '(@dotfiles\/shared\/src\/[\w.-]+\.ts)' — BG3 ladder: builtin, pinned bunx, or graduate \(no governing package\.json\+bun\.lock declares it\)$/u,
    );
    if (
      match?.[1] !== undefined &&
      match[2] !== undefined &&
      (await sanctioned(root, match[1], match[2]))
    ) {
      lines[i] = "";
      removed++;
    }
  }
  const summary = lines.findIndex((line) =>
    /^floor: FAIL=\d+ WARN=\d+ /u.test(line),
  );
  if (removed > 0 && summary >= 0)
    lines[summary] = (lines[summary] ?? "").replace(
      /^floor: FAIL=(\d+)/u,
      (_, count) => `floor: FAIL=${Number(count) - removed}`,
    );
  process.stdout.write(
    lines.filter((line, i) => line !== "" || i === lines.length - 1).join("\n"),
  );
  process.stderr.write(result.stderr);
  if (
    result.exitCode === 1 &&
    summary >= 0 &&
    (lines[summary] ?? "").startsWith("floor: FAIL=0 ")
  )
    return 0;
  return result.exitCode ?? 2;
}

// TESTS-OWN-TMP rides on this task because `lint` and `gate:land` already run it: the Bun-script
// floor is where a test-support script's temp-dir discipline is judged (scripts/lint-tmp-leaks.ts).
function tmpLeaks(): number {
  const problems = lintTmpLeaks(resolve(import.meta.dir, ".."));
  for (const problem of problems) process.stderr.write(`FAIL: ${problem}\n`);
  return problems.length === 0 ? 0 : 1;
}

async function main(): Promise<number> {
  const leaks = tmpLeaks();
  return Math.max(leaks, await floor());
}

async function floor(): Promise<number> {
  const context = jjContext();
  if (context === undefined) {
    // A local verification run has no pre-commit candidate snapshot. Scan the declared production
    // surfaces directly; this works in jj-only checkouts and includes newly created scripts.
    const paths = await Promise.all(
      PATTERNS.map(async (pattern) => {
        const found: string[] = [];
        for await (const path of new Bun.Glob(pattern).scan({
          cwd: process.cwd(),
          onlyFiles: true,
        })) {
          if (path !== EXCLUDE && existsSync(path)) found.push(path);
        }
        return found;
      }),
    );
    return check([...new Set(paths.flat())].toSorted(), process.cwd());
  }
  const candidate = jjCandidate(context);
  const globs = PATTERNS.map((pattern) => new Bun.Glob(pattern));
  const paths = jjChanged(context).filter(
    (path) =>
      candidate.has(path) &&
      path !== EXCLUDE &&
      globs.some((glob) => glob.match(path)),
  );
  if (paths.length === 0) return check([], process.cwd());
  const tmp = mkdtempSync(join(tmpdir(), "lint-bun-jj-"));
  return Promise.try(() => {
    // Preserve dependency declarations/zero-dep markers used by the floor, with the candidate
    // version of each declaration; checker inputs themselves are always the selected REV bytes.
    const entries = new Map(
      [...candidate].filter(
        ([path]) =>
          paths.includes(path) ||
          /(^|\/)(package\.json|bun\.lock|\.zero-dep)$/u.test(path) ||
          path.startsWith("tools/shared/src/"),
      ),
    );
    jjExport(context, tmp, entries);
    return check(
      paths.map((path) => join(tmp, path)),
      tmp,
    );
  }).finally(() => {
    rmSync(tmp, { recursive: true, force: true });
  });
}

process.exitCode = await main().catch((error: unknown) => {
  process.stderr.write(
    `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  return 2;
});
