// Exemption membership is monotone against the immutable parent policy. Initial rollout has no
// bun_api section; after landing, a new path is refused even if another entry was removed.
import { join } from "node:path";
import { attempt } from "../agents/hooks/attempt.ts";
import { z } from "../agents/hooks/zod.ts";

const Baseline = z.object({
  bun_api: z.object({ allowlist: z.record(z.string(), z.string()) }).optional(),
});

export function addedExemptions(
  current: Record<string, string>,
  baseline: Record<string, string>,
): string[] {
  return Object.keys(current).filter((path) => !Object.hasOwn(baseline, path));
}

export async function checkBunAllowlist(
  root: string,
  allowlist: Record<string, string>,
): Promise<string[]> {
  const parent = Bun.spawnSync(
    [
      "jj",
      "--ignore-working-copy",
      "file",
      "show",
      "-r",
      "@-",
      "--",
      "oxlint-policy.toml",
    ],
    { cwd: root, timeout: 10_000, stdout: "pipe", stderr: "pipe" },
  );
  if (parent.exitCode !== 0)
    return [
      `Bun API ratchet: cannot read parent policy: ${parent.stderr.toString()}`,
    ];
  const decoded = await attempt(() => Bun.TOML.parse(parent.stdout.toString()));
  const baseline = decoded.ok ? Baseline.safeParse(decoded.value) : undefined;
  if (baseline?.success !== true)
    return ["Bun API ratchet: invalid parent policy"];
  const added =
    baseline.data.bun_api === undefined
      ? []
      : addedExemptions(allowlist, baseline.data.bun_api.allowlist);
  const missing = await Promise.all(
    Object.keys(allowlist).map(async (path) =>
      (await Bun.file(join(root, path)).exists()) ? undefined : path,
    ),
  );
  return [
    ...added.map((path) => `Bun API ratchet: new exemption forbidden: ${path}`),
    ...missing
      .filter((path) => path !== undefined)
      .map((path) => `Bun API ratchet: stale missing file: ${path}`),
  ];
}
