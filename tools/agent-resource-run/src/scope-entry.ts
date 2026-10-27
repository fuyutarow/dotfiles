// Consumer: the resource runner's scope child. Verify the effective RAM ceiling and per-run
// task accounting before executing anything; unavailable cgroup enforcement fails closed.
import { readFile } from "node:fs/promises";
import { jsonOf, z } from "../../shared/src/zod.ts";
import { err, fromAsyncThrowable, ok } from "neverthrow";
import { gpuAdmissionRefusal } from "./agent-resource-run.ts";
import {
  effectiveMemoryLimitsMatch,
  kernelPageSizeBytes,
} from "./lib/cgroup-memory-limits.ts";

import {
  DecisionRecord,
  withDecision,
  saveDecision,
} from "./lib/decision-record.ts";
class HealthRefusal extends Error {}
const inheritedId = process.env.AGENT_RESOURCE_DECISION_ID;
const decisionId =
  inheritedId !== undefined && /^[a-f0-9-]{36}$/u.test(inheritedId)
    ? inheritedId
    : undefined;
const record = new DecisionRecord(decisionId);
record.stage = "scope-entry";
record.reason = "scope-entry";

async function main() {
  const command = jsonOf(z.array(z.string()).min(1)).safeParse(
    process.env.AGENT_RESOURCE_SCOPE_COMMAND,
  );
  const invocationId = z
    .string()
    .regex(/^[a-f0-9]{32}$/u)
    .safeParse(process.env.INVOCATION_ID);
  const receipt = jsonOf(
    z.object({
      scope_unit: z.string(),
      reservation_id: z.string(),
      host_ram_peak_bytes: z.number(),
      memory_high_bytes: z.number(),
      gpu_safety_mib: z.number().optional(),
      admission_wait_s: z
        .number()
        .int()
        .min(0)
        .max(Number.MAX_SAFE_INTEGER)
        .optional(),
      device: z.object({
        kind: z.string(),
        gpu_id: z.number().optional(),
        vram_peak_bytes: z.number().optional(),
      }),
    }),
  ).safeParse(process.env.AGENT_RESOURCE_ADMISSION_RECEIPT);
  record.invocation_id = invocationId.success ? invocationId.data : null;
  if (receipt.success) record.systemd_unit = receipt.data.scope_unit;
  await saveDecision(record.snapshot());
  if (!command.success || !receipt.success) {
    record.reason = "scope-enforcement-unavailable";
    return err(new Error("invalid scope payload"));
  }
  if (!invocationId.success) {
    record.reason = "invocation-id-unavailable";
    return err(new Error("systemd invocation ID unavailable"));
  }
  const cgroup = (await readFile("/proc/self/cgroup", "utf8"))
    .split("\n")
    .find((line) => line.startsWith("0::"))
    ?.slice(3);
  if (
    cgroup === undefined ||
    !cgroup.split("/").includes(receipt.data.scope_unit)
  )
    return err(new Error("outside admitted scope"));
  if (receipt.data.device.kind === "gpu") {
    const { gpu_id, vram_peak_bytes } = receipt.data.device;
    const safetyMiB = receipt.data.gpu_safety_mib;
    if (
      gpu_id === undefined ||
      vram_peak_bytes === undefined ||
      safetyMiB === undefined
    )
      return err(new Error("incomplete GPU admission receipt"));
    // Proc suspicion is advisory; recheck the owner incident before launch.
    const refusal = await gpuAdmissionRefusal(
      { gpu_id, vram_peak_bytes },
      safetyMiB,
      {
        currentScope: receipt.data.scope_unit,
        currentReservationId: receipt.data.reservation_id,
        admissionWaitS: receipt.data.admission_wait_s ?? 0,
        cccHandoffHeld: true,
      },
    );
    if (refusal !== undefined) {
      process.stdout.write(`DENY ${refusal}\n`);
      record.reason = "gpu-health-refused";
      return err(new HealthRefusal(refusal));
    }
  }
  const root = `/sys/fs/cgroup${cgroup}`;
  const [memoryMax, memoryHigh, memorySwapMax, pidsPeak, smaps] =
    await Promise.all([
      readFile(`${root}/memory.max`, "utf8"),
      readFile(`${root}/memory.high`, "utf8"),
      readFile(`${root}/memory.swap.max`, "utf8"),
      readFile(`${root}/pids.peak`, "utf8"),
      readFile("/proc/self/smaps", "utf8"),
    ]);
  const pageSizeBytes = kernelPageSizeBytes(smaps);
  if (
    pageSizeBytes === undefined ||
    !effectiveMemoryLimitsMatch(
      { memoryMax, memoryHigh, memorySwapMax, pidsPeak },
      {
        memoryMaxBytes: receipt.data.host_ram_peak_bytes,
        memoryHighBytes: receipt.data.memory_high_bytes,
      },
      pageSizeBytes,
    )
  )
    return err(
      new Error("scope RAM/swap ceiling or pids accounting unavailable"),
    );
  process.stdout.write(
    `ADMIT job=${process.env.AGENT_RESOURCE_JOB_ID} scope=${receipt.data.scope_unit} ram=${memoryMax.trim()}\n`,
  );
  // bounded: the enclosing systemd scope owns RuntimeMaxSec, MemoryMax and TasksMax.
  const child = Bun.spawn(command.data, {
    env: {
      ...process.env,
      AGENT_RESOURCE_DECISION_ID: undefined,
      AGENT_RESOURCE_SCOPE_COMMAND: undefined,
      AGENT_RESOURCE_SCOPE_LAUNCH: undefined,
    },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  record.launched = true;
  record.stage = "command";
  record.reason = "command-running";
  await saveDecision(record.snapshot());
  const code = await child.exited;
  record.reason = `command-exit-${code}`;
  record.final_status = code;
  await saveDecision(record.snapshot());
  return ok(code);
}
const result = await withDecision(record, () =>
  fromAsyncThrowable(main)().andThen((value) => value),
);
if (result.isErr() && record.reason === "scope-entry")
  record.reason = "scope-enforcement-unavailable";
record.final_status = result.isOk() ? result.value : 69;
await saveDecision(record.snapshot());
result.match(
  (code) => process.exit(code),
  (error) => {
    process.stderr.write(
      `DENY ${error instanceof HealthRefusal ? "scope health refusal" : "scope enforcement unavailable"}: ${String(error)}\n`,
    );
    process.exit(69);
  },
);
