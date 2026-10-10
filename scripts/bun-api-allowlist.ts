// Exemption membership is monotone against the immutable parent policy. Initial rollout has no
// io_allowlist section: the approved no-sync adoption baseline. Thereafter new path/rule pairs fail.
import { join } from "node:path";
import { attempt } from "../agents/hooks/attempt.ts";
import { z } from "../agents/hooks/zod.ts";

const Baseline = z.object({
  io_allowlist: z
    .record(
      z.string(),
      z.object({ rules: z.array(z.string()), reason: z.string() }),
    )
    .optional(),
});

export function addedExemptions(
  current: Record<string, string>,
  baseline: Record<string, string>,
): string[] {
  return Object.keys(current).filter((path) => !Object.hasOwn(baseline, path));
}

export function addedRuleExemptions(
  current: Record<string, { rules: string[]; reason: string }>,
  baseline: Record<string, { rules: string[]; reason: string }>,
): string[] {
  return Object.entries(current).flatMap(([path, entry]) =>
    entry.rules
      .filter((rule) => baseline[path]?.rules.includes(rule) !== true)
      .map((rule) => `${path} (${rule})`),
  );
}

export async function checkBunAllowlist(
  root: string,
  allowlist: Record<string, { rules: string[]; reason: string }>,
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
    baseline.data.io_allowlist === undefined
      ? []
      : addedRuleExemptions(allowlist, baseline.data.io_allowlist);
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
