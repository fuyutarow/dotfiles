import { afterAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  computeIndexPlan,
  measuredEta,
  planReport,
} from "../src/index-plan.ts";
import { waitForIndexChild } from "../src/ccc-index.ts";

const ccc = Bun.which("ccc");
const roots: string[] = [];
const router = join(import.meta.dir, "../src/repo-retrieve.ts");
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
function fixture(bulk = false) {
  const root = mkdtempSync(join(tmpdir(), "rr-plan-bulk-json-"));
  roots.push(root);
  mkdirSync(join(root, ".cocoindex_code"));
  mkdirSync(join(root, "bulk"));
  writeFileSync(
    join(root, "source.ts"),
    "const value = calculateResult(input);\n".repeat(400),
  );
  writeFileSync(
    join(root, "bulk", "evidence.txt"),
    "Primary source evidence remains included.\n".repeat(50),
  );
  if (bulk)
    writeFileSync(
      join(root, "bulk", "payload.json"),
      JSON.stringify({
        values: Array.from({ length: 6000 }, (_, i) => ({
          id: i,
          value: 123456,
        })),
      }),
    );
  settings(root);
  return root;
}
function settings(root: string, extra = "") {
  writeFileSync(
    join(root, ".cocoindex_code", "settings.yml"),
    `include_patterns:\n- '**/*.ts'\n- '**/*.txt'\n- '**/*.json'\n- '**/*.md'\nexclude_patterns:\n- '**/.*'\n${extra}`,
  );
}
async function cli(
  root: string,
  args: string[],
  env: Record<string, string> = {},
) {
  const child = Bun.spawn({
    cmd: [process.execPath, router, "index", ...args],
    cwd: root,
    env: { ...process.env, REPO_RETRIEVE_AUTO_INDEX: "0", ...env },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, code };
}

describe.skipIf(ccc === null)(
  "CCC-PLAN-GATE with installed ccc matcher",
  () => {
    test("bulk JSON is refused before any ccc command; its suggested exclude fixes the plan and retains text", async () => {
      const root = fixture(true);
      const planned = await computeIndexPlan(root, ccc!);
      expect(planned.isOk()).toBe(true);
      if (planned.isErr()) return;
      expect(planned.value.data_share).toBeGreaterThan(0.8);
      const top = planned.value.contributors[0]!;
      expect(top.directory).toBe("bulk");
      expect(top.exclude).toBe("- 'bulk/**/*.json'");
      expect(planReport(planned.value)).toContain(top.exclude);
      // Same interpreter for scope, but every attempt to run ccc itself leaves evidence.
      const bin = join(root, "bin");
      mkdirSync(bin);
      const interpreter = readFileSync(realpathSync(ccc!), "utf8")
        .split("\n")[0]!
        .slice(2);
      const fake = join(bin, "ccc");
      const called = join(root, "called");
      writeFileSync(
        fake,
        `#!${interpreter}\nfrom pathlib import Path\nPath(${JSON.stringify(called)}).write_text('called')\nraise SystemExit(1)\n`,
      );
      chmodSync(fake, 0o755);
      const env = { PATH: `${bin}:${process.env.PATH ?? ""}` };
      const refused = await cli(root, [], env);
      expect(refused.code).toBe(4);
      expect(refused.stderr).toContain(top.exclude);
      expect(await Bun.file(called).exists()).toBe(false);
      expect(
        await Bun.file(join(root, ".cocoindex_code", "INDEXED_AT")).exists(),
      ).toBe(false);
      const dry = await cli(root, ["--plan"], env);
      expect(dry.code).toBe(4);
      expect(dry.stdout).toContain('"path":"bulk/payload.json"');
      expect(dry.stdout).toContain('"type":"summary"');
      const accepted = await cli(root, ["--accept-plan"], env);
      expect(accepted.code).toBe(1); // the fixture ccc fails; it never embeds
      expect(accepted.stderr).toContain("override recorded");
      expect(
        await Bun.file(
          join(root, ".cocoindex_code", "RR_ACCEPTED_PLAN.json"),
        ).exists(),
      ).toBe(true);
      rmSync(called);
      settings(root, `${top.exclude}\n- '!bulk/**/*.txt'\n`);
      const fixed = await computeIndexPlan(root, ccc!);
      expect(fixed.isOk()).toBe(true);
      if (fixed.isErr()) return;
      expect(fixed.value.violations).toEqual([]);
      expect(
        fixed.value.files.some((file) => file.path === "bulk/payload.json"),
      ).toBe(false);
      expect(
        fixed.value.files.some((file) => file.path === "bulk/evidence.txt"),
      ).toBe(true);
      expect((await cli(root, ["--plan"], env)).code).toBe(0);
      expect(await Bun.file(called).exists()).toBe(false);
    }, 30_000);

    test("code-only passes; chunk budget and invalid config refuse closed", async () => {
      const root = fixture();
      expect((await cli(root, ["--plan"])).code).toBe(0);
      writeFileSync(
        join(root, ".cocoindex_code", "rr.toml"),
        "[index]\nmax_est_chunks = 1\n",
      );
      expect((await cli(root, ["--plan"])).code).toBe(4);
      writeFileSync(
        join(root, ".cocoindex_code", "rr.toml"),
        "[index]\nmax_data_share = 2\n",
      );
      expect((await cli(root, ["--plan"])).code).toBe(2);
    }, 30_000);

    test("a directory ending in .json is never pruned by an exclude suggestion", async () => {
      const root = fixture(true);
      mkdirSync(join(root, "bulk", "saved.json"));
      writeFileSync(
        join(root, "bulk", "saved.json", "paper.txt"),
        "Included primary text.",
      );
      const result = await computeIndexPlan(root, ccc!);
      expect(result.isOk()).toBe(true);
      if (result.isErr()) return;
      const suggestion = result.value.contributors.find(
        (item) => item.directory === "bulk" && item.extension === ".json",
      )!;
      expect(suggestion.exclude).toBe("- 'bulk/payload.json'");
      settings(root, `${suggestion.exclude}\n- '!bulk/**/*.txt'\n`);
      const fixed = await computeIndexPlan(root, ccc!);
      expect(fixed.isOk()).toBe(true);
      if (fixed.isErr()) return;
      expect(fixed.value.violations).toEqual([]);
      expect(
        fixed.value.files.some(
          (file) => file.path === "bulk/saved.json/paper.txt",
        ),
      ).toBe(true);
    }, 30_000);

    test("slow measured progress stops only the fixture client and repeats the contributor report", async () => {
      const root = fixture(true);
      writeFileSync(
        join(root, ".cocoindex_code", "rr.toml"),
        "[index]\nmax_seconds = 1\nest_chunks_per_second = 1000000\n",
      );
      const bin = join(root, "bin");
      mkdirSync(bin);
      const interpreter = readFileSync(realpathSync(ccc!), "utf8")
        .split("\n")[0]!
        .slice(2);
      const fake = join(bin, "ccc");
      writeFileSync(
        fake,
        `#!${interpreter}
import sys, time
from pathlib import Path
if sys.argv[1] == 'index':
    Path('started').write_text('yes')
    time.sleep(20)
elif sys.argv[1] == 'status':
    print('Indexing in progress: 1 files listed')
    print('  Chunks: ' + ('1' if Path('started').exists() else '0'))
else:
    print(str(Path.cwd()) + ' [indexing]')
`,
      );
      chmodSync(fake, 0o755);
      const result = await cli(root, ["--accept-plan"], {
        PATH: `${bin}:${process.env.PATH ?? ""}`,
      });
      expect(result.code).toBe(125);
      expect(result.stderr).toContain("measured");
      expect(result.stderr).toContain("ETA");
      expect(result.stderr).toContain("left the daemon running");
      expect(result.stderr.match(/Top contributors/gu)?.length).toBe(2);
      expect(result.stderr).toContain("bulk/**/*.json");
      expect(
        await Bun.file(join(root, ".cocoindex_code", "INDEXED_AT")).exists(),
      ).toBe(false);
    }, 30_000);

    test("nested gitignore, size limit, Unicode characters, and content classification", async () => {
      const root = fixture();
      writeFileSync(join(root, "bulk", ".gitignore"), "ignored.md\n");
      writeFileSync(join(root, "bulk", "ignored.md"), "ignored");
      writeFileSync(join(root, "unicode.md"), "あ".repeat(801));
      writeFileSync(
        join(root, "numbers.md"),
        "1,2,3,4,5,6,7,8,9\n".repeat(100),
      );
      writeFileSync(join(root, "large.md"), "large file\n".repeat(3000));
      writeFileSync(
        join(root, ".cocoindex_code", "settings.yml"),
        readFileSync(join(root, ".cocoindex_code", "settings.yml"), "utf8") +
          "max_file_size: 20000\n",
      );
      const result = await computeIndexPlan(root, ccc!);
      expect(result.isOk()).toBe(true);
      if (result.isErr()) return;
      expect(
        result.value.files.find((file) => file.path === "unicode.md")
          ?.est_chunks,
      ).toBe(2);
      expect(
        result.value.files.find((file) => file.path === "numbers.md")?.kind,
      ).toBe("data");
      expect(
        result.value.files.some(
          (file) =>
            file.path.endsWith("ignored.md") || file.path === "large.md",
        ),
      ).toBe(false);
    });
  },
);

test("measured ETA uses chunk deltas, ignores no advancement, and stops the client wait", async () => {
  expect(measuredEta(1000, 100, 100, 10)).toBeNull();
  const eta = measuredEta(1000, 100, 200, 10)!;
  expect(eta.rate).toBe(10);
  expect(eta.remaining).toBe(90);
  expect(eta.totalSeconds).toBe(100);
  let now = 0;
  let over = false;
  const result = await waitForIndexChild(
    new Promise<number>(() => {}),
    600000,
    {
      now: () => now,
      sleep: (ms) => {
        now += ms;
        return Promise.resolve();
      },
      sample: () => {
        over = now > 0;
        return Promise.resolve(String(now));
      },
      overBudget: () => over,
    },
  );
  expect(result).toBe(125);
});
