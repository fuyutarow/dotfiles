// Only policy-generated overrides are legal. Probe both rules without exemptions so each
// path/rule pair must still earn its exception; no custom sync-call detector is needed.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { jsonOf, z } from "../agents/hooks/zod.ts";
import { attempt } from "../agents/hooks/attempt.ts";
import { checkBunAllowlist } from "./bun-api-allowlist.ts";
import { generatedOverrides, loadPolicy } from "./render-oxlintrc.ts";

export function checkOverrides(actual: unknown, expected: unknown): string[] {
  return JSON.stringify(actual) === JSON.stringify(expected)
    ? []
    : [
        "lint:ts-ratchet: hand-written or stale overrides forbidden; regenerate from oxlint-policy.toml",
      ];
}

export const Report = z.object({
  diagnostics: z.array(z.object({ code: z.string(), filename: z.string() })),
});
export function parseReport(stdout: string) {
  return jsonOf(Report).safeParse(stdout);
}
type ProbeResult = {
  exit: number;
  stderr: string;
  stdout: string;
};
function probeFailureDetails(
  stderr: string,
  stdout: string,
  report: ReturnType<typeof parseReport>,
): string {
  if (stderr !== "") return stderr;
  if (report.success) return stdout;
  return JSON.stringify(report.error.issues);
}
export async function probeDiagnostics(
  paths: string[],
  probe: (path: string) => Promise<ProbeResult>,
): Promise<
  | { diagnostics: z.output<typeof Report>["diagnostics"]; ok: true }
  | { message: string; ok: false }
> {
  const diagnostics: z.output<typeof Report>["diagnostics"] = [];
  for (const path of paths) {
    const { exit, stderr, stdout } = await probe(path);
    const report = parseReport(stdout);
    if (!report.success || (exit !== 0 && exit !== 1)) {
      return {
        ok: false,
        message: `lint:ts-ratchet: probe failed for ${path} (${exit}): ${probeFailureDetails(stderr, stdout, report)}`,
      };
    }
    diagnostics.push(...report.data.diagnostics);
  }
  return { diagnostics, ok: true };
}
export type IoEntry = {
  rules: ("no-sync" | "prefer-bun-api")[];
  reason: string;
};
export function staleExemptions(
  allowlist: Record<string, IoEntry>,
  diagnostics: z.output<typeof Report>["diagnostics"],
): string[] {
  const hits = new Set(diagnostics.map((d) => `${d.filename}:${d.code}`));
  return Object.entries(allowlist).flatMap(([path, entry]) =>
    entry.rules
      .filter(
        (rule) =>
          !hits.has(
            `${path}:${rule === "no-sync" ? "node(no-sync)" : "dotfiles(prefer-bun-api)"}`,
          ),
      )
      .map(
        (rule) =>
          `lint:ts-ratchet: stale exemption ${path} (${rule}); remove this rule from the allowlist`,
      ),
  );
}

async function main() {
  const root = resolve(import.meta.dir, "..");
  const loaded = await loadPolicy();
  if (!loaded.ok) return { exit: 2, messages: [loaded.error] };
  const policy = loaded.value;
  const raw = await attempt(() =>
    Bun.file(join(root, ".oxlintrc.json")).text(),
  );
  const config = raw.ok
    ? jsonOf(z.object({ overrides: z.unknown() })).safeParse(raw.value)
    : undefined;
  if (config?.success !== true)
    return { exit: 2, messages: ["lint:ts-ratchet: unreadable config"] };
  const failures = [
    ...checkOverrides(config.data.overrides, generatedOverrides(policy)),
    ...(await checkBunAllowlist(root, policy.io_allowlist)),
  ];
  if (failures.length > 0) return { exit: 1, messages: failures };
  const scratch = await mkdtemp(join(tmpdir(), "io-ratchet-"));
  const target = join(scratch, "probe.json");
  await Bun.write(
    target,
    JSON.stringify({
      plugins: ["node"],
      categories: Object.fromEntries(
        Object.keys(policy.categories).map((key) => [key, "off"]),
      ),
      jsPlugins: [
        {
          name: "dotfiles",
          specifier: join(root, "tools/oxlint-plugin-dotfiles/src/index.mjs"),
        },
      ],
      ignorePatterns: [
        ...policy.ignore.map((entry) => entry.pattern),
        ...policy.bun_api.exclude,
      ],
      rules: {
        "node/no-sync": ["error", { allowAtRootLevel: true }],
        "dotfiles/prefer-bun-api": ["error", { apis: policy.bun_api.apis }],
      },
    }),
  );
  const probe = await probeDiagnostics(
    Object.keys(policy.io_allowlist),
    async (path) => {
      const child = Bun.spawn(
        [
          process.execPath,
          join(root, "node_modules/oxlint/bin/oxlint"),
          "-c",
          target,
          "--format",
          "json",
          path,
        ],
        { cwd: root, stdout: "pipe", stderr: "pipe", timeout: 60_000 },
      );
      const [stdout, stderr, exit] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return { exit, stderr, stdout };
    },
  );
  await rm(scratch, { recursive: true, force: true });
  if (!probe.ok) return { exit: 2, messages: [probe.message] };
  const normalizedDiagnostics = probe.diagnostics.map((d) => ({
    code: d.code,
    filename: d.filename.replaceAll("\\", "/"),
  }));
  const stale = staleExemptions(policy.io_allowlist, normalizedDiagnostics);
  return {
    exit: stale.length > 0 ? 1 : 0,
    messages:
      stale.length > 0
        ? stale
        : [
            "lint:ts-ratchet: generated overrides only; every path/rule exemption is live",
          ],
  };
}
if (import.meta.main) {
  const result = await main();
  for (const message of result.messages) console.log(message);
  process.exit(result.exit);
}
