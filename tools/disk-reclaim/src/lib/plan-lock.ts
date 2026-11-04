import {
  closeSync,
  ftruncateSync,
  close as closeCallback,
  ftruncate as ftruncateCallback,
  open as openCallback,
  writeFile as writeFileCallback,
} from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { dlopen, FFIType } from "bun:ffi";
import { fromAsyncThrowable } from "neverthrow";
import { pidAlive } from "@dotfiles/shared/src/dir-lock.ts";

const openAsync = (path: string, flags: string, mode: number) =>
  new Promise<number>((resolve, reject) => {
    openCallback(path, flags, mode, (error, fd) => {
      if (error === null) resolve(fd);
      else reject(error);
    });
  });

const ftruncateAsync = (fd: number, length: number) =>
  new Promise<void>((resolve, reject) => {
    ftruncateCallback(fd, length, (error) => {
      if (error === null) resolve();
      else reject(error);
    });
  });

const writeFileAsync = (fd: number, data: string) =>
  new Promise<void>((resolve, reject) => {
    writeFileCallback(fd, data, (error) => {
      if (error === null) resolve();
      else reject(error);
    });
  });

const closeAsync = (fd: number) =>
  new Promise<void>((resolve, reject) => {
    closeCallback(fd, (error) => {
      if (error === null) resolve();
      else reject(error);
    });
  });

// An advisory lock is released by the kernel even on SIGKILL. Keep the inode: unlinking
// it would let another process lock a different inode while the first is still in use.
export async function acquirePlanLock(
  dir: string,
): Promise<{ ok: true; release: () => void } | { ok: false; error: string }> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, "plan.lock");
  const fd = await openAsync(path, "a+", 0o600);
  const libc = dlopen(
    process.platform === "darwin" ? "/usr/lib/libSystem.B.dylib" : "libc.so.6",
    {
      flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
    },
  );
  // LOCK_EX | LOCK_NB. Retry briefly only to allow the winner to publish its PID.
  for (let attempt = 0; attempt < 50; attempt++) {
    if (libc.symbols.flock(fd, 2 | 4) === 0) {
      await ftruncateAsync(fd, 0);
      await writeFileAsync(fd, `${process.pid}\n`);
      return {
        ok: true,
        release: () => {
          // sync-ok: clear the holder PID before synchronously releasing the flock on teardown.
          ftruncateSync(fd, 0);
          // sync-ok: release must close the flock descriptor synchronously on teardown.
          closeSync(fd);
          libc.close();
        },
      };
    }
    const pidResult = await fromAsyncThrowable(() => readFile(path, "utf8"))();
    const pidText = pidResult.isOk() ? pidResult.value.trim() : null;
    if (
      pidText !== null &&
      /^[1-9]\d*$/u.test(pidText) &&
      pidAlive(Number(pidText))
    ) {
      await closeAsync(fd);
      libc.close();
      return {
        ok: false,
        error: `plan already running (pid ${pidText})`,
      };
    }
    await Bun.sleep(10);
  }
  await closeAsync(fd);
  libc.close();
  return { ok: false, error: "plan lock busy; holder pid unavailable" };
}
