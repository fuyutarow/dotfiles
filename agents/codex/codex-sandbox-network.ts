// `mise run codex:sandbox-network` — converge only the declared workspace network key in the
// Codex-owned ~/.codex/config.toml. Exit: 0 converged/no-op · 1 still drifting · 2 bad declaration.
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { drift, edit, readDeclared, readLive } from "./sandbox-network.ts";
import { attempt, errorMessage } from "../hooks/attempt.ts";

const home = process.env.HOME ?? homedir();
const dotfiles = process.env.DOTFILES ?? join(home, "dotfiles");
const declared = await readDeclared(dotfiles);
if (declared instanceof Error) {
  console.error(`codex-sandbox-network: ${declared.message}`);
  process.exit(2);
}
const before = await readLive(home);
if (before instanceof Error) {
  console.error(`codex-sandbox-network: ${before.message}`);
  process.exit(2);
}
if (drift(declared, before).length === 0) {
  console.log(
    `codex-sandbox-network: network access ${declared} — matches the declaration`,
  );
  process.exit(0);
}
const path = join(home, ".codex/config.toml");
console.log(
  `codex-sandbox-network: drift — ${drift(declared, before).join("; ")}`,
);
const write = await attempt(() => {
  mkdirSync(join(home, ".codex"), { recursive: true });
  writeFileSync(path, edit(before.contents, declared), { encoding: "utf8" });
});
if (!write.ok) {
  console.error(
    `codex-sandbox-network: cannot write ${path}: ${errorMessage(write.error)}`,
  );
  process.exit(2);
}
const after = await readLive(home);
if (after instanceof Error || drift(declared, after).length > 0) {
  console.error(`codex-sandbox-network: still drifting after write`);
  process.exit(1);
}
console.log("codex-sandbox-network: converged");
