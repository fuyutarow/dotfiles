import { $ } from "bun";
import { existsSync } from "node:fs";

// git post-commit body: warm the cocoindex index incrementally (`ccc index`) so search
// never pays the update latency. No-op when ccc is absent, when the repo has no
// .cocoindex_code/, or when the daemon is already [indexing]. Called detached by
// .githooks/post-commit.
if (!Bun.which("ccc")) {
  process.exit(0);
}

const toplevel = (await $`git rev-parse --show-toplevel`.text()).trim();
// 索引していない repo では黙って抜ける
if (!existsSync(`${toplevel}/.cocoindex_code`)) {
  process.exit(0);
}

// 走行中なら間引く
const status = await $`ccc daemon status`.quiet().nothrow();
if (status.stdout.toString().includes("[indexing]")) {
  process.exit(0);
}

await $`ccc index`.quiet().nothrow();
process.exit(0);
