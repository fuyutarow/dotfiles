// Consumer: the resource runner's scope child. Verify the effective RAM ceiling and per-run
// task accounting before executing anything; unavailable cgroup enforcement fails closed.
import { readFile } from "node:fs/promises";
import { jsonOf, z } from "../../shared/src/zod.ts";
import { err, fromAsyncThrowable, ok } from "neverthrow";

async function main() {
  const command = jsonOf(z.array(z.string()).min(1)).safeParse(
    process.env.AGENT_RESOURCE_SCOPE_COMMAND,
  );
  const receipt = jsonOf(
    z.object({ scope_unit: z.string(), host_ram_peak_bytes: z.number() }),
  ).safeParse(process.env.AGENT_RESOURCE_ADMISSION_RECEIPT);
  if (!command.success || !receipt.success)
    return err(new Error("invalid scope payload"));
  const cgroup = (await readFile("/proc/self/cgroup", "utf8"))
    .split("\n")
    .find((line) => line.startsWith("0::"))
    ?.slice(3);
  if (
    cgroup === undefined ||
    !cgroup.split("/").includes(receipt.data.scope_unit)
  )
    return err(new Error("outside admitted scope"));
  const root = `/sys/fs/cgroup${cgroup}`;
  const [max, high, swap, peak] = await Promise.all(
    ["memory.max", "memory.high", "memory.swap.max", "pids.peak"].map((name) =>
      readFile(`${root}/${name}`, "utf8"),
    ),
  );
  if (
    Number(max) !== receipt.data.host_ram_peak_bytes ||
    Number(high) !== receipt.data.host_ram_peak_bytes ||
    Number(swap) !== 0 ||
    !(Number(peak) >= 1)
  )
    return err(
      new Error("scope RAM/swap ceiling or pids accounting unavailable"),
    );
  process.stdout.write(
    `ADMIT job=${process.env.AGENT_RESOURCE_JOB_ID} scope=${receipt.data.scope_unit} ram=${max?.trim()}\n`,
  );
  // bounded: the enclosing systemd scope owns RuntimeMaxSec, MemoryMax and TasksMax.
  const child = Bun.spawn(command.data, {
    env: {
      ...process.env,
      AGENT_RESOURCE_SCOPE_COMMAND: undefined,
      AGENT_RESOURCE_SCOPE_LAUNCH: undefined,
    },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  return ok(await child.exited);
}
const result = await fromAsyncThrowable(main)().andThen((value) => value);
result.match(
  (code) => process.exit(code),
  (error) => {
    process.stderr.write(
      `DENY scope enforcement unavailable: ${String(error)}\n`,
    );
    process.exit(69);
  },
);
