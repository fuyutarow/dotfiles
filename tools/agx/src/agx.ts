#!/usr/bin/env bun
import { printVersion } from "../../shared/src/cli.ts";
import cliPackage from "../package.json" with { type: "json" };
import { forwardPath } from "../../shared/src/path-dispatch.ts";

const argv = process.argv.slice(2);
const tools = ["worker", "ticket", "ws", "status", "msg"];

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
  process.stdout.write(
    "\nOPTIONS:\n  -h, --help  Show help\n  -V, --version  Show version\n",
  );
}

async function main(): Promise<void> {
  if (printVersion(cliPackage, "agx", argv)) return;
  const [first, ...remaining] = argv;
  if (first === undefined || first === "--help" || first === "-h") {
    await help();
    return;
  }
  if (!tools.includes(first)) {
    process.stderr.write(
      `agx: unknown tool '${first}'; expected worker, ticket, ws, status, msg\n`,
    );
    process.exitCode = 2;
    return;
  }
  process.exitCode = await forwardPath(`agx-${first}`, remaining);
}
await main().catch((error: unknown) => {
  process.stderr.write(`agx: ${String(error)}\n`);
  process.exitCode = 2;
});
