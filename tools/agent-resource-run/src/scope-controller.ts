// Consumer: flock's foreground child. Retain inherited lock descriptors until systemd
// has stopped every descendant, including processes that outlive the direct command.
import { err, fromAsyncThrowable, ok } from "neverthrow";
import { jsonOf, z } from "../../shared/src/zod.ts";

async function main() {
  const payload = jsonOf(
    z.object({ argv: z.array(z.string()).min(1), scope: z.string() }),
  ).safeParse(process.env.AGENT_RESOURCE_SCOPE_LAUNCH);
  if (!payload.success) return err(new Error("invalid scope launch payload"));
  const { scope, argv } = payload.data;
  const stop = async () => {
    const child = Bun.spawn(["systemctl", "--user", "stop", scope], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 45000,
    });
    const [, stderr, code] = await Promise.all([
      child.stdout.text(),
      child.stderr.text(),
      child.exited,
    ]);
    if (code !== 0 && !/not loaded|not found/iu.test(stderr))
      return err(new Error(stderr));
    return ok(undefined);
  };
  let stopping: ReturnType<typeof stop> | undefined;
  const interrupt = () => {
    stopping ??= stop();
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  const result = await fromAsyncThrowable(async () => {
    // bounded: systemd owns the command's RuntimeMaxSec and cleanup timeout.
    const child = Bun.spawn(argv, {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    return child.exited;
  })();
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", interrupt);
  const interrupted = await stopping;
  const stopped = await stop();
  if (interrupted?.isErr() === true) return err(interrupted.error);
  if (stopped.isErr()) return err(stopped.error);
  return result;
}
const result = await fromAsyncThrowable(main)().andThen((value) => value);
result.match(
  (code) => process.exit(code),
  (error) => {
    process.stderr.write(`ERROR scope cleanup: ${String(error)}\n`);
    process.exit(70);
  },
);
