import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = new URL("../../../../", import.meta.url).pathname;

type CorpusEntry = Readonly<{
  path: string;
  command?: string;
  // A CLI whose OWN contract differs from Cleye's default for an unknown flag (exit 1, "Unknown
  // flag") declares it here, and the test then holds it to THAT. tex-oracle reserves exit 1 for
  // "the oracle does not hold", so its usage errors are exit 2 (see rejectPrototypeFlag there).
  unknownFlag?: Readonly<{ exit: number; message: string }>;
}>;

const CORPUS = [
  { path: "agents/goal-kernel/cli.ts" },
  { path: "agents/routing-control/agent-router.ts" },
  { path: "agents/skills/driving-codex/scripts/codex-run.ts" },
  { path: "scripts/render-oxlintrc.ts" },
  { path: "scripts/vendor-deps.ts" },
  { path: "agents/models/check-releases.ts" },
  { path: "agents/research-control/cli.ts" },
  { path: "agents/resource-control/agent-resource-run.ts" },
  { path: "agents/retrieval-control/bench-definitions.ts" },
  { path: "agents/serena-control/serena-foreground.ts" },
  { path: "agents/skills/codifying-doctrine/scripts/doctrine-check.ts" },
  { path: "agents/skills/commanding-research-fleets/scripts/check.ts" },
  {
    path: "agents/skills/compiling-latex/scripts/tex-oracle.ts",
    unknownFlag: { exit: 2, message: "unknown option" },
  },
  {
    path: "agents/skills/continuing-long-running-tasks/scripts/continuation-check.ts",
  },
  {
    path: "agents/skills/continuing-long-running-tasks/scripts/continuation-checkpoint.ts",
  },
  {
    path: "agents/skills/designing-command-line-interfaces/scripts/cli-contract-check.ts",
  },
  {
    path: "agents/skills/designing-developer-diagnostics/scripts/diagnostic-card-check.ts",
  },
  { path: "agents/skills/designing-interactions/scripts/captive-probe.ts" },
  {
    path: "agents/skills/designing-version-schemes/scripts/versioning-contract-check.ts",
  },
  { path: "agents/skills/directing-research/scripts/research-check.ts" },
  { path: "agents/skills/directing-research/scripts/research-run-check.ts" },
  { path: "agents/skills/driving-antigravity/scripts/probe-models.ts" },
  { path: "agents/skills/driving-claude/scripts/probe-models.ts" },
  { path: "agents/skills/driving-claude/scripts/run-claude.ts" },
  { path: "agents/skills/driving-codex/scripts/probe-models.ts" },
  { path: "agents/skills/driving-git/scripts/git-check.ts" },
  { path: "agents/skills/driving-grok/scripts/probe-models.ts" },
  { path: "agents/skills/driving-jev/scripts/jev.ts" },
  { path: "agents/skills/forging-novel-theses/scripts/gate-check.ts" },
  { path: "agents/skills/forging-skills/scripts/skill-check.ts" },
  {
    path: "agents/skills/forming-hypotheses-from-anomalies/scripts/hypothesis-check.ts",
  },
  {
    path: "agents/skills/governing-configuration-systems/scripts/configuration-contract-check.ts",
  },
  {
    path: "agents/skills/issuing-technical-memoranda/scripts/tm-check.ts",
  },
  {
    path: "agents/skills/governing-research-documentation/scripts/research-docs-check.ts",
  },
  {
    path: "agents/skills/operating-the-harness/scripts/gate-diagnostics-check.ts",
  },
  { path: "agents/skills/operating-the-harness/scripts/scope-check.ts" },
  { path: "agents/skills/surfacing-blind-spots/scripts/blind-spot-check.ts" },
  { path: "agents/skills/systematizing-knowledge/scripts/check-donor-set.ts" },
  { path: "agents/skills/systematizing-knowledge/scripts/check-ledger.ts" },
  { path: "agents/skills/wiring-mise-tasks/scripts/fmt-staged.ts" },
  { path: "agents/skills/wiring-mise-tasks/scripts/jj-commit.ts" },
  { path: "agents/skills/wiring-mise-tasks/scripts/mise-contract.ts" },
  { path: "agents/skills/wiring-repositories/scripts/wiring-check.ts" },
  { path: "agents/skills/writing-bun-scripts/scripts/script-check.ts" },
  { path: "agents/retrieval-control/repo-retrieve.ts", command: "literal" },
  { path: "scripts/reclaim-clean.ts" },
  { path: "scripts/reclaim-host.ts" },
  { path: "scripts/reclaim-toolchains.ts" },
  { path: "scripts/reclaim-vhdx.ts" },
  { path: "scripts/ccc-swap.ts", command: "discover" },
  { path: "scripts/edge-policy.ts" },
  { path: "scripts/install-mcp.ts" },
  { path: "scripts/doctor-remote.ts" },
  { path: "scripts/config-map.ts" },
  { path: "scripts/reclaim-run.ts" },
  { path: "scripts/link-dots.ts" },
  { path: "scripts/secrets-push.ts" },
  { path: "scripts/link-skills.ts" },
  { path: "scripts/skills-doctor.ts" },
  { path: "scripts/vendor-skill.ts" },
  { path: "scripts/wsl-audit.ts" },
  { path: "scripts/wsl-capacity-recover.ts" },
  { path: "scripts/wsl-reap.ts" },
  { path: "scripts/wsl-wake.ts" },
  { path: "scripts/wsl-winget.ts" },
] satisfies readonly CorpusEntry[];

function run(entry: CorpusEntry, argv: string[]) {
  // bounded: these framework-owned help/error paths must finish before domain work begins
  return Bun.spawnSync(
    [
      "bun",
      join(ROOT, entry.path),
      ...(entry.command !== undefined && entry.command !== ""
        ? [entry.command]
        : []),
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

async function productionCleyeImportsIn(base: string): Promise<string[]> {
  const paths: string[] = [];
  const glob = new Bun.Glob("**/*.ts");
  for await (const file of glob.scan({
    cwd: join(ROOT, base),
    onlyFiles: true,
  })) {
    const path = `${base}/${file}`;
    if (path.includes("/tests/")) continue;
    const source = await Bun.file(join(ROOT, path)).text();
    if (/\bfrom\s+["']cleye["']/u.test(source)) paths.push(path);
  }
  return paths;
}

async function productionCleyeImports(): Promise<string[]> {
  const paths: string[] = [];
  for (const base of ["agents", "cocoindex", "scripts"] as const) {
    paths.push(...(await productionCleyeImportsIn(base)));
  }
  return paths.toSorted();
}

describe("production Cleye corpus boundary", () => {
  test("the declared corpus exactly covers every production Cleye import", async () => {
    expect(await productionCleyeImports()).toEqual(
      CORPUS.map((entry) => entry.path).toSorted(),
    );
  });

  for (const entry of CORPUS) {
    test(entry.path, () => {
      const help = run(entry, ["--help"]);
      expect(help.exitCode).toBe(0);
      expect(help.stdout.toString()).toContain("Show help");

      const unknown = run(entry, ["--definitely-unknown-cleye-contract"]);
      const expected = entry.unknownFlag ?? {
        exit: 1,
        message: "Unknown flag",
      };
      expect(unknown.exitCode).toBe(expected.exit);
      expect(unknown.stderr.toString()).toContain(expected.message);

      const prototype = run(entry, ["--__proto__"]);
      expect(prototype.exitCode).toBe(2);
      expect(
        prototype.stdout.toString() + prototype.stderr.toString(),
      ).toContain("__proto__");
    });
  }
});
