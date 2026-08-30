import { $ } from "bun";

// Terminal-state hygiene regression tests (real pty via zsh/zpty; the timeout IS an
// assertion — one guarded regression is a hang).
const to = Bun.which("timeout") ?? Bun.which("gtimeout");

if (!to) {
  console.log(
    "⚠️  no timeout(1) on PATH — running unbounded; a hang regression will block instead of failing",
  );
  const res = await $`zsh zsh/tests/terminal-hygiene.test.zsh`.nothrow();
  process.exit(res.exitCode ?? 1);
}

const res =
  await $`${to} 120 zsh zsh/tests/terminal-hygiene.test.zsh`.nothrow();
process.exit(res.exitCode ?? 1);
