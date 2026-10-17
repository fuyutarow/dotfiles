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
  ["dispatch", fileURLToPath(new URL("./dispatch.ts", import.meta.url))],
  ["ws", fileURLToPath(new URL("../../agx-ws/src/ws.ts", import.meta.url))],
  [
    "ticket",
    fileURLToPath(new URL("../../agx-ticket/src/tkt.ts", import.meta.url)),
  ],
]);
const prefixed = first === undefined ? undefined : prefix.get(first);
async function runDoctor(args: string[]): Promise<number> {
  if (args.length > 0) {
    process.stderr.write("agx doctor: unexpected argument\n");
    return 2;
  }
  const targets = [
    fileURLToPath(new URL("../../agx-run/src/next/cli.ts", import.meta.url)),
    fileURLToPath(new URL("../../agx-ws/src/ws.ts", import.meta.url)),
    fileURLToPath(new URL("../../agx-ticket/src/tkt.ts", import.meta.url)),
  ];
  const results = await Promise.all(
    targets.map(async (target) => {
      const child = Bun.spawn([process.execPath, target, "doctor"], {
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, AGX_DOCTOR_QUIET: "1" },
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return { stdout, stderr, exitCode };
    }),
  );
  for (const result of results) process.stdout.write(result.stdout);
  for (const result of results) process.stderr.write(result.stderr);
  const count = results.reduce(
    (total, result) => total + result.stdout.split("\n").filter(Boolean).length,
    0,
  );
  process.stderr.write(`agx doctor: ${count} finding(s)\n`);
  return Math.max(...results.map((result) => result.exitCode));
}
if (first === "doctor") process.exitCode = await runDoctor(remaining);
else {
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
