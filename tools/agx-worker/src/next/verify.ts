import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { jsonOf, z } from "../../../shared/src/zod.ts";
import { exitWithError } from "./exit.ts";
import {
  InspectionTimeout,
  InspectionUnavailable,
} from "../../../shared/src/agx-config.ts";

export const MISE_ENV_TIMEOUT_MS = 60_000;

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
    source: z.literal("[verify].always").optional(),
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
  onFailure?: (reason: string) => void,
  timeoutMs = MISE_ENV_TIMEOUT_MS,
): NodeJS.ProcessEnv | InspectionUnavailable {
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
  const started = performance.now();
  const result = Bun.spawnSync([mise, "env", "--json"], {
    cwd,
    env: base,
    stdin: "ignore",
    timeout: timeoutMs,
    killSignal: "SIGKILL",
  });
  if (
    result.signalCode === "SIGKILL" &&
    performance.now() - started >= timeoutMs
  )
    return new InspectionTimeout(
      "MISE_ENV_TIMEOUT_MS",
      timeoutMs,
      [mise, "env", "--json"],
      cwd,
    );
  const parsed = jsonOf(z.record(z.string(), z.string())).safeParse(
    result.stdout.toString(),
  );
  if (result.exitCode === 75)
    return new InspectionUnavailable(
      result.stderr.toString().trim() === ""
        ? `inspection unavailable; command=${JSON.stringify([mise, "env", "--json"])}; cwd=${cwd}; exit=75; no stderr`
        : result.stderr
            .toString()
            .trim()
            .replaceAll(/[\r\n]+/gu, "; "),
    );
  if (result.exitCode !== 0 || !parsed.success) {
    if (onFailure !== undefined) {
      onFailure(
        `cannot assemble repository mise environment: ${(result.stderr.toString().trim() === "" ? undefined : result.stderr.toString().trim()) ?? "mise env returned invalid JSON"}`,
      );
      return base;
    }
    return exitWithError(
      "agx: cannot assemble repository mise environment\n",
      2,
    );
  }
  return { ...base, ...parsed.data, ...temp };
}
