// Production Bun script floor: selected jj snapshot bytes, or local production-surface scan.
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  jjCandidate,
  jjChanged,
  jjContext,
  jjExport,
} from "../agents/skills/wiring-mise-tasks/scripts/jj-precommit.ts";

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
  "tools/agx/src/*.ts",
  "tools/agx/src/workers/*.ts",
  "tools/serena-foreground/src/*.ts",
  "tools/smart-open/src/*.ts",
];
const EXCLUDE = "agents/claude/hooks/repo-retrieve.ts";
const checker = join(
  import.meta.dir,
  "../agents/skills/writing-bun-scripts/scripts/script-check.ts",
);

function check(paths: string[]): number {
  if (paths.length === 0) {
    process.stdout.write("lint:bun: no selected production script\n");
    return 0;
  }
  return (
    Bun.spawnSync(["bun", checker, ...paths], {
      stdout: "inherit",
      stderr: "inherit",
      timeout: 300_000,
    }).exitCode ?? 2
  );
}

async function main(): Promise<number> {
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
    return check([...new Set(paths.flat())].toSorted());
  }
  const candidate = jjCandidate(context);
  const globs = PATTERNS.map((pattern) => new Bun.Glob(pattern));
  const paths = jjChanged(context).filter(
    (path) =>
      candidate.has(path) &&
      path !== EXCLUDE &&
      globs.some((glob) => glob.match(path)),
  );
  if (paths.length === 0) return check([]);
  const tmp = mkdtempSync(join(tmpdir(), "lint-bun-jj-"));
  return Promise.try(() => {
    // Preserve dependency declarations/zero-dep markers used by the floor, with the candidate
    // version of each declaration; checker inputs themselves are always the selected REV bytes.
    const entries = new Map(
      [...candidate].filter(
        ([path]) =>
          paths.includes(path) ||
          /(^|\/)(package\.json|bun\.lock|\.zero-dep)$/u.test(path),
      ),
    );
    jjExport(context, tmp, entries);
    return check(paths.map((path) => join(tmp, path)));
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
