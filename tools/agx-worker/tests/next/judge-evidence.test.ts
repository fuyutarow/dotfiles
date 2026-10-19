import { afterAll, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

import { jsonOf, z } from "../../../shared/src/zod.ts";
const Judgment = jsonOf(
  z.object({
    decision: z.string(),
    note: z.string(),
    evidence: z
      .array(
        z.object({ path: z.string(), sha256: z.string(), content: z.string() }),
      )
      .optional(),
  }),
);
function judgment(text: string) {
  const result = Judgment.safeParse(text);
  if (!result.success) return expect.unreachable(result.error.message);
  return result.data;
}
const root = await mkdtemp(join(tmpdir(), "judge-evidence-"));
const records = join(root, "records.jsonl");
const cli = resolve(import.meta.dir, "../../src/next/cli.ts");
const id = "evidence-fixture";
const base = `${JSON.stringify({ kind: "started", id, at: "2026-10-17T00:00:00Z", ticket: "fixture", writes: [], cwd: root, workspace: root, row: "fixture", dispatcher_session: null, vendor_session: null, pid: 0 })}\n${JSON.stringify({ kind: "ended", id, at: "2026-10-17T00:01:00Z", exit: 1, report_path: null, vendor_session: null, verify: [] })}\n`;
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});
async function judge(args: string[]) {
  const child = Bun.spawn([process.execPath, cli, "judge", id, ...args], {
    env: { ...process.env, AGX_NEXT_STATE_DIR: root },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10_000,
  });
  const [stdout, stderr, exit] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);
  return { stdout, stderr, exit };
}
test("repeatable evidence appends exactly one opaque judgment with byte digests and contents", async () => {
  await writeFile(records, base);
  const contents = [
    '{"bits":[{"id":"a","p":0.1,"reason":"no"}]}\n',
    "\uFEFFopaque evidence 世界\r\n",
  ];
  const paths = contents.map((_, i) => join(root, `evidence-${i}.txt`));
  await Promise.all(paths.map((p, i) => writeFile(p, contents[i] ?? "")));
  const result = await judge([
    "accept",
    "--evidence",
    paths[0]!,
    "--evidence",
    paths[1]!,
  ]);
  expect(result.exit).toBe(0);
  const lines = (await readFile(records, "utf8")).trimEnd().split("\n");
  expect(lines).toHaveLength(3);
  const event = judgment(lines[2]!);
  expect(event.decision).toBe("accept");
  expect(event.evidence).toEqual(
    paths.map((path, i) => ({
      path,
      sha256: createHash("sha256").update(contents[i]!).digest("hex"),
      content: contents[i]!,
    })),
  );
});
test("missing evidence appends no partial judgment", async () => {
  await writeFile(records, base);
  const result = await judge([
    "reject",
    "--evidence",
    join(root, "evidence-0.txt"),
    "--evidence",
    join(root, "missing"),
  ]);
  expect(result.exit).toBe(2);
  expect(await readFile(records, "utf8")).toBe(base);
});
test("judging without evidence retains existing behavior", async () => {
  await writeFile(records, base);
  expect((await judge(["reject", "--note", "manual"])).exit).toBe(0);
  const event = judgment(
    (await readFile(records, "utf8")).trimEnd().split("\n")[2]!,
  );
  expect(event.note).toBe("manual");
  expect(event.evidence).toBeUndefined();
});
