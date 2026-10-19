import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { jsonOf, z } from "../../shared/src/zod.ts";

const Metadata = jsonOf(
  z.object({
    type: z.literal("session_meta"),
    payload: z.object({
      cwd: z.string(),
      originator: z.literal("codex-tui"),
      session_id: z.string().optional(),
      id: z.string().optional(),
    }),
  }),
);

function dayPaths(root: string, today: Temporal.PlainDate) {
  let { year, month, day } = today;
  return Array.from({ length: 367 }, () => {
    const path = join(
      root,
      String(year),
      String(month).padStart(2, "0"),
      String(day).padStart(2, "0"),
    );
    day--;
    if (day === 0) {
      const previous = Temporal.PlainYearMonth.from({ year, month }).subtract({
        months: 1,
      });
      year = previous.year;
      month = previous.month;
      day = previous.daysInMonth;
    }
    return path;
  });
}

/** New rollout files change their day's directory, including a newly created day. */
export async function codexDiscoveryStamp(
  root = join(process.env.HOME ?? "", ".codex", "sessions"),
  today = Temporal.Now.plainDateISO(),
) {
  return Promise.all(
    dayPaths(root, today).map(async (path) => {
      const info = await stat(path).catch(() => null);
      return [path, info?.mtimeMs, info?.ctimeMs, info?.ino];
    }),
  );
}

/** Include file mtimes: appending an older rollout can change the newest match. */
export async function codexRolloutSnapshot(
  root = join(process.env.HOME ?? "", ".codex", "sessions"),
  today = Temporal.Now.plainDateISO(),
) {
  const days = await Promise.all(
    dayPaths(root, today).map(async (dir) => {
      const names = await readdir(dir).catch(() => []);
      const files = await Promise.all(
        names
          .filter(
            (name) => name.startsWith("rollout-") && name.endsWith(".jsonl"),
          )
          .map(async (name) => {
            const path = join(dir, name);
            const info = await stat(path).catch(() => null);
            return info?.isFile() === true
              ? {
                  path,
                  mtimeMs: info.mtimeMs,
                  ctimeMs: info.ctimeMs,
                  size: info.size,
                  ino: info.ino,
                }
              : null;
          }),
      );
      return files
        .filter((file) => file !== null)
        .toSorted((a, b) => {
          const difference = b.mtimeMs - a.mtimeMs;
          return difference === 0 ? a.path.localeCompare(b.path) : difference;
        })
        .slice(0, 100);
    }),
  );
  return days.flat();
}

// Identity is in the first JSONL record. Never read turn/settings events: a
// cold statusline settings scan can consume seconds of CPU for this one ID.
async function metadata(path: string) {
  const file = Bun.file(path);
  const chunks: string[] = [];
  for (let offset = 0; offset < 4 * 1024 * 1024; offset += 64 * 1024) {
    const chunk = await file.slice(offset, offset + 64 * 1024).text();
    const newline = chunk.indexOf("\n");
    chunks.push(newline < 0 ? chunk : chunk.slice(0, newline));
    if (newline >= 0) return Metadata.safeParse(chunks.join(""));
    if (chunk.length === 0) break;
  }
  return null;
}

/** Match statusline's newest interactive rollout selection, reading identity only. */
export async function findCodexSessionId(
  cwd: string,
  root = join(process.env.HOME ?? "", ".codex", "sessions"),
  today = Temporal.Now.plainDateISO(),
  snapshot?: Awaited<ReturnType<typeof codexRolloutSnapshot>>,
): Promise<string | undefined> {
  for (const candidate of snapshot ??
    (await codexRolloutSnapshot(root, today))) {
    const parsed = await metadata(candidate.path).catch(() => null);
    if (parsed?.success === true && parsed.data.payload.cwd === cwd)
      return parsed.data.payload.session_id ?? parsed.data.payload.id;
  }
  return undefined;
}
