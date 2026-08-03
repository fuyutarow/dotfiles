import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = new URL("../../../../", import.meta.url).pathname;

type CorpusEntry = Readonly<{
  path: string;
  command?: string;
}>;

const CORPUS = [
  { path: "agents/goal-kernel/cli.ts" },
  { path: "agents/models/check-releases.ts" },
  { path: "agents/research-control/cli.ts" },
  { path: "agents/resource-control/agent-resource-run.ts" },
  { path: "agents/serena-control/serena-foreground.ts" },
  { path: "agents/skills/arguing-research-papers/scripts/claim-check.ts" },
  {
    path: "agents/skills/continuing-long-running-tasks/scripts/continuation-check.ts",
  },
  {
    path: "agents/skills/continuing-long-running-tasks/scripts/continuation-checkpoint.ts",
  },
  { path: "agents/skills/designing-interactions/scripts/captive-probe.ts" },
  { path: "agents/skills/directing-research/scripts/research-check.ts" },
  { path: "agents/skills/directing-research/scripts/research-run-check.ts" },
  { path: "agents/skills/driving-antigravity/scripts/probe-models.ts" },
  { path: "agents/skills/driving-claude/scripts/probe-models.ts" },
  { path: "agents/skills/driving-claude/scripts/run-claude.ts" },
  { path: "agents/skills/driving-codex/scripts/probe-models.ts" },
  { path: "agents/skills/driving-grok/scripts/probe-models.ts" },
  { path: "agents/skills/forging-novel-theses/scripts/gate-check.ts" },
  { path: "agents/skills/forging-skills/scripts/skill-check.ts" },
  {
    path: "agents/skills/governing-research-documentation/scripts/research-docs-check.ts",
  },
  { path: "agents/skills/operating-the-harness/scripts/scope-check.ts" },
  { path: "agents/skills/surfacing-blind-spots/scripts/blind-spot-check.ts" },
  { path: "agents/skills/systematizing-knowledge/scripts/check-donor-set.ts" },
  { path: "agents/skills/systematizing-knowledge/scripts/check-ledger.ts" },
  { path: "agents/skills/turnstile-spin/scripts/fetch-secret.ts" },
  { path: "agents/skills/turnstile-spin/scripts/persist-skill.ts" },
  { path: "agents/skills/turnstile-spin/scripts/validate.ts" },
  { path: "agents/skills/turnstile-spin/scripts/widget-create.ts" },
  { path: "agents/skills/turnstile-spin/scripts/worker-deploy.ts" },
  { path: "agents/skills/wiring-mise-tasks/scripts/mise-contract.ts" },
  { path: "agents/skills/writing-bun-scripts/scripts/script-check.ts" },
  { path: "cocoindex/repo-search.ts", command: "literal" },
  { path: "scripts/cache-clean.ts" },
  { path: "scripts/ccc-swap.ts", command: "discover" },
  { path: "scripts/install-mcp.ts" },
  { path: "scripts/link-skills.ts" },
] satisfies readonly CorpusEntry[];

function run(entry: CorpusEntry, argv: string[]) {
  // bounded: these framework-owned help/error paths must finish before domain work begins
  return Bun.spawnSync(
    [
      "bun",
      join(ROOT, entry.path),
      ...(entry.command ? [entry.command] : []),
      ...argv,
    ],
    {
      cwd: ROOT,
      env: { ...process.env, NO_COLOR: "1" },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 5_000,
      killSignal: "SIGKILL",
      maxBuffer: 1024 * 1024,
    },
  );
}

async function productionCleyeImports(): Promise<string[]> {
  const paths: string[] = [];
  for (const base of ["agents", "cocoindex", "scripts"] as const) {
    const glob = new Bun.Glob("**/*.ts");
    for await (const file of glob.scan({
      cwd: join(ROOT, base),
      onlyFiles: true,
    })) {
      const path = `${base}/${file}`;
      if (path.includes("/tests/")) continue;
      const source = await Bun.file(join(ROOT, path)).text();
      if (/\bfrom\s+["']cleye["']/.test(source)) paths.push(path);
    }
  }
  return paths.sort();
}

describe("production Cleye corpus boundary", () => {
  test("the declared corpus exactly covers every production Cleye import", async () => {
    expect(await productionCleyeImports()).toEqual(
      CORPUS.map((entry) => entry.path).sort(),
    );
  });

  for (const entry of CORPUS) {
    test(entry.path, () => {
      const help = run(entry, ["--help"]);
      expect(help.exitCode).toBe(0);
      expect(help.stdout.toString()).toContain("Show help");

      const unknown = run(entry, ["--definitely-unknown-cleye-contract"]);
      expect(unknown.exitCode).toBe(1);
      expect(unknown.stderr.toString()).toContain("Unknown flag");

      const prototype = run(entry, ["--__proto__"]);
      expect(prototype.exitCode).toBe(2);
      expect(
        prototype.stdout.toString() + prototype.stderr.toString(),
      ).toContain("__proto__");
    });
  }
});
