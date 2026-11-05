// P1: with a valid watermark a small change in a root larger than the budget is admitted with the
// estimate of the changed files; a first index, a missing or unreadable watermark and a changed
// settings file are charged as a full rebuild; the plan output says which of the two it used.
// Real ccc matcher and planner (read-only `rr index --plan`); the watermark is written by the
// test in its on-disk format because a real `rr index` needs the daemon.
import { afterAll, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import { settingsDigest } from "../src/index-basis.ts";

const ccc = Bun.which("ccc");
const router = join(import.meta.dir, "../src/repo-retrieve.ts");
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.invalid",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.invalid",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};
function git(root: string, ...args: string[]): string {
  const run = Bun.spawnSync(["git", "-C", root, ...args], { env: gitEnv });
  expect(run.stderr.toString()).toBe("");
  expect(run.exitCode).toBe(0);
  return run.stdout.toString().trim();
}
function commitAll(root: string) {
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "c");
}
const line = "A line of ordinary prose that fills a chunk.\n";
const chunkOfProse = line.repeat(18).slice(0, 800); // exactly one est_chunk

// 40 one-chunk files against a 20-chunk ceiling: a full rebuild is refused.
const FILES = 40;
const CEILING = 20;
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "rr-incr-"));
  roots.push(root);
  const home = join(root, ".home");
  mkdirSync(home);
  mkdirSync(join(root, ".cocoindex_code"));
  mkdirSync(join(root, "docs"));
  writeFileSync(
    join(root, ".cocoindex_code", "settings.yml"),
    "include_patterns:\n- '**/*.txt'\nexclude_patterns:\n- '**/.*'\n",
  );
  writeFileSync(
    join(root, ".cocoindex_code", "rr.toml"),
    `[index]\nmax_est_chunks = ${CEILING}\n`,
  );
  for (let i = 0; i < FILES; i++)
    writeFileSync(join(root, "docs", `f${i}.txt`), chunkOfProse);
  writeFileSync(join(root, ".gitignore"), ".home/\n.cocoindex_code/\n");
  git(root, "init", "-q");
  commitAll(root);
  const env = {
    HOME: home,
    XDG_STATE_HOME: join(home, "state"),
    COCOINDEX_CODE_DIR: join(home, ".cocoindex_code"),
    COCOINDEX_CODE_DB_PATH_MAPPING: "",
    REPO_RETRIEVE_AUTO_INDEX: "0",
  };
  return { root, env };
}
type Fixture = ReturnType<typeof fixture>;

async function certify(
  f: Fixture,
  overrides: { basis?: object | null; ccc?: string } = {},
) {
  const db = join(f.root, ".cocoindex_code");
  mkdirSync(join(db, "cocoindex.db"), { recursive: true });
  writeFileSync(join(db, "cocoindex.db", "data.mdb"), "memo");
  writeFileSync(join(db, "target_sqlite.db"), "chunks");
  const installed = await installedCcc();
  const basis =
    overrides.basis === undefined
      ? {
          ccc: overrides.ccc ?? installed,
          settings: await settingsDigestWith(f),
          dirty: [],
        }
      : overrides.basis;
  writeFileSync(
    join(db, "INDEXED_AT"),
    JSON.stringify({
      head: git(f.root, "rev-parse", "HEAD"),
      indexedAt: "2026-11-05T00:00:00.000Z",
      source: "index",
      ...(basis === null ? {} : { basis }),
    }),
  );
}
const settingsDigestWith = (f: Fixture) =>
  settingsDigest(f.root, f.env.COCOINDEX_CODE_DIR);
const installedCcc = async () =>
  (
    await new Response(Bun.spawn([ccc ?? "ccc", "version"]).stdout).text()
  ).trim();

const SummarySchema = z.object({
  charge: z.object({
    mode: z.string(),
    reason: z.string(),
    corpus: z.object({ est_chunks: z.number() }),
  }),
  total: z.object({ files: z.number(), est_chunks: z.number() }),
  violations: z.array(z.string()),
});

