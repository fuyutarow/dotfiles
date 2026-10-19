// Consumer: flock's foreground child. Retain inherited lock descriptors until systemd
// has stopped every descendant, including processes that outlive the direct command.
import { err, fromAsyncThrowable, ok } from "neverthrow";
import { readFile } from "node:fs/promises";
import { jsonOf, z } from "../../shared/src/zod.ts";

async function main() {
  const payload = jsonOf(
    z.object({ argv: z.array(z.string()).min(1), scope: z.string() }),
  ).safeParse(process.env.AGENT_RESOURCE_SCOPE_LAUNCH);
  if (!payload.success) return err(new Error("invalid scope launch payload"));
  const { scope, argv } = payload.data;
  let cgroup: string | undefined;
  const stop = async () => {
    // Remember the cgroup before stop/collection can clear ControlGroup. systemd
    // can finish a failed stop while an uninterruptible descendant still exists.
    const inspect = Bun.spawn(
      [
        "systemctl",
        "--user",
        "show",
        scope,
        "--property=ControlGroup",
        "--value",
      ],
      { stdout: "pipe", stderr: "pipe", timeout: 5000 },
    );
    const [group, inspectionError, inspected] = await Promise.all([
      inspect.stdout.text(),
      inspect.stderr.text(),
      inspect.exited,
    ]);
    if (inspected !== 0 && !/not loaded|not found/iu.test(inspectionError))
      return err(new Error(inspectionError));
    if (group.trim() !== "") {
      if (!group.trim().startsWith("/") || group.includes(".."))
        return err(new Error("invalid scope ControlGroup"));
      cgroup = `/sys/fs/cgroup${group.trim()}/cgroup.events`;
    }
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
    if (cgroup === undefined) return ok(undefined);
    const eventsPath = cgroup;
    const events = await fromAsyncThrowable(() =>
      readFile(eventsPath, "utf8"),
    )();
    if (events.isErr())
      return z.object({ code: z.literal("ENOENT") }).safeParse(events.error)
        .success
        ? ok(undefined)
        : err(events.error);
    if (!/^populated 0$/mu.test(events.value))
      return err(new Error(`scope cgroup still populated: ${cgroup}`));
    return ok(undefined);
  };
  const stopUntilEnded = async () => {
    // A timed-out/failed stop does not prove that descendants have exited (for
    // example a task in D state). Keep flock's descriptors and retry fail closed.
    for (;;) {
      const stopped = await fromAsyncThrowable(stop)().andThen(
        (value) => value,
      );
      if (stopped.isOk()) return;
      process.stderr.write(
        `HOLD scope=${scope} cleanup unconfirmed; retaining slots: ${String(stopped.error)}\n`,
      );
      await Bun.sleep(1000);
    }
  };
  let stopping: ReturnType<typeof stopUntilEnded> | undefined;
  const interrupt = () => {
    stopping ??= stopUntilEnded();
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
  await stopping;
  // Recheck after launch exits even if an earlier interrupt found no scope yet.
  await stopUntilEnded();
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", interrupt);
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
