#!/usr/bin/env bun
import { forwardPath } from "../../shared/src/path-dispatch.ts";
import { printVersion } from "../../shared/src/cli.ts";
import packageJson from "../package.json" with { type: "json" };

const argv = process.argv.slice(2);
process.stderr.write(
  "agx-next is deprecated; use agx-worker (agx worker) instead\n",
);
if (printVersion(packageJson, "agx-next", argv)) {
  process.exitCode = 0;
} else {
  process.exitCode = await forwardPath("agx-worker", argv);
}
