import { $ } from "bun";
import { consola } from "consola";

// Terminal-state hygiene regression tests (real pty via zsh/zpty; the timeout IS an
// assertion — one guarded regression is a hang).
const to = Bun.which("timeout") ?? Bun.which("gtimeout");

if (to === null) {
  consola.error(
    "[FAIL] timeout(1) is required to bound the terminal-hygiene regression suite",
  );
  process.exit(1);
}

const res =
  await $`${to} 120 zsh zsh/tests/terminal-hygiene.test.zsh`.nothrow();
process.exit(res.exitCode ?? 1);
