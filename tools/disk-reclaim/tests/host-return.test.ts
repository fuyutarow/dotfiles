import { expect, test } from "bun:test";
import {
  sampleWslReturn,
  wslReturnReport,
  type WslStorageSnapshot,
} from "../src/host-return.ts";

test("WSL report separates guest free delta from Windows host C return", () => {
  const before: WslStorageSnapshot = {
    guestFree: 20 * 1024 ** 3,
    hostCFree: 10 * 1024 ** 3,
  };
  const after: WslStorageSnapshot = {
    guestFree: 22 * 1024 ** 3,
    hostCFree: 10 * 1024 ** 3 + 512 * 1024 ** 2,
  };
  const report = wslReturnReport(before, after);
  expect(report).toContain("WSL guest free delta +2147483648 bytes");
  expect(report).toContain("Windows host C: free delta +536870912 bytes");
  expect(report).toContain("sampled for up to 10 seconds after fstrim");
});

test("host report is omitted when either measurement is unavailable", () => {
  expect(wslReturnReport(null, null)).toBeNull();
});

test("bounded host sampling reports the maximum measured C: free space", async () => {
  const snapshots: WslStorageSnapshot[] = [
    { guestFree: 21, hostCFree: 10 },
    { guestFree: 22, hostCFree: 12 },
    { guestFree: 23, hostCFree: 11 },
  ];
  let index = 0;
  const after = await sampleWslReturn(
    { guestFree: 20, hostCFree: 10 },
    {
      samples: 3,
      intervalMs: 0,
      snapshot: () => Promise.resolve(snapshots[index++] ?? null),
      sleep: () => Promise.resolve(),
    },
  );
  expect(after).toEqual({ guestFree: 23, hostCFree: 12 });
});
