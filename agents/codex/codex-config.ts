// `mise run codex:config` — converge declared Codex settings into the Codex-owned config.
// Exit: 0 converged/no-op · 1 drift in check mode or still drifting · 2 bad declaration/config.
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { drift, edit, readDeclared, readLive } from "./sandbox-network.ts";
import { attempt, errorMessage } from "../hooks/attempt.ts";
import { configHome } from "./runtime.ts";

const dotfiles =
  process.env["DOTFILES"] ?? join(process.env["HOME"] ?? homedir(), "dotfiles");
const checkOnly = process.argv.includes("--check");
if (process.argv.slice(2).some((arg) => arg !== "--check")) {
  process.stderr.write("codex:config: usage: codex-config.ts [--check]\n");
  process.exit(2);
}
const declared = await readDeclared(dotfiles);
if (declared instanceof Error) {
  process.stderr.write(`codex:config: ${declared.message}\n`);
  process.exit(2);
}
const resolvedHome = await attempt(() => configHome(dotfiles));
if (!resolvedHome.ok) {
  process.stderr.write(`codex:config: ${errorMessage(resolvedHome.error)}\n`);
  process.exit(2);
}
const home = resolvedHome.value;
const before = await readLive(home);
if (before instanceof Error) {
  process.stderr.write(`codex:config: ${before.message}\n`);
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
  process.stderr.write(`codex:config: drift — ${differences.join("; ")}\n`);
  process.exit(1);
}
const write = await attempt(async () => {
  await mkdir(join(home, ".codex"), { recursive: true });
  await Bun.write(path, edit(before.contents, declared));
});
if (!write.ok) {
  process.stderr.write(
    `codex:config: cannot write ${path}: ${errorMessage(write.error)}\n`,
  );
  process.exit(2);
}
const after = await readLive(home);
if (after instanceof Error || drift(declared, after).length > 0) {
  process.stderr.write("codex:config: still drifting after write\n");
  process.exit(1);
}
process.stdout.write(`codex:config: updated ${path}\n`);
