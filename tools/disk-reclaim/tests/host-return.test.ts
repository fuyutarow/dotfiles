import { expect, test } from "bun:test";
import {
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
  expect(report).toContain("Sparse-VHDX space return is lazy");
  expect(report).toContain("offline compaction via reclaim:vhdx");
});

test("host report is omitted when either measurement is unavailable", () => {
  expect(wslReturnReport(null, null)).toBeNull();
});
