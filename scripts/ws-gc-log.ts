import { mkdir, open, readdir, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const directory = join(
  process.env["XDG_STATE_HOME"] ?? join(homedir(), ".local/state"),
  "ws-gc",
);
const pattern =
  /^ws-gc-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z-[0-9a-f-]+\.log$/u;

async function rotate(): Promise<boolean> {
  const files = (await readdir(directory))
    .filter((name) => pattern.test(name))
    .toSorted()
    .toReversed();
  for (const name of files.slice(48)) {
    const old = join(directory, name);
    const rip = Bun.which("rip");
    if (rip === null) {
      await unlink(old);
      continue;
    }
    const result = Bun.spawn([rip, old], {
      stdout: "ignore",
      stderr: "inherit",
      timeout: 30_000,
    });
    if ((await result.exited) !== 0) {
      process.stderr.write(`ws-gc-log: rip failed for ${old}\n`);
      return false;
    }
  }
  return true;
}

async function main() {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const timestamp = Temporal.Now.instant()
    .toString({ smallestUnit: "millisecond" })
    .replaceAll(":", "-");
  const path = join(directory, `ws-gc-${timestamp}-${crypto.randomUUID()}.log`);
  await using file = await open(path, "wx", 0o600);
  if (!(await rotate())) return 1;
  // bounded: systemd's TimeoutStartSec controls the whole service process group.
  const child = Bun.spawn(
    [
      "mise",
      "-C",
      join(homedir(), "dotfiles"),
      "exec",
      "--",
      "agx",
      "ws",
      "gc",
      "--all",
      "--legacy",
      "--json",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  let pending = Promise.resolve();
  const relay = async (
    stream: ReadableStream<Uint8Array>,
    target: NodeJS.WriteStream,
  ) => {
    for await (const chunk of stream) {
      pending = pending.then(() => file.writeFile(chunk));
      await pending;
      target.write(chunk);
    }
  };
  const [, , code] = await Promise.all([
    relay(child.stdout, process.stdout),
    relay(child.stderr, process.stderr),
    child.exited,
  ]);
  return code;
}

process.exitCode = await Promise.try(main).then(
  (code) => code,
  (error: unknown) => {
    process.stderr.write(`ws-gc-log: ${String(error)}\n`);
    return 1;
  },
);
