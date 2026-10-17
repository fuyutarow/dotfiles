import type { GpuState } from "../src/gpu-samples.ts";
export function ownerState(at: number): GpuState {
  return {
    schema: 1,
    attemptAt: at,
    sampledAt: at,
    devices: [
      { id: 0, totalMiB: 12288, usedMiB: 3584, utilPct: 19, powerWatts: 25 },
    ],
    processes: [{ pid: 42, usedMiB: 512 }],
    samples: [
      {
        ts: at,
        nextTs: at + 60_000,
        utilPct: 19,
        memUsedGiB: 3.5,
        memTotalGiB: 12,
      },
    ],
  };
}
export const GPU_XML = `<nvidia_smi_log><gpu id="0000:01:00.0"><minor_number>0</minor_number>
<fb_memory_usage><total>12288 MiB</total><used>3584 MiB</used></fb_memory_usage>
<utilization><gpu_util>19 %</gpu_util></utilization><gpu_power_readings><power_draw>25 W</power_draw></gpu_power_readings>
<processes><process_info><pid>42</pid><used_memory>512 MiB</used_memory></process_info></processes>
</gpu></nvidia_smi_log>`;
