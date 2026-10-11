import { expect, test } from "bun:test";
import { hostProbe } from "../src/targets/host-powershell.ts";

test("Windows host plan measures allocated SizeOnDisk, not apparent file length", () => {
  expect(hostProbe).toContain("GetCompressedFileSizeW");
  expect(hostProbe).toContain("function SizeOnDisk");
  expect(hostProbe).toContain("$total += SizeOnDisk $item.FullName");
  expect(hostProbe).not.toContain("Measure-Object Length -Sum");
});
