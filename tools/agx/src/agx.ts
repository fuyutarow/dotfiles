#!/usr/bin/env bun
import { printVersion } from "../../shared/src/cli.ts";
import cliPackage from "../package.json" with { type: "json" };
import { forwardPath } from "../../shared/src/path-dispatch.ts";

const argv = process.argv.slice(2);
const tools = ["worker", "ticket", "ws"];
const transition = new Map([
  ["run", "worker"],
  ["dispatch", "worker"],
  ["check", "worker"],
  ["ls", "worker"],
  ["judge", "worker"],
  ["stats", "worker"],
  ["roster", "worker"],
  ["doctor", "worker"],
  ["jev", "worker"],
]);

async function help(): Promise<void> {
  process.stdout.write(
    `agx ${cliPackage.version}\n\nUSAGE: agx <tool> [args...]\n\nTOOLS:\n`,
  );
  for (const tool of tools) {
    const child = Bun.spawn([`agx-${tool}`, "--help"], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: 5000,
    });
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0) {
      process.stderr.write(
        err !== "" ? err : `agx: agx-${tool} --help exited ${code}\n`,
      );
      process.exitCode = code;
      return;
    }
    const description = out
      .split(/\r?\n/u)
      .slice(1)
      .find((line) => line.trim() !== "");
    process.stdout.write(`  ${tool}  ${description?.trim() ?? ""}\n`);
  }
}

async function main(): Promise<void> {
  if (printVersion(cliPackage, "agx", argv)) return;
  const [first, ...remaining] = argv;
  if (first === undefined || first === "--help" || first === "-h") {
    await help();
    return;
  }
  const legacy = transition.get(first);
  const tool = legacy ?? first;
  if (!tools.includes(tool)) {
    process.stderr.write(`agx: unknown tool '${first}'; use agx --help\n`);
    process.exitCode = 2;
    return;
  }
  if (legacy !== undefined)
    process.stderr.write(
      `agx: '${first}' is deprecated; use 'agx worker ${first}'\n`,
    );
  process.exitCode = await forwardPath(
    `agx-${tool}`,
    legacy === undefined ? remaining : argv,
  );
}
await main().catch((error: unknown) => {
  process.stderr.write(`agx: ${String(error)}\n`);
  process.exitCode = 2;
});
