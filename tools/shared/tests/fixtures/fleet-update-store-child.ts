import { mock } from "bun:test";
import * as fs from "node:fs/promises";
import { jsonOf, z } from "../../src/zod.ts";

const original = {
  open: fs.open,
  rename: fs.rename,
  rmdir: fs.rmdir,
  writeFile: fs.writeFile,
};

const InputSchema = z.strictObject({
  request: z.unknown(),
  fault: z.enum(["rename", "rmdir", "write"]).optional(),
});

const parsed = jsonOf(InputSchema).safeParse(process.argv[2] ?? "");

if (!parsed.success) {
  console.error("invalid fleet store child input");
  process.exitCode = 1;
} else {
  const failedOperation = () =>
    original.open(`${process.cwd()}/missing-fault-target`, "r").then(() => {});

  if (parsed.data.fault !== undefined) {
    const fault = parsed.data.fault;
    await mock.module("node:fs/promises", () => ({
      ...fs,
      rename: (...args: Parameters<typeof fs.rename>) =>
        fault === "rename" ? failedOperation() : original.rename(...args),
      rmdir: (...args: Parameters<typeof fs.rmdir>) =>
        fault === "rmdir" ? failedOperation() : original.rmdir(...args),
      writeFile: (...args: Parameters<typeof fs.writeFile>) =>
        fault === "write" ? failedOperation() : original.writeFile(...args),
    }));
  }

  const { updateFleetSession } =
    await import("../../src/fleet-update-store.ts");
  console.log(JSON.stringify(await updateFleetSession(parsed.data.request)));
}
