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
import { ReceiptSchema } from "../src/auto-reindex-receipt.ts";

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
