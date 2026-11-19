import { attempt } from "../../../tools/shared/src/attempt.ts";
import { afterEach, expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  copyThread,
  copyToClipboard,
} from "../../../tools/codex-thread-copy/src/codex-thread-copy.ts";
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
    return Promise.resolve(null);
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

// The outcome of `run` with PATH narrowed to `dir`; a throw is returned, not rethrown.
async function withPath<T>(
  dir: string,
  run: () => Promise<T>,
): Promise<unknown> {
  const saved = process.env["PATH"];
  process.env["PATH"] = dir;
  const result = await attempt(run);
  if (saved === undefined) delete process.env["PATH"];
  else process.env["PATH"] = saved;
  return result.ok ? result.value : result.error;
}

test("copyToClipboard pipes the id to the smart-copy command on PATH", async () => {
  const root = await sessions();
  const capture = join(root, "stdin.txt");
  await writeFile(join(root, "smart-copy"), `#!/bin/sh\ncat > "${capture}"\n`);
  await chmod(join(root, "smart-copy"), 0o755);
  expect(await withPath(root, () => copyToClipboard(currentId))).toBeNull();
  expect(await readFile(capture, "utf8")).toBe(currentId);
});

test("copyToClipboard reports smart-copy's own stderr when it fails", async () => {
  const root = await sessions();
  await writeFile(
    join(root, "smart-copy"),
    "#!/bin/sh\ncat > /dev/null\necho 'smart-copy: native: no clipboard tool' >&2\nexit 1\n",
  );
  await chmod(join(root, "smart-copy"), 0o755);
  expect(await withPath(root, () => copyToClipboard(currentId))).toBe(
    "smart-copy: native: no clipboard tool",
  );
});

test("copyToClipboard names the install step when smart-copy is not on PATH", async () => {
  const root = await sessions();
  expect(await withPath(root, () => copyToClipboard(currentId))).toBe(
    "smart-copy is not on PATH; run mise run deps in the dotfiles checkout",
  );
});
