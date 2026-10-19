import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { jsonOf, z } from "../../../shared/src/zod.ts";
import { exitWithError } from "./exit.ts";

export const VerifyKind = z.enum(["passed", "failed", "unrunnable", "killed"]);
export type VerifyKind = z.output<typeof VerifyKind>;

/** Shell conventions also cover signals received by a nested check process. */
export function verifyKind(exit: number, signal?: string | null): VerifyKind {
  if ((signal !== undefined && signal !== null) || (exit > 128 && exit <= 192))
    return "killed";
  if (exit === 126 || exit === 127) return "unrunnable";
  return exit === 0 ? "passed" : "failed";
}

export const VerifyResult = z
  .looseObject({
    cmd: z.string(),
    exit: z.number(),
    log_path: z.string(),
    kind: VerifyKind.optional(),
  })
  .transform((result) => ({
    ...result,
    kind: result.kind ?? verifyKind(result.exit),
  }));

/** Assemble once at the entry point, including services with only /usr/bin:/bin. */
export function verificationEnvironment(
  cwd: string,
  source: NodeJS.ProcessEnv,
  temp: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const home = source.HOME;
  const paths = (source.PATH ?? "/usr/bin:/bin").split(":");
  if (home !== undefined) {
    paths.push(
      join(home, ".local/bin"),
      join(home, ".cargo/bin"),
      join(home, ".bun/bin"),
    );
  }
  const prefixFile =
    home === undefined
      ? undefined
      : join(
          source.XDG_CONFIG_HOME ?? join(home, ".config"),
          "dotfiles/brew-prefix",
        );
  if (prefixFile !== undefined && existsSync(prefixFile)) {
    const prefix = readFileSync(prefixFile, "utf8").trim();
    if (prefix !== "") paths.push(join(prefix, "bin"), join(prefix, "sbin"));
  }
  const base = { ...source, PATH: [...new Set(paths)].join(":"), ...temp };
  const mise = Bun.which("mise", { PATH: base.PATH });
  if (mise === null) return base;
  const result = Bun.spawnSync([mise, "env", "--json"], {
    cwd,
    env: base,
    stdin: "ignore",
    timeout: 10_000,
  });
  const parsed = jsonOf(z.record(z.string(), z.string())).safeParse(
    result.stdout.toString(),
  );
  if (result.exitCode !== 0 || !parsed.success)
    return exitWithError(
      "agx: cannot assemble repository mise environment\n",
      2,
    );
  return { ...base, ...parsed.data, ...temp };
}
