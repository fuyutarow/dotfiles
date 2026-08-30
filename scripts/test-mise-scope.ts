import { $ } from "bun";

// The machine enforcement of INV-6 (no implicit global toolchain — see zsh/zshenv). The
// timeout is an assertion here too — the last case boots the user's whole login chain.
const to = Bun.which("timeout") ?? Bun.which("gtimeout");

if (!to) {
  console.log(
    "⚠️  no timeout(1) on PATH — running unbounded; a wedged login shell will block instead of failing",
  );
  const res = await $`zsh zsh/tests/mise-scope.test.zsh`.nothrow();
  process.exit(res.exitCode ?? 1);
}

const res = await $`${to} 120 zsh zsh/tests/mise-scope.test.zsh`.nothrow();
process.exit(res.exitCode ?? 1);
