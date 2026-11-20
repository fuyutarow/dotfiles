import {
  access,
  lstat,
  readFile,
  readdir,
  readlink,
  stat,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Result } from "../../../shared/src/result.ts";
import type { ActionResult } from "../model.ts";
import type { Context, Target } from "./index.ts";
import { z } from "@dotfiles/shared/src/zod.ts";

type CommandResult = { code: number; out: string; err: string };
type CommandRunner = (argv: string[]) => Promise<CommandResult>;
type MiseConfigsOptions = {
  stateDir?: () => string;
  misePath?: () => string | null;
  run?: CommandRunner;
};

const defaultStateDir = (): string =>
  resolve(
    process.env["MISE_STATE_DIR"] ??
      join(
        process.env["XDG_STATE_HOME"] ?? join(homedir(), ".local/state"),
        "mise",
      ),
  );
const defaultRun: CommandRunner = async (argv) => {
  const child = Bun.spawn(argv, {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
  });
  const [code, out, err] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return {
    code,
    out,
    err,
  };
};

const MissingFile = z.object({ code: z.literal("ENOENT") });
const isMissing = (error: unknown): boolean =>
  MissingFile.safeParse(error).success;

const readRecordedPath = async (entry: string): Promise<string | undefined> => {
  const metadata = await Result.tryPromise({
    try: () => lstat(entry),
    catch: (e: unknown) => e,
  });
  if (metadata.isErr()) return undefined;
  if (metadata.value.isSymbolicLink())
    return (
      await Result.tryPromise({
        try: () => readlink(entry),
        catch: (e: unknown) => e,
      })
    ).unwrapOr(undefined);
  if (process.platform === "win32")
    return (
      await Result.tryPromise({
        try: () => readFile(entry, "utf8"),
        catch: (e: unknown) => e,
      })
    )
      .map((value) => value.trim())
      .unwrapOr(undefined);
  return undefined;
};

export async function deadEntries(stateDir: string): Promise<string[]> {
  const dead: string[] = [];
  for (const [directory, requiresFile] of [
    ["tracked-configs", true],
    ["trusted-configs", false],
    ["ignored-configs", false],
  ] as const) {
    const path = join(stateDir, directory);
    const present = await Result.tryPromise({
      try: () => access(path),
      catch: (e: unknown) => e,
    });
    if (present.isErr() && isMissing(present.error)) continue;
    const listed = await Result.tryPromise({
      try: () => readdir(path),
      catch: (e: unknown) => e,
    });
    if (listed.isErr()) continue;
    dead.push(...(await deadInDirectory(path, listed.value, requiresFile)));
  }
  return dead;
}

async function deadInDirectory(
  path: string,
  names: string[],
  requiresFile: boolean,
): Promise<string[]> {
  const dead: string[] = [];
  for (const name of names) {
    if (await isDeadRecord(path, name, requiresFile))
      dead.push(join(path, name));
  }
  return dead;
}

async function isDeadRecord(
  directory: string,
  name: string,
  requiresFile: boolean,
): Promise<boolean> {
  if (!requiresFile && /\.(hash|monorepo)$/u.test(name)) return false;
  const record = join(directory, name);
  const target = await readRecordedPath(record);
  if (target === undefined) return false;
  const statResult = await Result.tryPromise({
    try: () => stat(resolve(dirname(record), target)),
    catch: (e: unknown) => e,
  });
  if (statResult.isErr()) return isMissing(statResult.error);
  return requiresFile && !statResult.value.isFile();
}

export const createMiseConfigsTarget = (options: MiseConfigsOptions = {}) => {
  const stateDir = options.stateDir ?? defaultStateDir;
  const misePath = options.misePath ?? (() => Bun.which("mise"));
  const run = options.run ?? defaultRun;
  return {
    name: "mise-configs",
    tier: "blind",
    available: () => {
      const path = misePath();
      return {
        available: path !== null,
        skip_reason: path === null ? "mise binary is unavailable" : null,
      };
    },
    plan: async (ctx: Context) => {
      const count = (await deadEntries(stateDir())).length;
      ctx.log(`mise-configs: found ${count} dead config records`);
      return count === 0
        ? []
        : [
            {
              id: "mise-configs:prune",
              path: null,
              verdict: "RECLAIM",
              reason: `${count} dead tracked, trusted, or ignored config records`,
              checks: [
                {
                  name: "mise is available",
                  ok: misePath() !== null,
                  detail: "target availability is rechecked before the action",
                },
              ],
              bytes: null,
              bytes_kind: "estimate",
              action: { kind: "command", argv: ["mise", "prune", "--configs"] },
              result: null,
            },
          ];
    },
    act: async (
      _candidate: Parameters<Target["act"]>[0],
      _ctx: Context,
    ): Promise<ActionResult> => {
      const before = (await deadEntries(stateDir())).length;
      if (before === 0)
        return {
          ok: true,
          bytes_freed: null,
          error: null,
          mise_configs_before: 0,
          mise_configs_after: 0,
        };
      const binary = misePath();
      if (binary === null)
        return {
          ok: false,
          bytes_freed: null,
          error: "mise binary is unavailable",
          mise_configs_before: before,
          mise_configs_after: before,
        };
      const result = await run([binary, "prune", "--configs"]);
      const after = (await deadEntries(stateDir())).length;
      return {
        ok: result.code === 0,
        bytes_freed: null,
        error: result.code === 0 ? null : commandError(result),
        mise_configs_before: before,
        mise_configs_after: after,
      };
    },
  } satisfies Target;
};

const commandError = (result: CommandResult): string => {
  if (result.err.length > 0) return result.err;
  return `mise prune --configs exited ${result.code}`;
};

export const miseConfigs = createMiseConfigsTarget();
