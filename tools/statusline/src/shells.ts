import { opendir, open, readlink, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { dur } from "./jobs.ts";
import { z } from "./zod.ts";

const PID_LIMIT = 8192;
const FD_LIMIT = 256;
const TASK_LIMIT = 2048;
export type ShellScan =
  | { kind: "known"; rows: { id: string; seconds: number }[] }
  | { kind: "unknown" };
const unknown: ShellScan = { kind: "unknown" };
const errorSchema = z.object({ code: z.string().optional() });

async function entries(
  path: string,
  limit: number,
): Promise<string[] | undefined> {
  const dir = await opendir(path);
  const names: string[] = [];
  for await (const item of dir) {
    names.push(item.name);
    if (names.length > limit) return undefined;
  }
  return names;
}
function gone(error: unknown): boolean {
  const parsed = errorSchema.safeParse(error);
  return parsed.success && parsed.data.code === "ENOENT";
}

/** Read only same-UID proc entries. Any incomplete scan is unknown, never an empty result. */
export async function scanShells(
  cwd: string | undefined,
  session: string | undefined,
  options: { proc?: string; temp?: string; uid?: number; now?: number } = {},
): Promise<ShellScan> {
  const uid = options.uid ?? process.getuid?.();
  if (
    uid === undefined ||
    cwd === undefined ||
    session === undefined ||
    !/^[a-zA-Z0-9-]+$/u.test(session)
  )
    return unknown;
  const proc = options.proc ?? "/proc";
  const slug = cwd.replaceAll(/[^a-zA-Z0-9]/gu, "-");
  const taskDir = join(
    options.temp ?? tmpdir(),
    `claude-${uid}`,
    slug,
    session,
    "tasks",
  );
  const work = async (): Promise<ShellScan> => {
    const names = await entries(taskDir, TASK_LIMIT);
    const processes = await entries(proc, PID_LIMIT);
    if (names === undefined || processes === undefined) return unknown;
    const taskSet = new Set(
      names.filter((name) => /^[a-zA-Z0-9-]+\.output$/u.test(name)),
    );
    const pids = processes.filter((name) => /^\d+$/u.test(name));
    const found = new Set<string>();
    for (let offset = 0; offset < pids.length; offset += 32) {
      const outcomes = await Promise.all(
        pids.slice(offset, offset + 32).map(async (pid) => {
          const base = join(proc, pid);
          return Promise.try(async () => {
            if ((await stat(base)).uid !== uid) return true;
            const fds = await entries(join(base, "fd"), FD_LIMIT);
            if (fds === undefined) return false;
            const results = await Promise.all(
              fds.map(async (fd) =>
                Promise.try(async () => {
                  const target = await readlink(join(base, "fd", fd));
                  const name = target.startsWith(`${taskDir}/`)
                    ? target.slice(taskDir.length + 1)
                    : "";
                  if (!taskSet.has(name)) return true;
                  await using handle = await open(
                    join(base, "fdinfo", fd),
                    "r",
                  );
                  const buffer = Buffer.alloc(4096);
                  const read = await handle.read(buffer, 0, buffer.length, 0);
                  if (read.bytesRead === buffer.length) return false;
                  const info = buffer.toString("utf8", 0, read.bytesRead);
                  const flags = /^flags:\s+([0-7]+)/mu.exec(info)?.[1];
                  if (flags === undefined) return false;
                  if ((Number.parseInt(flags, 8) & 3) !== 0) found.add(name);
                  return true;
                }).catch(gone),
              ),
            );
            return results.every(Boolean);
          }).catch(gone);
        }),
      );
      if (!outcomes.every(Boolean)) return unknown;
    }
    const now = options.now ?? Temporal.Now.instant().epochMilliseconds;
    const rows = await Promise.all(
      [...found].map(async (name) => {
        const birth = (await stat(join(taskDir, name))).birthtimeMs;
        if (!Number.isFinite(birth) || birth <= 0 || birth > now) return null;
        return {
          id: name.slice(0, -7),
          seconds: Math.floor((now - birth) / 1000),
        };
      }),
    );
    if (rows.some((row) => row === null)) return unknown;
    return {
      kind: "known",
      rows: rows
        .filter((row) => row !== null)
        .toSorted((a, b) => b.seconds - a.seconds),
    };
  };
  return work().catch(() => unknown);
}
export function shellLines(scan: ShellScan): string {
  if (scan.kind === "unknown") return "shells: unknown";
  return scan.rows
    .map((row) => `shell ${dur(row.seconds)} ${row.id}`)
    .join("\n");
}
