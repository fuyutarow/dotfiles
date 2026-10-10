#!/usr/bin/env bun
// Executable fixture: stateful enable/start behavior and command log, no real user manager.
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { z, jsonOf } from "../../agents/hooks/zod.ts";
const home = process.env.HOME ?? "";
const stateFile = join(home, "state.json");
const parsed = jsonOf(
  z.object({ enabled: z.string(), active: z.string() }),
).safeParse(readFileSync(stateFile, "utf8"));
if (!parsed.success) process.exit(2);
const state = parsed.data;
const args = process.argv.slice(2);
appendFileSync(join(home, "calls"), `${args.join(" ")}\n`);
const verb = args[1];
if (verb === process.env.FAIL_SYSTEMCTL) process.exit(9);
if (verb === "is-enabled") {
  process.stdout.write(`${state.enabled}\n`);
  process.exit(
    state.enabled === "enabled" || state.enabled === "alias" ? 0 : 1,
  );
}
if (verb === "is-active") {
  process.stdout.write(`${state.active}\n`);
  process.exit(state.active === "active" ? 0 : 3);
}
if (verb === "enable") {
  const dir = join(home, ".config/systemd/user/default.target.wants");
  mkdirSync(dir, { recursive: true });
  const edge = join(dir, "ccc-daemon.service");
  if (!existsSync(edge)) symlinkSync("../ccc-daemon.service", edge);
  state.enabled = "enabled";
}
if (verb === "start") state.active = "active";
writeFileSync(stateFile, JSON.stringify(state));
