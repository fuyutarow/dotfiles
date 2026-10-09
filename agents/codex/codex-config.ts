// `mise run codex:config` — converge declared Codex settings into the Codex-owned config.
// Exit: 0 converged/no-op · 1 drift in check mode or still drifting · 2 bad declaration/config.
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { drift, edit, readDeclared, readLive } from "./sandbox-network.ts";
import { attempt, errorMessage } from "../hooks/attempt.ts";

const home = process.env.HOME ?? homedir();
const dotfiles = process.env.DOTFILES ?? join(home, "dotfiles");
const checkOnly = process.argv.includes("--check");
if (process.argv.slice(2).some((arg) => arg !== "--check")) {
  console.error("codex:config: usage: codex-config.ts [--check]");
  process.exit(2);
}
const declared = await readDeclared(dotfiles);
if (declared instanceof Error) {
  console.error(`codex:config: ${declared.message}`);
  process.exit(2);
}
const before = await readLive(home);
if (before instanceof Error) {
  console.error(`codex:config: ${before.message}`);
  process.exit(2);
}
const differences = drift(declared, before);
if (differences.length === 0) {
  // Quiet on convergence so deploy hooks remain silent when there is no work.
  if (checkOnly) process.exit(0);
  process.exit(0);
}
const path = join(home, ".codex/config.toml");
if (checkOnly) {
  console.error(`codex:config: drift — ${differences.join("; ")}`);
  process.exit(1);
}
const write = await attempt(() => {
  mkdirSync(join(home, ".codex"), { recursive: true });
  writeFileSync(path, edit(before.contents, declared), { encoding: "utf8" });
});
if (!write.ok) {
  console.error(
    `codex:config: cannot write ${path}: ${errorMessage(write.error)}`,
  );
  process.exit(2);
}
const after = await readLive(home);
if (after instanceof Error || drift(declared, after).length > 0) {
  console.error("codex:config: still drifting after write");
  process.exit(1);
}
console.log(`codex:config: updated ${path}`);
