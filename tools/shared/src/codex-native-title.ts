import { open, stat } from "node:fs/promises";
import type { BigIntStats } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { attempt } from "./attempt.ts";
import { jsonOf, z } from "./zod.ts";

const MAX_INDEX_BYTES = 2 * 1024 * 1024;
const MAX_TITLE_CODE_POINTS = 512;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const NativeIndexRow = z.object({
  id: z.string(),
  thread_name: z.unknown().optional(),
  updated_at: z.unknown().optional(),
});

export type CodexNativeTitleRead =
  | {
      kind: "known";
      sessionId: string;
      displayTitle: string;
      observedAt: string;
      sourceUpdatedAt: string;
    }
  | {
      kind: "unavailable";
      sessionId: string;
      reason: string;
      observedAt: string;
    };

function unavailable(sessionId: string, reason: string): CodexNativeTitleRead {
  return {
    kind: "unavailable",
    sessionId,
    reason,
    observedAt: Temporal.Now.instant().toString(),
  };
}

function sameFileState(left: BigIntStats, right: BigIntStats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function validTitle(value: string): boolean {
  if (value.trim().length === 0) return false;
  let codePoints = 0;
  for (const character of value) {
    codePoints += 1;
    if (codePoints > MAX_TITLE_CODE_POINTS) return false;
    const point = character.codePointAt(0);
    if (
      point === undefined ||
      point <= 0x1f ||
      (point >= 0x7f && point <= 0x9f) ||
      point === 0x2028 ||
      point === 0x2029
    )
      return false;
  }
  return true;
}

function parseRows(
  text: string,
): { ok: true; rows: Array<z.output<typeof NativeIndexRow>> } | { ok: false } {
  const rows: Array<z.output<typeof NativeIndexRow>> = [];
  for (const line of text.split("\n")) {
    if (line.length === 0) continue;
    const row = jsonOf(NativeIndexRow).safeParse(line);
    if (!row.success) return { ok: false };
    rows.push(row.data);
  }
  return { ok: true, rows };
}

/** Read one exact native Codex display title; this does not establish pane ownership. */
export async function readCodexNativeTitle(
  sessionId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CodexNativeTitleRead> {
  if (!UUID_PATTERN.test(sessionId))
    return unavailable(sessionId, "invalid session ID");

  const codexHome =
    env["CODEX_HOME"] ?? join(env["HOME"] ?? homedir(), ".codex");
  const path = join(codexHome, "session_index.jsonl");
  const readResult = await attempt(async (): Promise<CodexNativeTitleRead> => {
    const pathBefore = await stat(path, { bigint: true });
    if (!pathBefore.isFile())
      return unavailable(sessionId, "index is not a regular file");
    if (pathBefore.size > BigInt(MAX_INDEX_BYTES))
      return unavailable(sessionId, "index exceeds 2 MiB limit");

    await using handle = await open(path, "r");
    const descriptorBefore = await handle.stat({ bigint: true });
    if (!descriptorBefore.isFile())
      return unavailable(sessionId, "index is not a regular file");
    if (
      !sameFileState(pathBefore, descriptorBefore) ||
      descriptorBefore.size > BigInt(MAX_INDEX_BYTES)
    )
      return unavailable(sessionId, "index changed while opening");

    const initialSize = Number(descriptorBefore.size);
    const buffer = Buffer.alloc(initialSize + 1);
    const read = await handle.read(buffer, 0, buffer.length, 0);
    if (read.bytesRead > initialSize)
      return unavailable(sessionId, "index grew while reading");
    if (read.bytesRead !== initialSize)
      return unavailable(sessionId, "index changed while reading");

    const [descriptorAfter, pathAfter] = await Promise.all([
      handle.stat({ bigint: true }),
      stat(path, { bigint: true }),
    ]);
    if (
      !sameFileState(descriptorBefore, descriptorAfter) ||
      !sameFileState(descriptorBefore, pathAfter)
    )
      return unavailable(sessionId, "index changed while reading");

    const decoded = await attempt(() =>
      new TextDecoder("utf-8", { fatal: true }).decode(
        buffer.subarray(0, initialSize),
      ),
    );
    if (!decoded.ok) return unavailable(sessionId, "index is not valid UTF-8");

    const parsed = parseRows(decoded.value);
    if (!parsed.ok)
      return unavailable(sessionId, "index contains a malformed row");
    const matches = parsed.rows.filter((row) => row.id === sessionId);
    if (matches.length === 0)
      return unavailable(sessionId, "session ID is absent from index");
    if (matches.length !== 1)
      return unavailable(sessionId, "session ID is duplicated in index");

    const row = matches[0];
    const title = z.string().safeParse(row?.thread_name);
    if (row === undefined || !title.success || !validTitle(title.data))
      return unavailable(sessionId, "session title is invalid");
    const timestamp = z.iso.datetime().safeParse(row.updated_at);
    if (!timestamp.success)
      return unavailable(sessionId, "session timestamp is invalid");

    return {
      kind: "known",
      sessionId,
      displayTitle: title.data,
      observedAt: Temporal.Now.instant().toString(),
      sourceUpdatedAt: timestamp.data,
    };
  });
  if (!readResult.ok)
    return unavailable(sessionId, "native index is missing or unreadable");
  return readResult.value;
}
