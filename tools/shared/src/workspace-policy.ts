// Shared by agx and the storage gate; vendored schemas work before dependency installation.
import { readdir, lstat } from "node:fs/promises";
import { join } from "node:path";
import { attempt, type Attempt } from "./attempt.ts";
import { z } from "./zod.ts";

export async function workspaceCommand(
  args: string[],
  cwd: string,
): Promise<Attempt<string>> {
  const run = await attempt(async () => {
    const child = Bun.spawn(args, {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    });
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { out, err, code };
  });
  if (!run.ok) return run;
  const { out, err, code } = run.value;
  return code === 0
    ? { ok: true, value: out }
    : {
        ok: false,
        error: `${args.join(" ")} failed (exit ${code}): ${err.trim()}`,
      };
}

export const isHeavyWorkspacePath = (
  bytes: number,
  thresholdMb: number,
): boolean => bytes > thresholdMb * 1_000_000;

export async function workspaceThresholdMb(): Promise<Attempt<number>> {
  const read = await attempt(async () =>
    Bun.TOML.parse(
      await Bun.file(
        process.env.STORAGE_HEADROOM_CONFIG ??
          join(import.meta.dir, "../../../agents/hooks/storage-headroom.toml"),
      ).text(),
    ),
  );
  if (!read.ok) return read;
  const config = z
    .object({ sparse_required_above_mb: z.number().nonnegative() })
    .safeParse(read.value);
  return config.success
    ? { ok: true, value: config.data.sparse_required_above_mb }
    : { ok: false, error: "invalid sparse_required_above_mb" };
}

/** Allocated checkout bytes, excluding the shared VCS stores. du -sk is portable. */
export async function checkoutBytes(root: string): Promise<Attempt<number>> {
  const entries = await attempt(() => readdir(root));
  if (!entries.ok) return entries;
  const paths = entries.value
    .filter((p) => p !== ".jj" && p !== ".git")
    .map((p) => join(root, p));
  if (paths.length === 0) return { ok: true, value: 0 };
  const out = await workspaceCommand(["du", "-sk", ...paths], root);
  if (!out.ok) return out;
  const bytes = out.value
    .trim()
    .split("\n")
    .reduce((total, line) => total + Number(line.split(/\s/u)[0]) * 1024, 0);
  return Number.isFinite(bytes) && bytes >= 0
    ? { ok: true, value: bytes }
    : { ok: false, error: `invalid checkout size: ${out.value}` };
}

const Declaration = z.object({
  workspace_exclude: z
    .array(
      z
        .string()
        .regex(/^[^/\\\0\n]+$/u)
        .refine((p) => p !== "." && p !== ".."),
    )
    .optional(),
});
export type WorkspacePolicy = {
  source: string;
  threshold_mb: number;
  sparse_set: string[];
  excluded: string[];
  measured: { path: string; bytes: number }[];
};

export async function workspacePolicy(
  root: string,
  thresholdMb?: number,
): Promise<Attempt<WorkspacePolicy>> {
  const threshold =
    thresholdMb === undefined
      ? await workspaceThresholdMb()
      : ({ ok: true, value: thresholdMb } as const);
  if (!threshold.ok) return threshold;
  const configFile = Bun.file(join(root, ".agx.toml"));
  const read = await attempt(async () =>
    (await configFile.exists()) ? Bun.TOML.parse(await configFile.text()) : {},
  );
  if (!read.ok) return read;
  const config = Declaration.safeParse(read.value);
  if (!config.success)
    return {
      ok: false,
      error: "workspace_exclude must be an array of top-level path names",
    };
  const declared = config.data.workspace_exclude;
  const excludes = new Set(declared ?? []);
  const tracked = await workspaceCommand(
    ["jj", "--ignore-working-copy", "file", "list"],
    root,
  );
  if (!tracked.ok) return tracked;
  const top = [
    ...new Set(
      tracked.value
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((p) => p.split("/")[0]!),
    ),
  ].toSorted();
  const measured: { path: string; bytes: number }[] = [];
  for (const path of top) {
    if (declared !== undefined && !excludes.has(path)) continue;
    const info = await attempt(() => lstat(join(root, path)));
    // A sparse source cannot establish a byte bound for an absent directory.
    if (
      !info.ok &&
      !z.object({ code: z.literal("ENOENT") }).safeParse(info.error).success
    )
      return info;
    const absentDirectory =
      !info.ok &&
      declared === undefined &&
      tracked.value.split("\n").some((file) => file.startsWith(`${path}/`));
    if (absentDirectory)
      return {
        ok: false,
        error: `cannot measure absent tracked directory ${path}; declare workspace_exclude in .agx.toml`,
      };
    if (!info.ok) continue;
    if (!info.value.isDirectory()) continue;
    const bytes = await checkoutBytes(join(root, path));
    if (!bytes.ok) return bytes;
    measured.push({ path, bytes: bytes.value });
    if (
      declared === undefined &&
      isHeavyWorkspacePath(bytes.value, threshold.value)
    )
      excludes.add(path);
  }
  return {
    ok: true,
    value: {
      source: declared === undefined ? "measured" : ".agx.toml",
      threshold_mb: threshold.value,
      sparse_set: top.filter((p) => !excludes.has(p)),
      excluded: top.filter((p) => excludes.has(p)),
      measured,
    },
  };
}
