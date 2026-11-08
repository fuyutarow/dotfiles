import { expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "@dotfiles/shared/src/zod.ts";
import { decodedJson } from "../../../agents/hooks/tests/decode.ts";
import {
  AUTO_REINDEX_RECEIPT_RETENTION,
  ReceiptSchema,
  superviseAutoReindex,
} from "../src/auto-reindex-receipt.ts";

const modulePath = join(import.meta.dir, "../src/ccc-index.ts");
const receiptModule = join(import.meta.dir, "../src/auto-reindex-receipt.ts");
const router = join(import.meta.dir, "../src/repo-retrieve.ts");

test("auto-reindex supervisor retains each outcome and status displays the last", async () => {
  const root = await mkdtemp(join(tmpdir(), "rr-receipts-"));
  const db = join(root, ".cocoindex_code");
  await mkdir(db);
  await writeFile(join(db, "settings.yml"), "include_patterns: []\n");
  const bin = join(root, "bin");
  await mkdir(bin);
  await writeFile(join(bin, "ccc"), "#!/bin/sh\nexit 1\n");
  await chmod(join(bin, "ccc"), 0o755);
  await writeFile(join(bin, "git"), "#!/bin/sh\nprintf 'fixture-head\\n'\n");
  await chmod(join(bin, "git"), 0o755);
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env["PATH"] ?? ""}`,
    HOME: root,
    COCOINDEX_CODE_DB_PATH_MAPPING: `${root}=${join(root, ".local/share/cocoindex-code/db")}`,
  };
  const dbDir = join(root, ".local/share/cocoindex-code/db");
  await mkdir(dbDir, { recursive: true });
  for (const code of [7, 0]) {
    const script = `import { superviseAutoReindex } from ${JSON.stringify(receiptModule)}; process.exitCode = await superviseAutoReindex(${JSON.stringify(dbDir)}, [process.execPath, '-e', ${JSON.stringify(`process.stderr.write('fixture-${code}'); process.exit(${code})`)}]);`;
    const child = Bun.spawn([process.execPath, "-e", script], {
      cwd: root,
      env,
      stdout: "ignore",
      stderr: "pipe",
    });
    const [exit, stderr] = await Promise.all([
      child.exited,
      new Response(child.stderr).text(),
    ]);
    expect(stderr).toBe("");
    expect(exit).toBe(code);
    const files = (await readdir(dbDir)).filter((name) =>
      name.endsWith(".json"),
    );
    expect(files.length).toBe(code === 7 ? 1 : 2);
    const receipts = await Promise.all(
      files.map(async (name) =>
        decodedJson(ReceiptSchema, await readFile(join(dbDir, name), "utf8")),
      ),
    );
    const receipt = receipts.find((item) => item.pid === child.pid);
    expect(receipt).toMatchObject({
      pid: child.pid,
      requestedHead: "fixture-head",
      exitCode: code,
      stderrTail: `fixture-${code}`,
    });
    expect(receipt?.startedAt).toBeTruthy();
    expect(receipt?.endedAt).toBeTruthy();
  }
  const status = Bun.spawn([process.execPath, router, "index", "--status"], {
    cwd: root,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exit, stdout] = await Promise.all([
    status.exited,
    new Response(status.stdout).text(),
    new Response(status.stderr).text(),
  ]);
  expect(exit).toBe(0);
  expect(stdout).toContain("auto_reindex_exit=0");
  expect(stdout).toContain('auto_reindex_stderr="fixture-0"');
});

test("real auto-reindex launch is nonblocking, records failure, and remains rate limited", async () => {
  const root = await mkdtemp(join(tmpdir(), "rr-auto-launch-"));
  const db = join(root, ".cocoindex_code");
  await mkdir(db);
  await writeFile(join(db, "settings.yml"), "include_patterns: []\n");
  const env = {
    ...process.env,
    HOME: root,
    COCOINDEX_CODE_DB_PATH_MAPPING: "",
    PATH: "/nonexistent",
  };
  const script = `import { requestAutoReindex } from ${JSON.stringify(modulePath)}; const a = await requestAutoReindex(${JSON.stringify(root)}); const b = await requestAutoReindex(${JSON.stringify(root)}); process.stdout.write(JSON.stringify([a._unsafeUnwrap(), b._unsafeUnwrap()]));`;
  const launcher = Bun.spawn([process.execPath, "-e", script], {
    cwd: root,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exit, output] = await Promise.all([
    launcher.exited,
    new Response(launcher.stdout).text(),
    new Response(launcher.stderr).text(),
  ]);
  expect(exit).toBe(0);
  const [first, second] = decodedJson(
    z.tuple([
      z.object({ started: z.boolean(), pid: z.number() }),
      z.object({ started: z.boolean() }),
    ]),
    output,
  );
  expect(first.started).toBe(true);
  expect(second.started).toBe(false);
  let files: string[] = [];
  for (let i = 0; i < 100; i++) {
    files = (await readdir(db)).filter(
      (name) =>
        name.startsWith("AUTO_REINDEX_RECEIPT-") && name.endsWith(".json"),
    );
    if (files.length > 0) break;
    await Bun.sleep(50);
  }
  expect(files.length).toBe(1);
  const receipt = decodedJson(
    ReceiptSchema,
    await readFile(join(db, files[0] ?? "missing"), "utf8"),
  );
  expect(receipt.pid).toBe(first.pid);
  expect(receipt.exitCode).not.toBe(0);
  expect(receipt.stderrTail.length).toBeGreaterThan(0);
});

test("writing a receipt keeps only the newest retention count and leaves other files alone", async () => {
  const root = await mkdtemp(join(tmpdir(), "rr-receipt-retention-"));
  const dbDir = join(root, "db");
  await mkdir(dbDir);
  const k = AUTO_REINDEX_RECEIPT_RETENTION;
  const fixtureNames: string[] = [];
  // K+2 older fixtures plus the supervisor's own write make K+3 receipts in total.
  // endedAt strictly increases with the index.
  for (let i = 0; i < k + 2; i++) {
    const name = `AUTO_REINDEX_RECEIPT-fixture-${String(i).padStart(3, "0")}.json`;
    fixtureNames.push(name);
    await writeFile(
      join(dbDir, name),
      `${JSON.stringify({
        startedAt: "2020-01-01T00:00:00Z",
        pid: 1000 + i,
        requestedHead: "fixture-head",
        endedAt: `2020-01-01T00:${String(i).padStart(2, "0")}:00Z`,
        exitCode: 0,
        stderrTail: "",
      })}\n`,
    );
  }
  await writeFile(join(dbDir, "settings.yml"), "keep: true\n");
  await writeFile(join(dbDir, "AUTO_REINDEX_RECEIPT-x.json.tmp"), "partial");
  // One real write through the supervisor: its receipt is the newest.
  const exitCode = await superviseAutoReindex(dbDir, [
    process.execPath,
    "-e",
    "process.exit(0)",
  ]);
  expect(exitCode).toBe(0);
  const remaining = (await readdir(dbDir)).toSorted();
  const receiptNames = remaining.filter(
    (name) =>
      name.startsWith("AUTO_REINDEX_RECEIPT-") && name.endsWith(".json"),
  );
  expect(receiptNames.length).toBe(k);
  // The oldest three fixtures are removed; the newest K-1 fixtures survive.
  for (const name of fixtureNames.slice(0, 3))
    expect(remaining).not.toContain(name);
  for (const name of fixtureNames.slice(3)) expect(remaining).toContain(name);
  // Non-receipt files are untouched.
  expect(remaining).toContain("settings.yml");
  expect(remaining).toContain("AUTO_REINDEX_RECEIPT-x.json.tmp");
  // The latest receipt is the one the supervisor just wrote.
  const latest = decodedJson(
    ReceiptSchema,
    await readFile(
      join(
        dbDir,
        receiptNames.find((name) => !fixtureNames.includes(name)) ?? "missing",
      ),
      "utf8",
    ),
  );
  expect(latest.exitCode).toBe(0);
  expect(latest.endedAt > "2020").toBe(true);
});
