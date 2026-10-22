import { expect, test } from "bun:test";
import {
  collectGpuProcessIdentity,
  type IdentityIo,
} from "../src/gpu-process-identity.ts";
import { GpuStateSchema } from "../src/gpu-samples.ts";
import { ownerState } from "./gpu-owner-fixture.ts";

function source(mode = "read"): IdentityIo {
  let brackets = 0;
  return {
    read: async (path) => {
      await Promise.resolve();
      if (path.endsWith("boot_id")) return "boot";
      const self = path.includes("/self/");
      const pid = self ? process.pid : 42;
      if (!self && path.endsWith("stat")) {
        brackets++;
        if (
          mode === "missing-before" ||
          (mode === "missing-after" && brackets === 2)
        )
          return new Promise<string>((_resolve, reject) => {
            reject(Object.assign(new Error(), { code: "ENOENT" }));
          });
      }
      if (!self && mode === "permission")
        return new Promise<string>((_resolve, reject) => {
          reject(Object.assign(new Error(), { code: "EACCES" }));
        });
      if (!self && mode === "limit") return "x".repeat(4097);
      if (path.endsWith("stat"))
        return `${pid} (a ) b) S ${Array.from({ length: 18 }, () => "0").join(" ")} ${mode === "reuse" && brackets === 2 && !self ? "200" : "100"}`;
      return `Pid:\t${pid}\nTgid:\t${pid}\nNSpid:\t${pid}\t3\n`;
    },
    readlink: (path) =>
      Promise.resolve(path.includes("/self/") ? "pid:[1]" : "pid:[2]"),
  };
}
for (const status of [
  "read",
  "missing-before",
  "missing-after",
  "permission",
  "reuse",
  "limit",
] as const) {
  test(`bounded local observation: ${status}`, async () => {
    const result = await collectGpuProcessIdentity(
      [{ pid: 42, usedMiB: null }],
      10,
      { identityIo: source(status), now: () => 11, platform: "linux" },
    );
    expect(result.driverBinding).toBe("unknown");
    expect(result.sampleAt).toBe(10);
    expect(result.processes[0]?.status).toBe(status);
    expect(result.processes[0]?.namespace).toEqual({
      status: "read",
      value: "pid:[2]",
    });
    if (status !== "read") expect(result.processes[0]?.local).toBeUndefined();
    expect(
      GpuStateSchema.safeParse({ ...ownerState(10), processIdentity: result })
        .success,
    ).toBe(true);
  });
}
test("old records remain valid and process provenance is capped", async () => {
  expect(
    GpuStateSchema.safeParse(ownerState(10)).data?.processIdentity,
  ).toBeUndefined();
  const result = await collectGpuProcessIdentity(
    Array.from({ length: 80 }, () => ({ pid: 42, usedMiB: 0 })),
    10,
    { identityIo: source(), platform: "linux" },
  );
  expect(result.processes.length).toBeLessThanOrEqual(64);
  expect(result.omittedProcesses + result.processes.length).toBe(80);
});
test("unsupported platforms and hung local reads cannot invent an identity", async () => {
  const unsupported = await collectGpuProcessIdentity(
    [{ pid: 42, usedMiB: 0 }],
    10,
    { identityIo: source(), platform: "win32" },
  );
  expect(unsupported.collector.status).toBe("unsupported");
  let calls = 0;
  const result = await collectGpuProcessIdentity(
    [{ pid: 42, usedMiB: 0 }],
    10,
    {
      identityIo: {
        read: () => {
          calls++;
          return new Promise(() => {});
        },
        readlink: source().readlink,
      },
      platform: "linux",
    },
  );
  expect(calls).toBe(1);
  expect(result.bootId.status).toBe("limit");
  expect(result.omittedProcesses).toBe(1);
});
