import { afterAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  truncateSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cccPython } from "../src/ccc-scope.ts";
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

// Both the ccc entry point and its interpreter are isolated recording doubles.
// Unexpected commands fail closed: this fixture cannot reach a real daemon.
function recordingFixture(refused = false) {
  const root = fixture();
  const bin = join(root, ".fake-bin");
  const home = join(root, ".home");
  const log = join(root, ".invocations.jsonl");
  mkdirSync(bin);
  mkdirSync(home);
  writeFileSync(log, "");
  if (refused)
    writeFileSync(
      join(root, ".cocoindex_code/rr.toml"),
      "[index]\nmax_est_chunks = 1\n",
    );
  const interpreter = join(bin, "python");
  writeFileSync(
    interpreter,
    `#!${process.execPath}
import { appendFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(log)}, JSON.stringify({cwd: process.cwd(), args}) + '\\n');
const script = basename(args[0]);
if (script === 'ccc_plan.py') {
  console.log(args.includes('--validate-excludes') ? '[]' : JSON.stringify({path: 'source.ts', bytes: 14000, est_chunks: 18, kind: 'text'}));
} else if (script === 'ccc_defs.py') {
  const record = {name: 'calculateResult', kind: 'function', lang: 'typescript', file: 'source.ts', start: 1, end: 1, signature: 'calculateResult(input)', doc: '', body: '', public: true};
  writeFileSync(args[2], JSON.stringify({files: {'source.ts': {records: [record], publics: []}}}));
} else if (script === 'ccc' && args[1] === 'index') {
  writeFileSync(join(process.cwd(), '.cocoindex_code/target_sqlite.db'), 'fixture');
} else if (script === 'ccc' && args[1] === 'status') {
  console.log('Files: 1\\nChunks: 18');
} else if (script === 'ccc' && args[1] === 'daemon' && args[2] === 'status') {
  console.log(process.cwd() + ' [idle]');
} else {
  console.error('Unexpected fixture command', args);
  process.exitCode = 99;
}
`,
  );
  chmodSync(interpreter, 0o755);
  writeFileSync(join(bin, "ccc"), `#!${interpreter}\n`);
  chmodSync(join(bin, "ccc"), 0o755);
  return {
    root,
    home,
    env: {
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      HOME: home,
      XDG_STATE_HOME: join(home, "state"),
      COCOINDEX_CODE_DB_PATH_MAPPING: "",
    },
    calls: () => readFileSync(log, "utf8").trim().split("\n").filter(Boolean),
  };
}

for (const refused of [false, true]) {
  test(`--plan is read-only when ${refused ? "refused (exit 4)" : "admitted (exit 0)"}`, async () => {
    const f = recordingFixture(refused);
    const settingsBefore = readdirSync(join(f.root, ".cocoindex_code"));
    const result = await cli(f.root, ["--plan"], f.env);
    expect(result.code).toBe(refused ? 4 : 0);
    expect(result.stdout).toContain('"type":"summary"');
    // Exactly the enumeration and exclusion-safety matcher reads; no ccc verb,
    // extractor, catalog build, watermark or persistent rate/request writes.
    const calls = f.calls();
    expect(calls.filter((call) => !call.includes("ccc_plan.py"))).toEqual([]);
    expect(calls).toHaveLength(2);
    expect(result.stderr).not.toContain("catalog");
    expect(readdirSync(f.home)).toEqual([]);
    expect(readdirSync(join(f.root, ".cocoindex_code"))).toEqual(
      settingsBefore,
    );
  });
}

test("a completed foreground index still extracts and indexes only the definition catalog", async () => {
  const f = recordingFixture();
  const result = await cli(f.root, [], f.env);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("RESULT: INDEXED");
  expect(result.stderr).toContain("catalog built: 1 definitions");
  const calls = f.calls();
  expect(calls.some((call) => call.includes("ccc_defs.py"))).toBe(true);
  const indexes = calls.filter((call) => call.includes('"index"'));
  expect(indexes).toHaveLength(2);
  expect(indexes[0]).toContain(f.root);
  expect(indexes[1]).toContain(join(f.home, ".cache/repo-retrieve/catalog"));
});

