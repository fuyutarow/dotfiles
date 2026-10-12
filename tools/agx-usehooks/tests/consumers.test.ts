import { afterEach, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  checkConsumer,
  consumerVerdict,
  type Consumer,
} from "../src/check-consumers.ts";

const temporary: string[] = [];
const tsgo = resolve(
  import.meta.dir,
  "../../../node_modules/@typescript/native-preview/bin/tsgo",
);
afterEach(() => {
  for (const path of temporary.splice(0))
    rmSync(path, { recursive: true, force: true });
});
test("hook errors fail; outside errors report; compiler/config failures fail", () => {
  expect(
    consumerVerdict(
      ".agents/hooks/lanes.ts(106,3): error TS2339: old shape",
      2,
      ".agents/hooks",
    ),
  ).toBe("fail");
  expect(
    consumerVerdict(
      "/home/fuyu/Workspace/firedancer/.agents/hooks/lanes.ts(107,3): error TS2367: unknown",
      2,
      ".agents/hooks",
    ),
  ).toBe("fail");
  expect(
    consumerVerdict(
      "src/model.ts(1,2): error TS2322: other",
      2,
      ".agents/hooks",
    ),
  ).toBe("reported");
  expect(
    consumerVerdict("error TS5058: missing project", 1, ".agents/hooks"),
  ).toBe("fail");
  expect(consumerVerdict("compiler died", 1, ".agents/hooks")).toBe("fail");
  expect(consumerVerdict("", 0, ".agents/hooks")).toBe("pass");
});

test("real TypeScript checking sees workspace types through a stale consumer link without writing it", async () => {
  const root = mkdtempSync(join(tmpdir(), "usehooks-consumer-"));
  temporary.push(root);
  const workspace = join(root, "workspace");
  const installed = join(root, "installed");
  const consumerRoot = join(root, "consumer");
  const hooks = join(consumerRoot, ".agents/hooks");
  for (const path of [
    join(workspace, "src"),
    installed,
    hooks,
    join(consumerRoot, "node_modules"),
  ])
    mkdirSync(path, { recursive: true });
  const manifest = JSON.stringify({
    name: "agx-usehooks",
    type: "module",
    exports: "./index.ts",
  });
  for (const path of [workspace, installed])
    writeFileSync(join(path, "package.json"), manifest);
  writeFileSync(
    join(workspace, "src/index.ts"),
    "export declare function gpu(): {nowPct: number} | {unavailable: string};\n",
  );
  writeFileSync(
    join(installed, "index.ts"),
    "export declare function gpu(): {utilPct: number} | 'unknown';\n",
  );
  const link = join(consumerRoot, "node_modules/agx-usehooks");
  symlinkSync(installed, link);
  const config = JSON.stringify({
    compilerOptions: {
      types: [],
      strict: true,
      noEmit: true,
      module: "ESNext",
      moduleResolution: "bundler",
      allowImportingTsExtensions: true,
    },
    include: [".agents/hooks/**/*.ts", "src/**/*.ts"],
  });
  writeFileSync(join(consumerRoot, "tsconfig.json"), config);
  const hook = join(hooks, "lanes.ts");
  const stale =
    "import {gpu} from 'agx-usehooks'; const device = gpu(); if (device !== 'unknown') device.utilPct;\n";
  writeFileSync(hook, stale);
  const consumer: Consumer = {
    name: "fixture",
    root: consumerRoot,
    hooks: ".agents/hooks",
    link_task: "link:agx-usehooks",
    link_path: "node_modules/agx-usehooks",
    command: ["bun", tsgo, "--noEmit", "-p", "{root}"],
  };
  expect(await checkConsumer(consumer, workspace)).toBe(1);
  expect(readFileSync(hook, "utf8")).toBe(stale);
  expect(readFileSync(join(consumerRoot, "tsconfig.json"), "utf8")).toBe(
    config,
  );
  expect(realpathSync(link)).toBe(realpathSync(installed));
  writeFileSync(
    join(installed, "index.ts"),
    "export declare function gpu(): {nowPct: number} | {unavailable: string};\n",
  );
  writeFileSync(
    hook,
    "import {gpu} from 'agx-usehooks'; const device = gpu(); if (!('unavailable' in device)) device.nowPct;\n",
  );
  expect(await checkConsumer(consumer, workspace)).toBe(0);
  mkdirSync(join(consumerRoot, "src"));
  writeFileSync(
    join(consumerRoot, "src/other.ts"),
    "const value: number = 'outside';\n",
  );
  expect(await checkConsumer(consumer, workspace)).toBe(0);
  expect(
    await checkConsumer({ ...consumer, root: join(root, "absent") }, workspace),
  ).toBe(0);
}, 120_000);
