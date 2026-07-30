#!/usr/bin/env bun
// Fixture for ccc-swap.test.ts — stands in for the real `ccc` binary so build/cutover/rollback
// logic can be exercised end-to-end without a real embedding model, network access, or GPU.
//
// Mimics exactly the slice of `ccc` 0.2.39 behavior ccc-swap.ts depends on:
//   - `ccc index`: honors COCOINDEX_CODE_DB_PATH_MAPPING + cwd the same way the real daemon
//     resolves them (settings.py resolve_db_dir/target_sqlite_db_path — see ccc-swap.ts's file
//     header) and writes a target_sqlite.db under the mapped directory carrying the same DDL
//     shape ccc-swap.ts's computeIndexDimension/countIndexedRows read: a `code_chunks_vec` table
//     whose CREATE text contains `embedding float[N]`, and a plain `code_chunks_vec_rowids`
//     table with one row per fake chunk (real vec0 is a virtual table needing the sqlite-vec
//     extension, which bun:sqlite does not load — a plain table is enough to exercise the exact
//     read path this tool uses, without a native extension dependency). Prints the same
//     "Chunks: N" / "Files: N" stdout lines cli.py's print_index_stats emits.
//   - `ccc daemon stop`: no-op, prints "Daemon stopped." (the real daemon.py path is a whole
//     multiprocessing listener — irrelevant to what ccc-swap.ts parses or relies on).
//
// FAKE_CCC_FAIL=<substring> -> a `ccc index` call whose cwd contains that substring exits 1,
//   simulating one project's indexing failure without derailing the others.
// FAKE_CCC_HANG=1 -> `ccc index` never exits, proving ccc-swap.ts's AbortSignal.timeout path.
// FAKE_CCC_CHUNKS=<n> -> chunk count written/reported (default 3).
// FAKE_CCC_DIM=<n> -> embedding dimension written into the DDL (default 768).

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";

function parseDbPathMapping(
  raw: string | undefined,
): Array<{ source: string; target: string }> {
  if (!raw) return [];
  return raw
    .split(",")
    .filter(Boolean)
    .map((entry) => {
      const [source, target] = entry.split("=");
      return { source: source ?? "", target: target ?? "" };
    });
}

function resolveDbDir(cwd: string): string {
  for (const m of parseDbPathMapping(
    process.env.COCOINDEX_CODE_DB_PATH_MAPPING,
  )) {
    if (cwd === m.source || cwd.startsWith(`${m.source}/`)) {
      const rel = cwd.slice(m.source.length).replace(/^\//, "");
      return rel ? join(m.target, rel) : m.target;
    }
  }
  return join(cwd, ".cocoindex_code");
}

const [, , command, sub] = Bun.argv;

if (command === "daemon" && sub === "stop") {
  process.stdout.write("Daemon stopped.\n");
  process.exit(0);
}

if (command === "index") {
  const cwd = process.cwd();

  if (process.env.FAKE_CCC_FAIL && cwd.includes(process.env.FAKE_CCC_FAIL)) {
    process.stderr.write("fake ccc: simulated indexing failure\n");
    process.exit(1);
  }
  if (process.env.FAKE_CCC_HANG === "1") {
    // Never resolves — proves the caller's AbortSignal.timeout is what ends this, not a
    // hand-rolled setTimeout in the fixture.
    await new Promise(() => {});
  }

  const dbDir = resolveDbDir(cwd);
  mkdirSync(dbDir, { recursive: true });
  const dim = process.env.FAKE_CCC_DIM ?? "768";
  const chunkCount = Number(process.env.FAKE_CCC_CHUNKS ?? "3");

  const db = new Database(join(dbDir, "target_sqlite.db"), { create: true });
  db.run(
    `CREATE TABLE IF NOT EXISTS code_chunks_vec (id INTEGER primary key, embedding float[${dim}])`,
  );
  db.run(
    "CREATE TABLE IF NOT EXISTS code_chunks_vec_rowids (rowid INTEGER PRIMARY KEY, id INTEGER)",
  );
  db.run("DELETE FROM code_chunks_vec_rowids");
  for (let i = 0; i < chunkCount; i += 1) {
    db.run("INSERT INTO code_chunks_vec_rowids (id) VALUES (?)", [i]);
  }
  db.close();

  process.stdout.write(`Project: ${cwd}\n`);
  process.stdout.write("\nIndex stats:\n");
  process.stdout.write(`  Chunks: ${chunkCount}\n`);
  process.stdout.write(
    `  Files:  ${Math.max(1, Math.round(chunkCount / 3))}\n`,
  );
  process.exit(0);
}

process.stderr.write(
  `fake ccc: unrecognized invocation: ${Bun.argv.slice(2).join(" ")}\n`,
);
process.exit(1);
