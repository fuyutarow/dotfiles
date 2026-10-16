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
  summarize,
} from "../src/index-plan.ts";
import { waitForIndexChild } from "../src/ccc-index.ts";
import {
  indexRateFile,
  median,
  readIndexRate,
  recordIndexRate,
} from "../src/index-rate.ts";

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
      if (ccc === null) return;
      const root = fixture(true);
      const planned = await computeIndexPlan(root, ccc);
      expect(planned.isOk()).toBe(true);
      if (planned.isErr()) return;
      expect(planned.value.data_share).toBeGreaterThan(0.8);
      const top = planned.value.contributors[0];
      expect(top).toBeDefined();
      if (top === undefined) return;
      const suggestion = top.exclude;
      expect(top.directory).toBe("bulk");
      expect(top.kind).toBe("data");
      expect(suggestion).toBe("- 'bulk/payload.json'");
      if (suggestion === null) return;
      expect(planReport(planned.value)).toContain(suggestion);
      // Same interpreter for scope, but every attempt to run ccc itself leaves evidence.
      const bin = join(root, "bin");
      mkdirSync(bin);
      const [shebang] = readFileSync(realpathSync(ccc), "utf8").split("\n");
      expect(shebang).toBeDefined();
      if (shebang === undefined) return;
      const interpreter = shebang.slice(2);
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
      expect(refused.stderr).toContain(suggestion);
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
      const fixed = await computeIndexPlan(root, ccc);
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
      if (ccc === null) return;
      const root = fixture(true);
      mkdirSync(join(root, "bulk", "saved.json"));
      writeFileSync(
        join(root, "bulk", "saved.json", "paper.txt"),
        "Included primary text.",
      );
      const result = await computeIndexPlan(root, ccc);
      expect(result.isOk()).toBe(true);
      if (result.isErr()) return;
      const suggestion = result.value.contributors.find(
        (item) => item.directory === "bulk" && item.extension === ".json",
      );
      expect(suggestion).toBeDefined();
      if (suggestion === undefined) return;
      expect(suggestion.exclude).toBe("- 'bulk/payload.json'");
      settings(root, `${suggestion.exclude}\n- '!bulk/**/*.txt'\n`);
      const fixed = await computeIndexPlan(root, ccc);
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
      if (ccc === null) return;
      const root = fixture(true);
      writeFileSync(
        join(root, ".cocoindex_code", "rr.toml"),
        "[index]\nmax_seconds = 1\nest_chunks_per_second = 1000000\n",
      );
      const bin = join(root, "bin");
      mkdirSync(bin);
      const [shebang] = readFileSync(realpathSync(ccc), "utf8").split("\n");
      expect(shebang).toBeDefined();
      if (shebang === undefined) return;
      const interpreter = shebang.slice(2);
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
      expect(result.stderr).toContain("bulk/payload.json");
      expect(
        await Bun.file(join(root, ".cocoindex_code", "INDEXED_AT")).exists(),
      ).toBe(false);
    }, 30_000);

    test("nested gitignore, size limit, Unicode characters, and content classification", async () => {
      if (ccc === null) return;
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
      const result = await computeIndexPlan(root, ccc);
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
  const eta = measuredEta(1000, 100, 200, 10);
  expect(eta).not.toBeNull();
  if (eta === null) return;
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

test("code-only plans pass and never suggest excluding code or prose", () => {
  const budget = {
    max_est_chunks: 50_000,
    max_data_share: 0.2,
    max_seconds: 600,
    est_chunks_per_second: 50,
  };
  const codePlan = summarize(
    [
      { path: "src/main.ts", bytes: 100, est_chunks: 1_000, kind: "text" },
      { path: "notes/design.md", bytes: 100, est_chunks: 1_000, kind: "text" },
    ],
    budget,
  );
  expect(codePlan.violations).toEqual([]);
  expect(codePlan.contributors.every((item) => item.exclude === null)).toBe(
    true,
  );

  const refused = summarize(
    [{ path: "src/main.ts", bytes: 100, est_chunks: 1_000, kind: "text" }],
    { ...budget, max_est_chunks: 10 },
  );
  const report = planReport(refused);
  expect(report).toContain("No data-kind contributor can be safely excluded");
  expect(report).toContain(".cocoindex_code/rr.toml");
  expect(report).not.toContain("- 'src/main.ts'");
});

test("only exact data-kind paths receive exclude suggestions", () => {
  const plan = summarize(
    [
      { path: "src/main.ts", bytes: 100, est_chunks: 100, kind: "text" },
      { path: "docs/notes.md", bytes: 100, est_chunks: 100, kind: "text" },
      { path: "data/rows.json", bytes: 100, est_chunks: 1_000, kind: "data" },
    ],
    {
      max_est_chunks: 50_000,
      max_data_share: 0.2,
      max_seconds: 600,
      est_chunks_per_second: 50,
    },
  );
  expect(plan.contributors.find((item) => item.kind === "data")?.exclude).toBe(
    "- 'data/rows.json'",
  );
  expect(
    plan.contributors
      .filter((item) => item.kind === "text")
      .every((item) => item.exclude === null),
  ).toBe(true);
  expect(planReport(plan)).toContain("Suggested data-only excludes");
  expect(planReport(plan)).not.toContain("- 'src/main.ts'");
  expect(planReport(plan)).not.toContain("- 'docs/notes.md'");
});

test("fallback time estimate warns without refusing; measured rate enforces the time budget", () => {
  const files = [
    {
      path: "src/main.ts",
      bytes: 100,
      est_chunks: 1_000,
      kind: "text" as const,
    },
  ];
  const budget = {
    max_est_chunks: 50_000,
    max_data_share: 0.2,
    max_seconds: 10,
    est_chunks_per_second: 50,
  };
  const fallback = summarize(files, budget);
  expect(fallback.violations).toEqual([]);
  expect(fallback.rate_source).toBe("fallback");
  expect(planReport(fallback)).toContain(
    "time estimate uses the configured fallback rate",
  );
  const measured = summarize(files, budget, 10);
  expect(measured.violations).toEqual(["estimated GPU seconds 100.0 > 10"]);
  expect(measured.rate_source).toBe("measured");
  expect(planReport(measured)).toContain("(measured)");
});

test("rate medians ignore invalid samples and handle odd and even histories", () => {
  expect(median([])).toBeNull();
  expect(median([0, -1, NaN, Infinity])).toBeNull();
  expect(median([3])).toBe(3);
  expect(median([9, 1, 5])).toBe(5);
  expect(median([8, 2])).toBe(5);
  expect(median([8, 2, 6, 4, 0, -1, NaN, Infinity])).toBe(5);
});

test("rate history is per host and plans use the median of the latest nine runs", async () => {
  const stateHome = mkdtempSync(join(tmpdir(), "rr-index-rate-"));
  roots.push(stateHome);
  const path = indexRateFile({ XDG_STATE_HOME: stateHome }, "fixture-host");
  expect(path).toContain("repo-retrieve/fixture-host/index-rates.jsonl");
  expect(indexRateFile({ XDG_STATE_HOME: stateHome }, "other-host")).not.toBe(
    path,
  );
  for (const rate of [100, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    await recordIndexRate(rate, 100, path);
  expect(await readIndexRate(path)).toBe(5);
});
