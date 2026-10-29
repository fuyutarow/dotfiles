// Missing-tool tests isolate PATH as well as the production WSL/system fallback locations.
import { mock } from "bun:test";
import * as fs from "node:fs/promises";

const realAccess = fs.access;
await mock.module("node:fs/promises", () => ({
  ...fs,
  access: (path: Parameters<typeof fs.access>[0], mode?: number) => {
    if (
      path === "/usr/lib/wsl/lib/nvidia-smi" ||
      path === "/usr/bin/nvidia-smi"
    )
      return realAccess(
        `${process.env["HOME"]}/missing-system-gpu-executable`,
        mode,
      );
    return realAccess(path, mode);
  },
}));
