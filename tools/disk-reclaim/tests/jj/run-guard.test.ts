import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempRoot } from "../fixtures/temp.ts";
import { runProtection } from "../../src/jj/run-guard.ts";

const originalPath = process.env.PATH;
let root: string | undefined;

afterEach(() => {
  process.env.PATH = originalPath;
  if (root !== undefined) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

test("full agx inventory protects old unjudged runs and incomplete responses", async () => {
  root = tempRoot("run-guard-");
  const store = join(root, "store");
  const path = join(root, "old-run");
  const bin = join(root, "bin");
  mkdirSync(store);
  mkdirSync(path);
  mkdirSync(bin);
  const runsPath = join(root, "runs.json");
  const modePath = join(root, "agx-mode");
  writeFileSync(modePath, "window");
  writeFileSync(
    join(bin, "agx"),
    `#!${process.execPath}\nconst mode = await Bun.file(${JSON.stringify(modePath)}).text();\nif (mode === "fail") process.exit(1);\nif (mode === "omit") { process.stdout.write(JSON.stringify([{ id: "incomplete", workspace: ${JSON.stringify(path)}, judgment: null }])); process.exit(0); }\nconst runs = JSON.parse(await Bun.file(${JSON.stringify(runsPath)}).text());\nprocess.stdout.write(JSON.stringify(process.argv.includes("--all") ? runs : runs.slice(0, 30)));\n`,
  );
  chmodSync(join(bin, "agx"), 0o755);
  process.env.PATH = `${bin}:${originalPath}`;

  const runs: Record<string, unknown>[] = Array.from(
    { length: 31 },
    (_, index) => ({
      id: `filler-${index}`,
      state: "ended",
      workspace: null,
      judgment: { decision: "reject" },
    }),
  );
  runs[0] = {
    id: "continuation",
    state: "ended",
    workspace: null,
    continues: "oldest-unjudged",
    judgment: null,
  };
  runs[30] = {
    id: "oldest-unjudged",
    state: "ended",
    workspace: path,
    judgment: null,
  };
  writeFileSync(runsPath, JSON.stringify(runs));

  expect(await runProtection(store, path)).toContain("unjudged");

  writeFileSync(modePath, "omit");
  expect(await runProtection(store, path)).toContain("run inventory");

  writeFileSync(modePath, "fail");
  expect(await runProtection(store, path)).toContain("run inventory");
});
