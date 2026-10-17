#!/usr/bin/env bun
// argv-forwarding: agx-run, agx-ws, agx-ticket
import { fileURLToPath } from "node:url";
import { typeFlag } from "type-flag";

const argv = Bun.argv.slice(2);
const parsed = typeFlag({}, [...argv], { ignore: () => true });
if (Object.keys(parsed.unknownFlags).length > 0) {
  process.stderr.write("agx: unexpected suite flag\n");
  process.exit(2);
}
const [first, ...remaining] = argv;
const prefix = new Map([
  ["doctor", fileURLToPath(new URL("./doctor.ts", import.meta.url))],
  ["dispatch", fileURLToPath(new URL("./dispatch.ts", import.meta.url))],
  ["ws", fileURLToPath(new URL("../../agx-ws/src/ws.ts", import.meta.url))],
  [
    "ticket",
    fileURLToPath(new URL("../../agx-ticket/src/tkt.ts", import.meta.url)),
  ],
]);
const prefixed = first === undefined ? undefined : prefix.get(first);
{
  const target =
    prefixed ??
    fileURLToPath(new URL("../../agx-run/src/next/cli.ts", import.meta.url));
  const forwarded = prefixed === undefined ? argv : remaining;

  // bounded: the selected CLI owns its foreground command lifetime; the suite adds no second timeout.
  const child = Bun.spawn([process.execPath, target, ...forwarded], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exitCode = await child.exited;
}
