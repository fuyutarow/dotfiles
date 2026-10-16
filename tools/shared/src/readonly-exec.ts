// Internal, flag-free transport: its single JSON job is passed through the
// environment so no shell or argv parser can change the target's token order.
// FAIL CLOSED: never exec the target if kernel write denial cannot be installed.
import { dlopen, FFIType, ptr } from "bun:ffi";
import { open, realpath, stat } from "node:fs/promises";
import { jsonOf, z } from "./zod.ts";
import { READONLY_JOB_ENV } from "./readonly-command.ts";

const Job = z.object({ argv: z.array(z.string()).min(1), cwd: z.string() });
const fatal = (message: string): never => {
  process.stderr.write(
    `FATAL: read-only VCS isolation: ${message}; target was not started\n`,
  );
  process.exit(2);
};

async function main(): Promise<void> {
  const job = jsonOf(Job).safeParse(process.env[READONLY_JOB_ENV]);
  if (!job.success) return fatal("missing or invalid internal job");
  const requested = job.data.argv[0];
  if (requested === undefined) return fatal("empty command");
  const found = Bun.which(requested);
  if (found === null) return fatal(`executable unavailable: ${requested}`);
  const executable = await realpath(found);
  process.chdir(job.data.cwd);
  const argv = [executable, ...job.data.argv.slice(1)];
  let execArgv = argv;
  let libPath: string;
  if (process.platform === "linux") libPath = "libc.so.6";
  else if (process.platform === "darwin") {
    libPath = "/usr/lib/libSystem.B.dylib";
    if (Bun.which("/usr/bin/sandbox-exec") === null)
      return fatal("sandbox-exec is unavailable");
    // All paths are read-only, including shared stores reached through symlinks.
    execArgv = [
      "/usr/bin/sandbox-exec",
      "-p",
      '(version 1)(allow default)(deny file-write* (require-not (literal "/dev/null")))',
      ...argv,
    ];
  } else return fatal(`unsupported platform ${process.platform}`);

  const native = dlopen(libPath, {
    execv: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
    close: { args: [FFIType.i32], returns: FFIType.i32 },
  });
  // Prepare every exec argument BEFORE restricting the current native thread.
  // Direct execv is essential: a multithreaded runtime must not dispatch spawn
  // through a different, unrestricted thread. Exec replaces all runtime threads.
  const strings = execArgv.map((arg) => Buffer.from(`${arg}\0`));
  const executableString = strings[0];
  if (executableString === undefined) return fatal("empty exec command");
  const pointers = new BigUint64Array([
    ...strings.map((value) => BigInt(ptr(value))),
    0n,
  ]);
  if (process.platform === "linux") {
    if (process.arch !== "x64" && process.arch !== "arm64")
      return fatal(`unsupported Linux architecture ${process.arch}`);
    const linux = dlopen("libc.so.6", {
      syscall: {
        args: [FFIType.i64, FFIType.i64, FFIType.i64, FFIType.i64, FFIType.i64],
        returns: FFIType.i64,
      },
      prctl: {
        args: [FFIType.i32, FFIType.u64, FFIType.u64, FFIType.u64, FFIType.u64],
        returns: FFIType.i32,
      },
    });
    const { syscall, prctl } = linux.symbols;
    const abi = Number(syscall(444, 0, 0, 1, 0));
    if (abi < 3) return fatal(`Landlock ABI >=3 required, found ${abi}`);
    // UAPI bits: WRITE_FILE=1, REMOVE_DIR..TRUNCATE=4..14, IOCTL_DEV=15.
    // Deny filesystem mutation, not just one spelling of .jj. Git opens /dev/null
    // read/write even for reads; that character device is the sole write exception.
    const writeMask = 2 | 0x7ff0 | (abi >= 5 ? 0x8000 : 0);
    const attr = new BigUint64Array([BigInt(writeMask)]);
    const fd = Number(syscall(444, ptr(attr), attr.byteLength, 0, 0));
    if (fd < 0) return fatal("landlock_create_ruleset failed");
    if (!(await stat("/dev/null")).isCharacterDevice()) {
      native.symbols.close(fd);
      return fatal("/dev/null must be a character device");
    }
    // Linux UAPI O_PATH | O_CLOEXEC. No writable file descriptor is inherited.
    const nullFile = await open("/dev/null", 0x200000 | 0x80000);
    const nullRule = new BigUint64Array([
      BigInt(2 | (abi >= 5 ? 0x8000 : 0)),
      BigInt(nullFile.fd),
    ]);
    const added = Number(syscall(445, fd, 1, ptr(nullRule), 0));
    await nullFile.close();
    if (added !== 0) {
      native.symbols.close(fd);
      return fatal("landlock_add_rule for /dev/null failed");
    }
    if (prctl(38, 1, 0, 0, 0) !== 0) {
      native.symbols.close(fd);
      return fatal("PR_SET_NO_NEW_PRIVS failed");
    }
    const restricted = Number(syscall(446, fd, 0, 0, 0));
    native.symbols.close(fd);
    if (restricted !== 0) return fatal("landlock_restrict_self failed");
  }
  delete process.env[READONLY_JOB_ENV];
  native.symbols.execv(ptr(executableString), ptr(pointers));
  fatal(`execv failed for ${execArgv[0]}`);
}

if (import.meta.main) {
  await main().catch((error: unknown) => fatal(String(error)));
}
