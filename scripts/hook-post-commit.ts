import { $ } from "bun";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// git post-commit body: warm the cocoindex index incrementally AND record the freshness
// watermark, so concept/battery never refuse a fresh index. No-op when ccc is absent, when the
// repo has no .cocoindex_code/, or when the daemon is already [indexing]. Called detached by
// .githooks/post-commit.
//
// It calls `repo-retrieve index`, never bare `ccc index`. A bare `ccc index` refreshes the index
// CONTENT but writes no watermark (INDEXED_AT, beside the DB) — only `repo-retrieve index` does —
// so every commit advanced HEAD past the watermark and concept/battery answered NO_INDEX while the
// index itself was current. firedancer measured and fixed the same defect in its own hook on
// 2026-09-02; this body had kept the old form until 2026-09-22.
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

// The guaranteed entrypoint (a symlink in the linked hooks dir), not the PATH command: git
// hooks can run with a narrow PATH that lacks ~/.bun/bin.
const router = join(homedir(), ".claude", "hooks", "repo-retrieve.ts");
await $`bun ${router} index`.cwd(toplevel).quiet().nothrow();
process.exit(0);