describe.skipIf(ccc === null)(
  "CCC-PLAN-GATE with installed ccc matcher",
  () => {
    test("control density admits the inclusive 0.1% boundary; NUL and denser C0 or DEL remain blobs", async () => {
      if (ccc === null) return;
      const root = fixture();
      const prose = "Research evidence and refutation conditions.\n".repeat(30);
      const cases = [
        { name: "stray", control: "\u0008", count: 1, blob: false },
        { name: "dense", control: "\u0008", count: 2, blob: true },
        { name: "del-stray", control: "\u007F", count: 1, blob: false },
        { name: "del-dense", control: "\u007F", count: 2, blob: true },
        { name: "mixed-dense", control: "\u0008\u007F", count: 1, blob: true },
        { name: "nul", control: "\0", count: 1, blob: true },
        { name: "whitespace", control: "\t\n\f\r", count: 100, blob: false },
      ];
      for (const item of cases) {
        const controls = item.control.repeat(item.count);
        const content = controls + prose.slice(0, 1000 - controls.length);
        expect(Buffer.byteLength(content)).toBe(1000);
        writeFileSync(join(root, `${item.name}.md`), content);
      }
      const result = await computeIndexPlan(root, ccc);
      expect(result.isOk()).toBe(true);
      if (result.isErr()) return;
      for (const item of cases) {
        expect(
          result.value.files.find((file) => file.path === `${item.name}.md`),
        ).toMatchObject({ blob: item.blob, kind: item.blob ? "data" : "text" });
        expect(
          result.value.violations.some((violation) =>
            violation.startsWith(`${item.name}.md: binary/blob content;`),
          ),
        ).toBe(item.blob);
      }
    });

    test("memo-shaped UTF-8 prose with one backspace is admitted with text chunk accounting", async () => {
      if (ccc === null) return;
      const root = fixture();
      const prefix =
        "# Abstract and mechanism\n研究報告 GPU results and refutation conditions.\n";
      const paragraph =
        "Causal update evidence and mechanism remain reproducible.\n";
      const before = prefix + paragraph.repeat(40);
      const memo = Buffer.concat([
        Buffer.from(before).subarray(0, 1845),
        Buffer.from([8]),
        Buffer.from(paragraph.repeat(120)),
      ]).subarray(0, 6441);
      expect(memo.length).toBe(6441);
      expect(memo[1845]).toBe(8);
      expect(memo.filter((byte) => byte === 8).length).toBe(1);
      const text = new TextDecoder("utf-8", { fatal: true }).decode(memo);
      writeFileSync(join(root, "memo-shaped.md"), memo);
      const result = await computeIndexPlan(root, ccc);
      expect(result.isOk()).toBe(true);
      if (result.isErr()) return;
      expect(result.value.violations).toEqual([]);
      expect(
        result.value.files.find((file) => file.path === "memo-shaped.md"),
      ).toMatchObject({
        bytes: 6441,
        blob: false,
        kind: "text",
        est_chunks: Math.ceil(Array.from(text).length / 800),
      });
    });

    test("fresh ccc init registration plans and accepts without invoking a real indexer", async () => {
      if (ccc === null) return;
      const root = mkdtempSync(join(tmpdir(), "rr-plan-fresh-root-"));
      roots.push(root);
      writeFileSync(join(root, "notes.md"), "Primary research evidence.\n");
      const init = Bun.spawn([ccc, "init", "-f"], {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 30_000,
      });
      const [, , code] = await Promise.all([
        new Response(init.stdout).text(),
        new Response(init.stderr).text(),
        init.exited,
      ]);
      expect(code).toBe(0);
      const bin = join(root, "bin");
      mkdirSync(bin);
      const interpreter = await cccPython(ccc);
      expect(interpreter).not.toBeNull();
      if (interpreter === null) return;
      // The planner still uses installed ccc's matcher, but indexing is a
      // disposable success stub. No daemon or real indexer can be invoked.
      writeFileSync(
        join(bin, "ccc"),
        `#!${interpreter}\nimport sys\nfrom pathlib import Path\nif sys.argv[1] == 'index':\n    Path('fixture-index-called').write_text('yes')\n    Path('.cocoindex_code/fake_target.db').write_text('fixture artifact')\nelif sys.argv[1] == 'daemon':\n    print(str(Path.cwd()) + ' [idle]')\n`,
      );
      chmodSync(join(bin, "ccc"), 0o755);
      const env = {
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        COCOINDEX_CODE_DB_PATH_MAPPING: "",
      };
      const plan = await cli(root, ["--plan"], env);
      expect(plan.code).toBe(0);
      expect(plan.stdout).toContain('"path":"notes.md"');
      expect(await Bun.file(join(root, "fixture-index-called")).exists()).toBe(
        false,
      );
      const accepted = await cli(root, ["--accept-plan"], env);
      expect(accepted).toMatchObject({ code: 0 });
      expect(await Bun.file(join(root, "fixture-index-called")).exists()).toBe(
        true,
      );
      expect(
        await Bun.file(
          join(root, ".cocoindex_code", "RR_ACCEPTED_PLAN.json"),
        ).exists(),
      ).toBe(true);
    }, 30_000);

    test("large fresh-root exclude requests avoid the Cartesian scan and retain independent safety", async () => {
      if (ccc === null) return;
      const root = fixture();
      const interpreter = await cccPython(ccc);
      expect(interpreter).not.toBeNull();
      if (interpreter === null) return;
      const paths = Array.from(
        { length: 32_000 },
        (_, i) => `data/${i % 900}/${i}.json`,
      );
      paths.push("data/0/saved.json/paper.txt", "data/1/unsafe.json/paper.txt");
      const patterns = paths.slice(0, 32_000);
      patterns[17] = "data/0/saved.json";
      patterns[25_000] = "data/1/unsafe.json";
      const child = Bun.spawn(
        [
          interpreter,
          join(import.meta.dir, "../src/ccc_plan.py"),
          root,
          "--validate-excludes",
        ],
        {
          stdin: new Response(JSON.stringify({ patterns, paths })),
          stdout: "pipe",
          stderr: "pipe",
          timeout: 10_000,
          env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
        },
      );
      const [out, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(stderr).toBe("");
      expect(code).toBe(0);
      expect(out.trim()).toBe(
        JSON.stringify(
          patterns.map((_, i) => i !== 17 && i !== 25_000),
        ).replaceAll(",", ", "),
      );
    }, 15_000);

    test("effective huge files, dumps and disguised blobs refuse before the index child; exclusions fix admission", async () => {
      if (ccc === null) return;
      const root = fixture();
      mkdirSync(join(root, "research"));
      writeFileSync(
        join(root, "research", "running.md"),
        "Research is running.\n",
      );
      mkdirSync(join(root, "runs"));
      // Sparse 2 GiB fixtures must be rejected from metadata, never read whole.
      for (const name of ["huge.txt", "huge.json"]) {
        writeFileSync(join(root, "runs", name), "");
        truncateSync(join(root, "runs", name), 2 ** 31);
      }
      writeFileSync(
        join(root, "runs", "dump.json"),
        JSON.stringify({ values: "1234567890".repeat(7000) }),
      );
      writeFileSync(join(root, "checkpoint.ts"), Buffer.from([65, 0, 66]));
      writeFileSync(join(root, "invalid.md"), Buffer.from([255, 254, 128]));
      // A substantial valid source denominator cannot hide a dump or zero-chunk blob.
      writeFileSync(
        join(root, "normal.ts"),
        "const value = calculateResult(input);\n".repeat(20000),
      );
      const result = await computeIndexPlan(root, ccc);
      expect(result.isOk()).toBe(true);
      if (result.isErr()) return;
      const report = planReport(result.value);
      expect(report).toContain(
        "runs/huge.txt: 2147483648 bytes > per-file limit 1048576",
      );
      expect(report).toContain(
        "runs/huge.json: 2147483648 bytes > per-file limit 1048576",
      );
      expect(report).toContain("checkpoint.ts: binary/blob content");
      expect(report).toContain("invalid.md: binary/blob content");
      expect(report).toContain("exclusions are inadequate");
      // The walker visits root files first, then runs; the data dump is before
      // the huge files, so its bounded content classification is also exercised.
      expect(report).toContain("runs/dump.json: dump/data candidate");
      expect(report).toContain("data-file limit 65536");
      const bin = join(root, "bin");
      mkdirSync(bin);
      const shebang = readFileSync(realpathSync(ccc), "utf8").split("\n")[0];
      expect(shebang).toBeDefined();
      if (shebang === undefined) return;
      const called = join(root, "called");
      const fake = join(bin, "ccc");
      writeFileSync(
        fake,
        `${shebang}\nfrom pathlib import Path\nPath(${JSON.stringify(called)}).write_text('called')\nraise SystemExit(1)\n`,
      );
      chmodSync(fake, 0o755);
      const refused = await cli(root, [], {
        PATH: `${bin}:${process.env.PATH ?? ""}`,
      });
      expect(refused.code).toBe(4);
      expect(await Bun.file(called).exists()).toBe(false);
      expect(
        await Bun.file(join(root, ".cocoindex_code", "INDEXED_AT")).exists(),
      ).toBe(false);
      // Root and nested gitignore semantics, including a re-included source,
      // remove the actual offenders without rejecting research presence.
      writeFileSync(join(root, ".gitignore"), "checkpoint.ts\ninvalid.md\n");
      writeFileSync(
        join(root, "runs", ".gitignore"),
        "*.txt\n*.json\n!keep.txt\n",
      );
      writeFileSync(join(root, "runs", "keep.txt"), "Keep primary evidence.\n");
      const fixed = await computeIndexPlan(root, ccc);
      expect(fixed.isOk()).toBe(true);
      if (fixed.isErr()) return;
      expect(fixed.value.violations).toEqual([]);
      expect(fixed.value.files.map((file) => file.path)).toContain(
        "runs/keep.txt",
      );
      expect(fixed.value.files.map((file) => file.path)).toContain(
        "research/running.md",
      );
      expect(
        fixed.value.files.some(
          (file) => file.path.includes("huge") || file.blob === true,
        ),
      ).toBe(false);
    }, 30_000);

    test("explicit exclusions and ccc max_file_size remove bad candidates; empty exclusions allow normal source", async () => {
      if (ccc === null) return;
      const root = fixture();
      writeFileSync(join(root, "dump.txt"), "1,2,3,4,5,6,7,8,9\n".repeat(5000));
      writeFileSync(join(root, "blob.ts"), Buffer.from([0, 1, 2]));
      const planned = await computeIndexPlan(root, ccc);
      expect(planned.isOk()).toBe(true);
      if (planned.isErr()) return;
      expect(
        planned.value.violations.some((item) =>
          item.includes("dump.txt: dump/data"),
        ),
      ).toBe(true);
      expect(
        planned.value.violations.some((item) =>
          item.includes("blob.ts: binary/blob"),
        ),
      ).toBe(true);
      settings(root, "- 'blob.ts'\nmax_file_size: 65536\n");
      const fixed = await computeIndexPlan(root, ccc);
      expect(fixed.isOk()).toBe(true);
      if (fixed.isErr()) return;
      expect(fixed.value.violations).toEqual([]);
      expect(
        fixed.value.files.some((file) =>
          ["dump.txt", "blob.ts"].includes(file.path),
        ),
      ).toBe(false);
      const normal = fixture();
      writeFileSync(
        join(normal, ".cocoindex_code", "settings.yml"),
        "include_patterns: ['**/*.ts', '**/*.txt']\nexclude_patterns: []\n",
      );
      const allowed = await computeIndexPlan(normal, ccc);
      expect(allowed.isOk()).toBe(true);
      if (allowed.isOk()) expect(allowed.value.violations).toEqual([]);
    }, 30_000);

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
      expect(accepted.code).toBe(4); // violations remain mandatory with the override flag
      expect(accepted.stderr).toContain("PLAN REFUSED");
      expect(accepted.stderr).toContain(suggestion);
      expect(await Bun.file(called).exists()).toBe(false);
      expect(
        await Bun.file(join(root, ".cocoindex_code", "INDEXED_AT")).exists(),
      ).toBe(false);
      expect(
        await Bun.file(
          join(root, ".cocoindex_code", "RR_ACCEPTED_PLAN.json"),
        ).exists(),
      ).toBe(false);
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

    test("literal exclamation filenames cannot negate a different suggestion", async () => {
      if (ccc === null) return;
      const root = fixture();
      writeFileSync(join(root, "!saved.json"), '{"value":1}');
      mkdirSync(join(root, "saved.json"));
      writeFileSync(join(root, "saved.json", "paper.txt"), "Primary evidence.");
      const result = await computeIndexPlan(root, ccc);
      expect(result.isOk()).toBe(true);
      if (result.isErr()) return;
      expect(
        result.value.contributors.find((item) => item.kind === "data")?.exclude,
      ).toBe("- '\\!saved.json'");
    });

    test("elapsed time budget stops only the fixture client and repeats the contributor report", async () => {
      if (ccc === null) return;
      const root = fixture(true);
      // Reach the runtime limit only after satisfying mandatory content admission.
      settings(root, "- 'bulk/payload.json'\n");
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
      expect(result.stderr).toContain("repo-retrieve elapsed");
      expect(result.stderr).toContain("exceeds max_seconds=1");
      expect(result.stderr.trim().split("\n").at(-1)).toContain(
        "watermark left unchanged",
      );
      expect(result.stderr).toContain("left the daemon running");
      expect(result.stderr.match(/Top contributors/gu)?.length).toBe(2);
      expect(result.stderr).toContain("bulk (.txt, text)");
      expect(result.stderr).not.toContain("bulk/payload.json");
      expect(await Bun.file(join(root, "started")).exists()).toBe(true);
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

test("exclude validation failures name timeout, subprocess and output causes even with empty stderr", async () => {
  const cases = [
    {
      body: "process.exit(7)",
      expected: ["subprocess failed", "exit 7", 'stderr=""'],
    },
    {
      body: "process.stderr.write('matcher broke'); process.exit(9)",
      expected: ["exit 9", "matcher broke"],
    },
    { body: "", expected: ["invalid validator output", "exit 0", 'stdout=""'] },
    {
      body: "process.stdout.write('not json')",
      expected: ["invalid validator output", "not json"],
    },
    {
      body: "process.stdout.write('[true]')",
      expected: ["result count mismatch: expected 0, received 1"],
    },
    {
      body: "await Bun.sleep(5000)",
      timeout: 100,
      expected: ["timed out after 100ms", "SIGTERM", 'stderr=""'],
    },
  ];
  for (const item of cases) {
    const root = fixture();
    const interpreter = join(root, "python");
    writeFileSync(
      interpreter,
      `#!/usr/bin/env bun\nif (process.argv.includes('--validate-excludes')) { ${item.body} }\n`,
    );
    chmodSync(interpreter, 0o755);
    const fake = join(root, "ccc");
    writeFileSync(fake, `#!${interpreter}\n`);
    const result = await computeIndexPlan(root, fake, {
      validationTimeoutMs: item.timeout ?? 5000,
    });
    expect(result.isErr()).toBe(true);
    const message = result.isErr()
      ? result.error.message
      : "unexpected success";
    expect(message).toContain("cannot validate exclude suggestions:");
    for (const expected of item.expected) expect(message).toContain(expected);
  }
});

test("content byte boundaries include equality and enforce aggregate bytes independently of chunk estimates", () => {
  const budget = {
    max_est_chunks: 50_000,
    max_data_share: 1,
    max_seconds: 600,
    est_chunks_per_second: 50,
  };
  const source = {
    path: "src/main.ts",
    bytes: 1_048_576,
    est_chunks: 1,
    kind: "text" as const,
  };
  const data = {
    path: "data/rows.json",
    bytes: 65_536,
    est_chunks: 1,
    kind: "data" as const,
  };
  expect(summarize([source, data], budget).violations).toEqual([]);
  expect(
    summarize([{ ...source, bytes: source.bytes + 1 }], budget).violations.join(
      "\n",
    ),
  ).toContain("per-file limit 1048576");
  expect(
    summarize([{ ...data, bytes: data.bytes + 1 }], budget).violations.join(
      "\n",
    ),
  ).toContain("data-file limit 65536");
  const dataBudget = { ...budget, max_data_share: 0.2 };
  const sources = Array.from({ length: 40 }, (_, i) => ({
    ...source,
    path: `src/${i}.ts`,
    bytes: 1_000_000,
  }));
  expect(summarize(sources, budget).violations).toEqual([]);
  expect(
    summarize([...sources, { ...source, bytes: 1 }], budget).violations.join(
      "\n",
    ),
  ).toContain(
    "aggregate candidate bytes 40000001 > 40000000 (budget.max_est_chunks × 800)",
  );
  const rows = Array.from({ length: 125 }, (_, i) => ({
    ...data,
    path: `data/${i}.json`,
    bytes: 64_000,
  }));
  const dataShareSource = {
    ...source,
    path: "src/reference.ts",
    est_chunks: 500,
  };
  expect(summarize([...rows, dataShareSource], dataBudget).violations).toEqual(
    [],
  );
  expect(
    summarize(
      [...rows, { ...data, bytes: 1, est_chunks: 0 }, dataShareSource],
      dataBudget,
    ).violations.join("\n"),
  ).toContain(
    "aggregate data bytes 8000001 > 8000000 (budget.max_est_chunks × 800 × budget.max_data_share)",
  );
  expect(
    summarize(
      [{ ...source, bytes: 3, est_chunks: 0, blob: true }],
      budget,
    ).violations.join("\n"),
  ).toContain("src/main.ts: binary/blob content");
});

test("aggregate byte limits follow the effective project budget", () => {
  const budget = {
    max_est_chunks: 200_000,
    max_data_share: 0.3,
    max_seconds: 600,
    est_chunks_per_second: 50,
  };
  const sources = Array.from({ length: 161 }, (_, i) => ({
    path: `src/${i}.ts`,
    bytes: 1_000_000,
    est_chunks: 1,
    kind: "text" as const,
  }));
  expect(summarize(sources, budget).violations.join("\n")).toContain(
    "aggregate candidate bytes 161000000 > 160000000 (budget.max_est_chunks × 800)",
  );

  const rows = Array.from({ length: 733 }, (_, i) => ({
    path: `data/${i}.json`,
    bytes: 65_536,
    est_chunks: 0,
    kind: "data" as const,
  }));
  expect(summarize(rows, budget).violations.join("\n")).toContain(
    "aggregate data bytes 48037888 > 48000000 (budget.max_est_chunks × 800 × budget.max_data_share)",
  );
});

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
  expect(result).toEqual({ exitCode: 125, origin: "budget" });
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

test("rate history is per host and plans use the median of the latest nine qualifying runs", async () => {
  const stateHome = mkdtempSync(join(tmpdir(), "rr-index-rate-"));
  roots.push(stateHome);
  const path = indexRateFile({ XDG_STATE_HOME: stateHome }, "fixture-host");
  expect(path).toContain("repo-retrieve/fixture-host/index-rates.jsonl");
  expect(indexRateFile({ XDG_STATE_HOME: stateHome }, "other-host")).not.toBe(
    path,
  );
  for (const rate of [100, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    await recordIndexRate(
      {
        processedChunks: rate * 5_000,
        elapsedSeconds: 5_000,
        fullRebuild: true,
        workSource: "persisted-count-delta",
        startLoad1: 0,
        nproc: 12,
        cccVersion: "fixture",
      },
      path,
    );
  expect((await readIndexRate(path, { startLoad1: 0, nproc: 12 })).rate).toBe(
    5,
  );
});

// The production entry imports only the fake walk/settings modules below, never an indexer.
function allowanceFixture(
  config: string,
  entries: Record<string, string | number>,
) {
  const root = fixture();
  const modules = join(root, ".fake", "cocoindex_code");
  mkdirSync(modules, { recursive: true });
  writeFileSync(join(modules, "__init__.py"), "");
  writeFileSync(
    join(modules, "settings.py"),
    `
from types import SimpleNamespace
def load_project_settings(root):
    return SimpleNamespace(include_patterns=[], exclude_patterns=[], max_file_size=None)
`,
  );
  writeFileSync(
    join(modules, "file_walk.py"),
    `
from pathlib import Path
class Matcher:
    def is_dir_included(self, path): return True
def build_matcher(*args): return Matcher()
def iter_included_files(root, directory, matcher):
    for name in (root / '.candidates').read_text().splitlines():
        yield root / name, Path(name)
`,
  );
  const interpreter = join(root, ".fake", "python");
  writeFileSync(
    interpreter,
    `#!/usr/bin/env bun
const child = Bun.spawn(['uv', 'run', '--no-project', 'python', ...process.argv.slice(2)], {
  env: {...process.env, PYTHONPATH: ${JSON.stringify(join(root, ".fake"))}},
  stdin: 'inherit', stdout: 'inherit', stderr: 'inherit',
});
process.exit(await child.exited);
`,
  );
  chmodSync(interpreter, 0o755);
  const fake = join(root, ".fake", "ccc");
  writeFileSync(fake, `#!${interpreter}\n`);
  writeFileSync(join(root, ".cocoindex_code", "rr.toml"), config);
  writeFileSync(join(root, ".candidates"), Object.keys(entries).join("\n"));
  for (const [name, content] of Object.entries(entries)) {
    mkdirSync(join(root, name, ".."), { recursive: true });
    writeFileSync(join(root, name), typeof content === "string" ? content : "");
    if (typeof content === "number") truncateSync(join(root, name), content);
  }
  return { root, fake, plan: () => computeIndexPlan(root, fake) };
}

const allowanceConfig = (path: string, cap: number, extra = "") =>
  `[index]\n${extra}\n[index.file_byte_allowances]\n${JSON.stringify(path)} = ${cap}\n`;

test("exact file allowance admits a bounded large specification with normal accounting", async () => {
  const content = "Canonical specification prose.\n".repeat(40_000);
  const f = allowanceFixture(allowanceConfig("docs/spec.md", content.length), {
    "docs/spec.md": content,
  });
  const result = await f.plan();
  expect(result.isOk()).toBe(true);
  expect(result.isErr()).toBe(false);
  if (result.isErr()) return;
  expect(result.value.violations).toEqual([]);
  expect(result.value.total).toMatchObject({
    files: 1,
    bytes: content.length,
    est_chunks: Math.ceil(content.length / 800),
  });
  expect(result.value.directories[0]?.bytes).toBe(content.length);
  expect(result.value.files[0]?.path).toBe("docs/spec.md");
});

test("exact allowance admits an oversized data file while retaining the data-share gate", async () => {
  const rows = JSON.stringify({ rows: ["x".repeat(70_000)] });
  const allowed = allowanceFixture(
    allowanceConfig("data/rows.json", rows.length, "max_data_share = 1"),
    { "data/rows.json": rows },
  );
  const admitted = await allowed.plan();
  expect(admitted.isErr()).toBe(false);
  if (admitted.isErr()) return;
  expect(admitted.value.files[0]?.kind).toBe("data");
  expect(admitted.value.violations).toEqual([]);

  const overShare = allowanceFixture(
    allowanceConfig("data/rows.json", rows.length),
    {
      "src/main.ts": "const value = true;\n".repeat(1_000),
      "data/rows.json": rows,
    },
  );
  const refused = await overShare.plan();
  expect(refused.isErr()).toBe(false);
  if (refused.isErr()) return;
  expect(refused.value.violations.join("\n")).toContain("data share");
});

test("exact mismatch, cap exceedance, and absent permission retain individual refusal", async () => {
  for (const config of [
    "",
    allowanceConfig("docs/other.md", 2_000_000),
    allowanceConfig("docs/spec.md", 1_100_000),
  ]) {
    const f = allowanceFixture(config, {
      "docs/spec.md": "Ordinary prose.\n".repeat(80_000),
    });
    const result = await f.plan();
    expect(result.isErr()).toBe(false);
    if (result.isErr()) return;
    expect(result.value.violations.join("\n")).toContain("per-file limit");
    expect(result.value.total.files).toBe(1);
  }
});

test("invalid allowance paths and limits fail through production config before enumeration", async () => {
  for (const path of [
    "",
    "/absolute.md",
    "../escape.md",
    "a/../b.md",
    "./spec.md",
    "a//b.md",
    "docs/",
    "docs/*.md",
    "docs/?.md",
    "docs/[a].md",
    "a\\b.md",
    "C:/file.md",
    "~/file.md",
  ]) {
    const f = allowanceFixture(allowanceConfig(path, 2_000_000), {});
    const result = await f.plan();
    expect(result.isErr()).toBe(true);
    if (result.isErr())
      expect(result.error.message).toContain("invalid rr.toml");
  }
  for (const cap of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN]) {
    const config = allowanceConfig("spec.md", cap)
      .replace("Infinity", "inf")
      .replace("NaN", "nan");
    const f = allowanceFixture(config, {});
    expect((await f.plan()).isErr()).toBe(true);
  }
});

test("allowances preserve aggregate bytes, data bytes, chunks, share and blob gates", async () => {
  for (const [path, bytes, expected] of [
    ["spec.md", 40_000_001, "aggregate candidate bytes"],
    ["rows.json", 8_000_001, "aggregate data bytes"],
  ] as const) {
    const f = allowanceFixture(allowanceConfig(path, bytes), {
      [path]: bytes,
    });
    const result = await f.plan();
    expect(result.isErr()).toBe(false);
    if (result.isErr()) return;
    expect(result.value.total.bytes).toBe(bytes);
    expect(result.value.violations.join("\n")).toContain(expected);
  }
  const f = allowanceFixture(
    allowanceConfig("spec.md", 2_000_000, "max_est_chunks = 1"),
    {
      "spec.md": "Specification prose.\n".repeat(60_000),
      "blob.md": "a\0b",
    },
  );
  const result = await f.plan();
  expect(result.isErr()).toBe(false);
  if (result.isErr()) return;
  expect(result.value.violations.join("\n")).toContain("est_chunks");
  expect(result.value.violations.join("\n")).toContain(
    "aggregate candidate bytes",
  );
});

test("allowances reject directory and symlink aliases and never add excluded candidates", async () => {
  for (const target of ["directory", "alias", "escape"]) {
    const f = allowanceFixture(allowanceConfig("spec.md", 2_000_000), {});
    if (target === "directory") mkdirSync(join(f.root, "spec.md"));
    else {
      const destination =
        target === "escape" ? join(tmpdir(), "outside-spec.md") : "source.ts";
      symlinkSync(destination, join(f.root, "spec.md"));
    }
    expect((await f.plan()).isErr()).toBe(true);
  }
  const f = allowanceFixture(allowanceConfig("excluded.md", 2_000_000), {
    "source.ts": "const example = true;\n",
  });
  writeFileSync(
    join(f.root, "excluded.md"),
    "Excluded canonical prose.\n".repeat(60_000),
  );
  const result = await f.plan();
  expect(result.isErr()).toBe(false);
  if (result.isErr()) return;
  expect(result.value.files.map((file) => file.path)).toEqual(["source.ts"]);
});
