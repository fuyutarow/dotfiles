import { dlopen, FFIType } from "bun:ffi";
import { mkdir, open, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type as osType } from "node:os";

// The lock file is permanent: unlinking it would allow separate locked inodes.
// The kernel releases the advisory lock even if the sampler is killed.
// During the one-time rollout, a still-running old sampler does not use flock
// and can overlap until that old sampler exits.
const libc = dlopen(
  osType() === "Darwin" ? "/usr/lib/libSystem.B.dylib" : "libc.so.6",
  {
    flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
  },
);

export async function acquireSamplerLock(
  lock: string,
): Promise<AsyncDisposable | undefined> {
  await mkdir(dirname(lock), { recursive: true });
  const handle = await open(`${lock}.flock`, "a");
  if (libc.symbols.flock(handle.fd, 2 | 4) !== 0) {
    await handle.close();
    return undefined;
  }
  let handedOff = false;
  await using _cleanup = {
    [Symbol.asyncDispose]: async () => {
      if (!handedOff) await handle.close();
    },
  };
  // Any directory left by an interrupted owner is protected by this lock.
  await rm(lock, { recursive: true, force: true });
  await mkdir(lock);
  await writeFile(join(lock, "pid"), `${process.pid}\n`);
  handedOff = true;
  return {
    [Symbol.asyncDispose]: async () => {
      await using _handle = handle;
      await rm(lock, { recursive: true, force: true });
    },
  };
}
