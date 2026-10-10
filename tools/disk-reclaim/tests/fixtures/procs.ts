import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { procFs, type ProcFs } from "../../src/lib/procs.ts";

/** On-disk /proc fixture with injected permission errors (also reliable as root). */
export function procFixture(
  root: string,
  comm = "sshd",
  denied: string[] = [],
  errorCode = "EACCES",
) {
  const procRoot = join(root, "proc");
  const base = join(procRoot, "9999999");
  mkdirSync(join(base, "fd"), { recursive: true });
  writeFileSync(join(base, "comm"), `${comm}\n`);
  writeFileSync(
    join(base, "stat"),
    `9999999 (${comm}) S ${Array.from({ length: 18 }, () => "0").join(" ")} 123\n`,
  );
  writeFileSync(
    join(base, "status"),
    "Name:\tfixture\nUid:\t1000\t1000\t1000\t1000\n",
  );
  writeFileSync(join(base, "environ"), "");
  writeFileSync(
    join(base, "maps"),
    "7f000000-7f001000 r-xp 00000000 08:01 12345 /elsewhere/libfixture.so\n",
  );
  symlinkSync(`/usr/bin/${comm}`, join(base, "exe"));
  symlinkSync("/elsewhere", join(base, "cwd"));
  symlinkSync("/elsewhere/data", join(base, "fd/3"));
  let scans = 0;
  const injectedError = (path: string): Error | null =>
    denied.includes(path.slice(base.length + 1))
      ? Object.assign(new Error(`${errorCode}: ${path}`), { code: errorCode })
      : null;
  const fs: ProcFs = {
    readText: (path) => {
      const error = injectedError(path);
      if (error !== null) return error;
      return procFs.readText(path);
    },
    readlink: (path) => {
      const error = injectedError(path);
      if (error !== null) return error;
      return procFs.readlink(path);
    },
    readdir: (path) => {
      if (path === procRoot) scans++;
      const error = injectedError(path);
      if (error !== null) return error;
      return procFs.readdir(path);
    },
    uid: (path) => procFs.uid(path),
    stat: (path) => procFs.stat(path),
  };
  return { procRoot, base, fs, scans: () => scans };
}
