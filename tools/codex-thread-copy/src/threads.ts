import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { attempt } from "@dotfiles/shared/src/attempt.ts";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";

const sessionMetaSchema = z.object({
  type: z.literal("session_meta"),
  payload: z.object({
    session_id: z.string(),
    id: z.string(),
    cwd: z.string(),
    timestamp: z.string(),
  }),
});

const threadIdPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu;

export type CodexThread = {
  id: string;
  cwd: string;
  timestamp: number;
};

async function firstLine(path: string): Promise<string | undefined> {
  const input = createReadStream(path, "utf8");
  const lines = createInterface({ input });
  for await (const line of lines) {
    lines.close();
    input.destroy();
    return line;
  }
  lines.close();
  input.destroy();
  return undefined;
}

async function readThread(path: string): Promise<CodexThread | undefined> {
  const first = await attempt(() => firstLine(path));
  if (!first.ok || first.value === undefined) return undefined;
  const parsed = jsonOf(sessionMetaSchema).safeParse(first.value);
  if (!parsed.success) return undefined;
  const { session_id, id, cwd, timestamp } = parsed.data.payload;
  if (session_id !== id || !threadIdPattern.test(session_id)) return undefined;
  const instant = await attempt(
    () => Temporal.Instant.from(timestamp).epochMilliseconds,
  );
  if (!instant.ok) return undefined;
  return { id: session_id, cwd, timestamp: instant.value };
}

async function rolloutFiles(directory: string): Promise<string[]> {
  const result = await attempt(() =>
    readdir(directory, { withFileTypes: true }),
  );
  if (!result.ok) return [];
  const paths = await Promise.all(
    result.value.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return rolloutFiles(path);
      if (entry.isFile() && /^rollout-.*\.jsonl$/u.test(entry.name))
        return [path];
      return [];
    }),
  );
  return paths.flat();
}

function newerThread(
  candidate: CodexThread | undefined,
  current: CodexThread | undefined,
  cwd: string,
  anywhere: boolean,
): CodexThread | undefined {
  const matches =
    candidate !== undefined && (anywhere || candidate.cwd === cwd);
  const isNewer =
    matches &&
    (current === undefined || candidate.timestamp > current.timestamp);
  return isNewer ? candidate : current;
}

export async function newestThread(
  sessionsDirectory: string,
  cwd: string,
  anywhere = false,
): Promise<CodexThread | undefined> {
  const files = await rolloutFiles(sessionsDirectory);
  let newest: CodexThread | undefined;
  for (let offset = 0; offset < files.length; offset += 16) {
    const batch = await Promise.all(
      files.slice(offset, offset + 16).map((path) => readThread(path)),
    );
    for (const thread of batch)
      newest = newerThread(thread, newest, cwd, anywhere);
  }
  return newest;
}
