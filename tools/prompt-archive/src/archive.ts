import { createHash } from "node:crypto";
import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { type Attempt } from "../../shared/src/attempt.ts";
import { jsonText, z } from "../../shared/src/zod.ts";

type JsonRecord = Record<string, unknown>;
type Vendor = "claude" | "codex";

const recordSchema = z.record(z.string(), z.unknown());
const errorCodeSchema = z.object({ code: z.string() });

type InputRecord = {
  vendor: Vendor;
  session: string;
  timestamp: string;
  month: string;
  textHash: string;
  archived: JsonRecord;
};

export type ArchiveOptions = {
  claudeHistory?: string;
  codexHistory?: string;
  dataHome?: string;
};

export type ArchiveResult = {
  archived: number;
  skipped: number;
};

function timestampParts(
  value: unknown,
): { key: string; month: string } | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  if (typeof value === "number" && !Number.isFinite(value)) return undefined;
  if (typeof value === "string") {
    if (!z.iso.datetime().safeParse(value).success) return undefined;
    const month = String(Temporal.Instant.from(value)).slice(0, 7);
    return { key: value, month };
  }
  const milliseconds = value < 1e12 ? value * 1000 : value;
  if (Math.abs(milliseconds) > 8.64e15) return undefined;
  const month = String(
    Temporal.Instant.fromEpochMilliseconds(milliseconds),
  ).slice(0, 7);
  return { key: String(value), month };
}

function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function parseInput(vendor: Vendor, value: unknown): InputRecord | undefined {
  const record = recordSchema.safeParse(value);
  if (!record.success) return undefined;
  const data = record.data;
  const isClaude = vendor === "claude";
  const sessionValue = isClaude ? data.sessionId : data.session_id;
  const timestampValue = isClaude ? data.timestamp : data.ts;
  const textValue = isClaude ? data.display : data.text;
  if (typeof sessionValue !== "string" || typeof textValue !== "string")
    return undefined;
  const date = timestampParts(timestampValue);
  if (date === undefined) return undefined;
  const text = isClaude
    ? JSON.stringify([textValue, data.pastedContents ?? null])
    : textValue;
  return {
    vendor,
    session: sessionValue,
    timestamp: date.key,
    month: date.month,
    textHash: hashText(text),
    archived: { ...data, vendor },
  };
}

function dedupKey(
  record: Pick<InputRecord, "vendor" | "session" | "timestamp" | "textHash">,
): string {
  return JSON.stringify([
    record.vendor,
    record.session,
    record.timestamp,
    record.textHash,
  ]);
}

function parseArchived(value: unknown): InputRecord | undefined {
  const record = recordSchema.safeParse(value);
  if (
    !record.success ||
    (record.data.vendor !== "claude" && record.data.vendor !== "codex")
  )
    return undefined;
  return parseInput(record.data.vendor, record.data);
}

async function readJsonLines(
  path: string,
): Promise<Attempt<{ records: unknown[]; skipped: number }>> {
  return Promise.try(() => readFile(path, "utf8")).then(
    (content) => {
      const records: unknown[] = [];
      let skipped = 0;
      for (const line of content.split(/\r?\n/u)) {
        if (line.length === 0) continue;
        const parsed = jsonText.safeParse(line);
        if (parsed.success) records.push(parsed.data);
        else skipped += 1;
      }
      return { ok: true, value: { records, skipped } };
    },
    (error: unknown) => {
      const code = errorCodeSchema.safeParse(error);
      if (code.success && code.data.code === "ENOENT") {
        return { ok: true, value: { records: [], skipped: 0 } };
      }
      return { ok: false, error };
    },
  );
}

function getDataHome(options: ArchiveOptions): string {
  return (
    options.dataHome ??
    process.env.XDG_DATA_HOME ??
    join(homedir(), ".local", "share")
  );
}

export async function archiveHistories(
  options: ArchiveOptions = {},
): Promise<Attempt<ArchiveResult>> {
  const home = homedir();
  const sources: Array<{ vendor: Vendor; path: string }> = [
    {
      vendor: "claude",
      path: options.claudeHistory ?? join(home, ".claude", "history.jsonl"),
    },
    {
      vendor: "codex",
      path: options.codexHistory ?? join(home, ".codex", "history.jsonl"),
    },
  ];
  const archiveDir = join(getDataHome(options), "prompts");
  await mkdir(archiveDir, { recursive: true });
  const existing = new Set<string>();
  const archiveNames = (await readdir(archiveDir)).filter((name) =>
    /^\d{4}-\d{2}\.jsonl$/u.test(name),
  );
  const archiveReads = await Promise.all(
    archiveNames.map((name) => readJsonLines(join(archiveDir, name))),
  );
  const failedArchiveRead = archiveReads.find((read) => !read.ok);
  if (failedArchiveRead !== undefined && !failedArchiveRead.ok)
    return failedArchiveRead;
  const archiveRecords = archiveReads.flatMap((read) =>
    read.ok ? [read.value.records] : [],
  );
  for (const records of archiveRecords) addArchivedKeys(existing, records);

  const pending = new Map<string, string[]>();
  let skipped = 0;
  let archived = 0;
  for (const source of sources) {
    const loaded = await readJsonLines(source.path);
    if (!loaded.ok) return loaded;
    skipped += loaded.value.skipped;
    const result = addPendingRecords(
      source.vendor,
      loaded.value.records,
      archiveDir,
      existing,
      pending,
    );
    skipped += result.skipped;
    archived += result.archived;
  }

  for (const [path, rows] of pending)
    await appendFile(path, `${rows.join("\n")}\n`, {
      encoding: "utf8",
      flag: "a",
    });
  return { ok: true, value: { archived, skipped } };
}

function addArchivedKeys(existing: Set<string>, records: unknown[]): void {
  for (const value of records) {
    const parsed = parseArchived(value);
    if (parsed !== undefined) existing.add(dedupKey(parsed));
  }
}

function addPendingRecords(
  vendor: Vendor,
  records: unknown[],
  archiveDir: string,
  existing: Set<string>,
  pending: Map<string, string[]>,
): ArchiveResult {
  let skipped = 0;
  let archived = 0;
  for (const value of records) {
    const parsed = parseInput(vendor, value);
    if (parsed === undefined) {
      skipped += 1;
      continue;
    }
    const key = dedupKey(parsed);
    if (existing.has(key)) continue;
    existing.add(key);
    const monthPath = join(archiveDir, `${parsed.month}.jsonl`);
    const rows = pending.get(monthPath) ?? [];
    rows.push(JSON.stringify(parsed.archived));
    pending.set(monthPath, rows);
    archived += 1;
  }
  return { archived, skipped };
}