async function plan(f: Fixture) {
  const child = Bun.spawn({
    cmd: [process.execPath, router, "index", "--plan"],
    cwd: f.root,
    env: { ...process.env, ...f.env },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const parsed = jsonOf(SummarySchema).safeParse(
    stdout.split("\n").findLast((l) => l.includes('"type":"summary"')) ?? "",
  );
  expect(parsed.success).toBe(true);
  const summary = parsed.success
    ? parsed.data
    : {
        charge: { mode: "", reason: "", corpus: { est_chunks: -1 } },
        total: { files: -1, est_chunks: -1 },
        violations: [],
      };
  const charge = stderr.split("\n").find((l) => l.startsWith("CHARGE: ")) ?? "";
  return { code, stderr, summary, charge };
}

function expectFullRebuild(
  result: Awaited<ReturnType<typeof plan>>,
  reason: string,
) {
  // Never admitted at an incremental estimate: the whole root is charged and refused.
  expect(result.code).toBe(4);
  expect(result.summary.charge.mode).toBe("full");
  expect(result.summary.charge.reason).toContain(reason);
  expect(result.summary.total.est_chunks).toBe(FILES);
  expect(result.summary.total.est_chunks).toBe(
    result.summary.charge.corpus.est_chunks,
  );
  expect(result.charge).toStartWith("CHARGE: full rebuild (");
}

describe.skipIf(ccc === null)(
  "rr index --plan charges what ccc re-embeds",
  () => {
    test("a valid watermark charges only the changed files of a root larger than the budget", async () => {
      const f = fixture();
      await certify(f);
      // committed change, uncommitted edit, and a new untracked file; 37 files stay memo hits
      appendFileSync(join(f.root, "docs", "f0.txt"), "committed edit\n");
      commitAll(f.root);
      appendFileSync(join(f.root, "docs", "f1.txt"), "uncommitted edit\n");
      writeFileSync(join(f.root, "docs", "new.txt"), chunkOfProse);
      const result = await plan(f);
      expect(result.code).toBe(0);
      expect(result.summary.violations).toEqual([]);
      expect(result.summary.charge.mode).toBe("incremental");
      expect(result.summary.total.files).toBe(3);
      expect(result.summary.total.est_chunks).toBe(5); // f0 and f1 grew to 2 chunks each, new.txt is 1
      expect(result.summary.charge.corpus.est_chunks).toBeGreaterThan(CEILING);
      expect(result.charge).toStartWith(
        "CHARGE: incremental (3 of 41 included files",
      );
    });

    test("an unchanged root at a valid watermark is charged nothing", async () => {
      const f = fixture();
      await certify(f);
      const result = await plan(f);
      expect(result.code).toBe(0);
      expect(result.summary.charge.mode).toBe("incremental");
      expect(result.summary.total.est_chunks).toBe(0);
    });

    test("a file edited when the index ran and reverted since is still charged", async () => {
      const f = fixture();
      appendFileSync(join(f.root, "docs", "f2.txt"), "dirty at index time\n");
      const dirty = ["docs/f2.txt"];
      await certify(f, {
        basis: {
          ccc: (
            await new Response(
              Bun.spawn([ccc ?? "ccc", "version"]).stdout,
            ).text()
          ).trim(),
          settings: await settingsDigestWith(f),
          dirty,
        },
      });
      git(f.root, "checkout", "-q", "--", "docs/f2.txt");
      const result = await plan(f);
      expect(result.summary.charge.mode).toBe("incremental");
      expect(result.summary.total.files).toBe(1);
    });

    test("a first index (no watermark) is a full rebuild", async () => {
      const f = fixture();
      expectFullRebuild(await plan(f), "first index");
    });

    test("an unreadable watermark is a full rebuild", async () => {
      const f = fixture();
      await certify(f);
      writeFileSync(join(f.root, ".cocoindex_code", "INDEXED_AT"), "{not json");
      expectFullRebuild(await plan(f), "unreadable");
    });

    test("a changed settings file is a full rebuild", async () => {
      const f = fixture();
      await certify(f);
      appendFileSync(
        join(f.root, ".cocoindex_code", "settings.yml"),
        "- '**/*.nothing'\n",
      );
      expectFullRebuild(await plan(f), "settings changed");
    });

    test("a changed global settings file is a full rebuild", async () => {
      const f = fixture();
      await certify(f);
      mkdirSync(f.env.COCOINDEX_CODE_DIR, { recursive: true });
      writeFileSync(
        join(f.env.COCOINDEX_CODE_DIR, "global_settings.yml"),
        "embedding:\n  model: another\n",
      );
      expectFullRebuild(await plan(f), "settings changed");
    });

    test("a watermark without a recorded memo basis is a full rebuild", async () => {
      const f = fixture();
      await certify(f, { basis: null });
      expectFullRebuild(await plan(f), "predates the recorded memo basis");
    });

    test("a different installed ccc than the one that built the index is a full rebuild", async () => {
      const f = fixture();
      await certify(f, { ccc: "0.0.0-other" });
      const result = await plan(f);
      expectFullRebuild(result, "process_file's logic fingerprint may differ");
    });

    test("a changed .gitignore is a full rebuild", async () => {
      const f = fixture();
      await certify(f);
      // matches no file, so the corpus is unchanged: only the rule file itself changed
      appendFileSync(join(f.root, ".gitignore"), "no-such-file.txt\n");
      expectFullRebuild(await plan(f), ".gitignore");
    });

    test("a missing memo store is a full rebuild", async () => {
      const f = fixture();
      await certify(f);
      rmSync(join(f.root, ".cocoindex_code", "cocoindex.db"), {
        recursive: true,
      });
      expectFullRebuild(await plan(f), "memo store");
    });

    test("a history rewrite that drops the watermark HEAD is a full rebuild", async () => {
      const f = fixture();
      await certify(f);
      const db = join(f.root, ".cocoindex_code", "INDEXED_AT");
      writeFileSync(
        db,
        JSON.stringify({
          head: "0".repeat(40),
          indexedAt: "2026-11-05T00:00:00.000Z",
          source: "index",
          basis: {
            ccc: (
              await new Response(
                Bun.spawn([ccc ?? "ccc", "version"]).stdout,
              ).text()
            ).trim(),
            settings: await settingsDigestWith(f),
            dirty: [],
          },
        }),
      );
      expectFullRebuild(await plan(f), "cannot diff");
    });
  },
);
