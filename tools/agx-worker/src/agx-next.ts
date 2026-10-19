#!/usr/bin/env bun
import { forwardPath } from "../../shared/src/path-dispatch.ts";

process.stderr.write(
  "agx-next is deprecated; use agx-worker (agx worker) instead\n",
);
process.exitCode = await forwardPath("agx-worker", process.argv.slice(2));
