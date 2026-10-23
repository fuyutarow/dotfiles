import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { jevUsageSegment, readJevUsage } from "../src/jev-usage.ts";
import { ESC } from "../src/ansi.ts";

const plain = (text: string) =>
  text.replaceAll(new RegExp(`${ESC}\\[[0-9;]*m`, "gu"), "");

const roots: string[] = [];
const previous = process.env.AGX_STATE_DIR;
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
  if (previous === undefined) delete process.env.AGX_STATE_DIR;
  else process.env.AGX_STATE_DIR = previous;
});

async function fakeCli(root: string, source: string): Promise<string> {
  const path = join(root, "agx-worker");
  await writeFile(path, `#!${process.execPath}\n${source}`, { mode: 0o755 });
  return path;
}

async function usageLog(root: string): Promise<string> {
  const path = join(root, "runs.jsonl");
  await writeFile(
    path,
    JSON.stringify({
      kind: "run",
      started_at: "2026-10-08T00:00:00Z",
      pick: {
        jev: {
          response: {
            usage: { input_tokens: 900_000, output_tokens: 300_000 },
          },
        },
      },
    }),
  );
  return path;
}

test("reads seven-day Jev response usage and prices spend", async () => {
  const root = await mkdtemp(join(tmpdir(), "statusline-jev-"));
  roots.push(root);
  process.env.AGX_STATE_DIR = root;
  const now = Math.floor(
    Temporal.Instant.from("2026-10-09T00:00:00Z").epochMilliseconds / 1000,
  );
  const runLog = await usageLog(root);
  const inputPrice = 0.5;
  const outputPrice = 2;
  const roster = {
    auto: {
      jev: {
        price_per_mtok_input: inputPrice,
        price_per_mtok_output: outputPrice,
      },
    },
  };
  const oldCost = (900_000 * inputPrice + 300_000 * outputPrice) / 1_000_000;
  const cli = await fakeCli(
    root,
    `if (JSON.stringify(process.argv.slice(2)) !== '["exec","--","agx-worker","roster","--json"]') process.exit(1);
process.stdout.write(${JSON.stringify(JSON.stringify(roster))});`,
  );
  const usage = await readJevUsage(now, runLog, [
    cli,
    "exec",
    "--",
    "agx-worker",
  ]);
  expect(usage.isOk()).toBe(true);
  if (usage.isOk()) {
    expect(usage.value?.costUsd).toBe(oldCost);
    expect(plain(jevUsageSegment(usage.value))).toBe("Jev 7d spend $1.05");
  }
});

test.each([
  ["is missing", undefined],
  ["fails", "process.exitCode = 1;"],
  ["prints invalid JSON", 'process.stdout.write("not JSON");'],
  ["omits prices", 'process.stdout.write(\'{"auto":{"jev":{}}}\');'],
  ["prints an invalid schema", 'process.stdout.write("{}");'],
  ["times out", "await Bun.sleep(10_000);"],
])(
  "returns Jev price unavailable when roster CLI %s",
  async (_name, source) => {
    const root = await mkdtemp(join(tmpdir(), "statusline-jev-"));
    roots.push(root);
    const now = Math.floor(
      Temporal.Instant.from("2026-10-09T00:00:00Z").epochMilliseconds / 1000,
    );
    const runLog = await usageLog(root);
    if (source !== undefined) await fakeCli(root, source);
    const usage = await readJevUsage(now, runLog, [join(root, "agx-worker")]);
    expect(usage.isErr()).toBe(true);
    if (usage.isErr()) {
      expect(usage.error).toBe("Jev price unavailable");
      expect(plain(jevUsageSegment(undefined, usage.error))).toBe(
        "Jev n/a (Jev price unavailable)",
      );
    }
  },
);

test("uses the dotfiles mise pin from an arbitrary cwd without agx on PATH", async () => {
  const root = await mkdtemp(join(tmpdir(), "statusline-jev-"));
  roots.push(root);
  const runLog = await usageLog(root);
  const expectedArgs = [
    "-C",
    resolve(import.meta.dir, "../../.."),
    "exec",
    "--",
    "agx-worker",
    "roster",
    "--json",
  ];
  await writeFile(
    join(root, "mise"),
    `#!${process.execPath}
if (JSON.stringify(process.argv.slice(2)) !== ${JSON.stringify(JSON.stringify(expectedArgs))}) process.exit(1);
process.stdout.write('{"auto":{"jev":{"price_per_mtok_input":0.5,"price_per_mtok_output":2}}}');`,
    { mode: 0o755 },
  );
  const modulePath = resolve(import.meta.dir, "../src/jev-usage.ts");
  const child = Bun.spawn({
    cmd: [
      process.execPath,
      "--eval",
      `import { readJevUsage } from ${JSON.stringify(modulePath)};
const now = Temporal.Instant.from("2026-10-09T00:00:00Z").epochMilliseconds / 1000;
const usage = await readJevUsage(now, ${JSON.stringify(runLog)});
if (usage.isErr()) throw new Error(usage.error);
process.stdout.write(JSON.stringify(usage.value));`,
    ],
    cwd: root,
    env: { ...process.env, PATH: root },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 4_000,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  expect(stdout).toBe(JSON.stringify({ costUsd: 1.05 }));
});

test.each([
  [0, "Jev 7d spend $0"],
  [0.0004, "Jev 7d spend <$0.01"],
  [0.004, "Jev 7d spend <$0.01"],
  [0.0099, "Jev 7d spend <$0.01"],
  [0.01, "Jev 7d spend $0.01"],
  [0.0149, "Jev 7d spend $0.01"],
  [1.234, "Jev 7d spend $1.23"],
  [undefined, "Jev n/a (usage sample unavailable)"],
])("formats Jev cost %s as %s", (costUsd, expected) => {
  expect(plain(jevUsageSegment({ costUsd }))).toBe(expected);
});

test("names Jev when runs.jsonl is absent", async () => {
  const root = "/definitely/missing/statusline-jev";
  process.env.AGX_STATE_DIR = root;
  const usage = await readJevUsage();
  expect(usage.isOk()).toBe(true);
  if (usage.isOk())
    expect(plain(jevUsageSegment(usage.value))).toBe(
      "Jev n/a (usage sample unavailable)",
    );
});
