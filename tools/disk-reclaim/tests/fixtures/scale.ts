import { mkdir, mkdtemp, realpath, rm, statfs } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve, sep } from "node:path";
import { err, fromAsyncThrowable, type Result } from "neverthrow";

/** Includes directories, payloads, and engine state, not just candidate count. */
export const SCALE_ENTRY_CAP = 100_000;
// Leave room for run roots, mount roots, receipts and output. Batches never coexist.
export const SCALE_BATCH_ENTRIES = 50_000;
const RESERVE_INODES = 524_288;
const under = (path: string, root: string): boolean =>
  path === root || path.startsWith(`${root}${sep}`);
const errorOf = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

async function prepareScaleRoot(
  prefix: string,
): Promise<Result<string, Error>> {
  const cache = process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache");
  if (!isAbsolute(cache))
    return err(new Error("XDG_CACHE_HOME must be absolute"));
  const prepared = await fromAsyncThrowable(async () => {
    const parent = join(cache, "reclaim-fix-scale");
    await mkdir(parent, { recursive: true });
    const actual = await realpath(parent);
    const [workspace, filesystem] = await Promise.all([
      realpath(resolve(import.meta.dir, "../../../..")),
      statfs(actual, { bigint: true }),
    ]);
    return { actual, workspace, filesystem };
  }, errorOf)();
  if (prepared.isErr()) return err(prepared.error);
  const { actual, workspace, filesystem } = prepared.value;
  if (
    under(actual, workspace) ||
    ["/tmp", "/dev/shm", "/run"].some((root) => under(actual, root))
  )
    return err(
      new Error(`scale fixtures require disk outside the workspace: ${actual}`),
    );
  if (filesystem.type === 0x01021994n || filesystem.type === 0x858458f6n)
    return err(new Error(`scale fixtures refuse tmpfs/ramfs: ${actual}`));
  if (
    filesystem.files !== 0n &&
    filesystem.ffree < BigInt(RESERVE_INODES + SCALE_ENTRY_CAP)
  )
    return err(
      new Error(
        `insufficient free inodes for a bounded scale batch: ${actual}`,
      ),
    );
  return fromAsyncThrowable(() => mkdtemp(join(actual, prefix)), errorOf)();
}

/** No TMPDIR fallback; cleanup runs after both a resolved and a rejected test body. */
export async function withScaleRoot<T>(
  prefix: string,
  run: (root: string) => Promise<T>,
): Promise<Result<T, Error>> {
  const prepared = await prepareScaleRoot(prefix);
  if (prepared.isErr()) return err(prepared.error);
  const root = prepared.value;
  const outcome = await fromAsyncThrowable(() => run(root), errorOf)();
  // Capturing failure as a value gives cleanup the same unconditional execution as finally.
  // Scale fixtures never lower directory modes. All data belongs to this run only.
  const cleanup = await fromAsyncThrowable(
    () => rm(root, { recursive: true, force: true }),
    errorOf,
  )();
  return cleanup.isErr() ? err(cleanup.error) : outcome;
}
