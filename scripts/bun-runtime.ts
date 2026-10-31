import { join } from "node:path";
import { jsonOf, z } from "../tools/shared/src/zod.ts";

const Manifest = jsonOf(z.object({ engines: z.object({ bun: z.string() }) }));

// Bootstrap must run before node_modules exists. package.json owns the minimum.
export async function bunRequirement(ctx: {
  dotfiles: string;
}): Promise<string | undefined> {
  const source = await Bun.file(join(ctx.dotfiles, "package.json"))
    .text()
    .catch(() => "");
  const parsed = Manifest.safeParse(source);
  if (!parsed.success) return undefined;
  const required = parsed.data.engines.bun;
  return /^>=\d+\.\d+\.\d+$/u.test(required) ? required : undefined;
}

export async function checkBunRuntime(ctx: { dotfiles: string }) {
  const required = await bunRequirement(ctx);
  if (required === undefined)
    return {
      name: "bun-runtime",
      verdict: "FAIL" as const,
      detail: "package.json engines.bun must declare a minimum",
      fix: "repair package.json engines.bun",
    };
  if (Bun.semver.satisfies(Bun.version, required))
    return {
      name: "bun-runtime",
      verdict: "PASS" as const,
      detail: `${process.execPath} reports ${Bun.version} (required ${required})`,
    };
  return {
    name: "bun-runtime",
    verdict: "FAIL" as const,
    detail: `${process.execPath} reports ${Bun.version}; required ${required}`,
    fix: "mise install bun; brew upgrade bun",
  };
}

if (import.meta.main) {
  const finding = await checkBunRuntime({
    dotfiles: process.env["DOTFILES"] ?? join(import.meta.dir, ".."),
  });
  process.stdout.write(
    `${finding.verdict}  ${finding.name}  ${finding.detail}\n`,
  );
  if (finding.fix !== undefined)
    process.stdout.write(`                   fix: ${finding.fix}\n`);
  process.stdout.write(
    `RESULT: ${finding.verdict} · FAIL ${finding.verdict === "FAIL" ? 1 : 0} · WARN 0 · PASS ${finding.verdict === "PASS" ? 1 : 0} · SKIP 0\n`,
  );
  process.exitCode = finding.verdict === "FAIL" ? 1 : 0;
}
