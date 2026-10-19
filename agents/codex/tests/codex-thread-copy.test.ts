import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyThread } from "../../../tools/codex-thread-copy/src/codex-thread-copy.ts";
import { newestThread } from "../../../tools/codex-thread-copy/src/threads.ts";

const roots: string[] = [];
const cwd = "/work/current";
const currentId = "019a0000-0000-7000-8000-000000000001";
const otherId = "019a0000-0000-7000-8000-000000000002";

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

async function sessions(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "codex-thread-copy-"));
  roots.push(root);
  return root;
}

async function rollout(
  root: string,
  filename: string,
  id: string,
  recordedCwd: string,
  timestamp: string,
): Promise<void> {
  const directory = join(root, "2026", "10", "19");
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, filename),
    `${JSON.stringify({
      timestamp,
      type: "session_meta",
      payload: { session_id: id, id, cwd: recordedCwd, timestamp },
    })}\n{"type":"event_msg"}\n`,
  );
}

test("selects newest matching cwd by the recorded session timestamp", async () => {
  const root = await sessions();
  await rollout(
    root,
    "rollout-old.jsonl",
    currentId,
    cwd,
    "2026-10-19T10:00:00.000Z",
  );
  await rollout(
    root,
    "rollout-newer-other.jsonl",
    otherId,
    "/work/other",
    "2026-10-19T12:00:00.000Z",
  );
  const newestId = "019a0000-0000-7000-8000-000000000003";
  await rollout(
    root,
    "rollout-new.jsonl",
    newestId,
    cwd,
    "2026-10-19T11:00:00.000Z",
  );

  expect((await newestThread(root, cwd))?.id).toBe(newestId);
  expect((await newestThread(root, cwd, true))?.id).toBe(otherId);
});

test("rejects malformed and mismatched metadata instead of copying a false id", async () => {
  const root = await sessions();
  const directory = join(root, "2026", "10", "19");
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "rollout-invalid.jsonl"),
    `${JSON.stringify({ type: "session_meta", payload: { session_id: "not-a-thread-id", id: "not-a-thread-id", cwd, timestamp: "2026-10-19T10:00:00.000Z" } })}\n`,
  );
  await writeFile(
    join(directory, "rollout-mismatch.jsonl"),
    `${JSON.stringify({ type: "session_meta", payload: { session_id: currentId, id: otherId, cwd, timestamp: "2026-10-19T10:00:00.000Z" } })}\n`,
  );

  expect(await newestThread(root, cwd)).toBeUndefined();
});

test("copies and prints the same id, and exits 1 with a reason when none matches", async () => {
  const root = await sessions();
  await rollout(
    root,
    "rollout-match.jsonl",
    currentId,
    cwd,
    "2026-10-19T10:00:00.000Z",
  );
  const copied: string[] = [];
  const printed: string[] = [];
  const errors: string[] = [];
  const copy = (id: string) => {
    copied.push(id);
    return Promise.resolve(0);
  };
  const write = (id: string) => {
    printed.push(id);
  };
  const error = (message: string) => {
    errors.push(message);
  };

  expect(
    await copyThread(
      { sessionsDirectory: root, cwd, anywhere: false },
      copy,
      write,
      error,
    ),
  ).toBe(0);
  expect(copied).toEqual([currentId]);
  expect(printed).toEqual([currentId]);
  expect(errors).toEqual([]);

  const noMatch = await copyThread(
    { sessionsDirectory: root, cwd: "/work/missing", anywhere: false },
    copy,
    write,
    error,
  );
  expect(noMatch).toBe(1);
  expect(errors).toEqual(["no Codex thread found for /work/missing"]);
  expect(copied).toEqual([currentId]);
});
