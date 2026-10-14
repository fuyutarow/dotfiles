// Process isolation preserves each fixture's environment and Bun's HOME cache behavior.
import { readFileSync } from "node:fs";
import { parseJson } from "../../../shared/src/narrow.ts";
import { decide } from "../../src/decision.ts";
process.stdout.write(
  `${JSON.stringify(await decide(parseJson(readFileSync(0, "utf8"))))}\n`,
);
