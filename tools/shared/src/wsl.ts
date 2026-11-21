// Is this machine a WSL distribution? One answer for every caller.
//
// The kernel name alone is not the answer. A container started by WSL's own runtime (wslc,
// Docker Desktop's WSL backend) runs on the same kernel, "…-microsoft-standard-WSL2", yet is
// plain Linux: no Windows interop, no /mnt/c, no systemd user services. Measured 2026-11-22 in
// `wslc run ubuntu:24.04`: the kernel name matched and /run/WSL was absent; in the distribution
// that hosts it, /run/WSL exists. WSL's init creates that directory only in a distribution.
import { existsSync } from "node:fs";
import { release } from "node:os";

export function isWslDistro(
  kernel = release(),
  hasWslRuntime = existsSync("/run/WSL"),
): boolean {
  return /microsoft/iu.test(kernel) && hasWslRuntime;
}
