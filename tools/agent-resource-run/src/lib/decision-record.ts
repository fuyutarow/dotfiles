// One logical decision crosses the parent/scope boundary. The scope publishes evidence
// before command execution; after scope exit only the parent finalizes that record.
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fromAsyncThrowable } from "neverthrow";
import { jsonOf, z } from "../../../shared/src/zod.ts";

export const MAX_RECORD_BYTES = 1024 * 1024;
export const MAX_RECORDS = 32;
export const RETENTION_MS = 24 * 60 * 60 * 1000;
const context = new AsyncLocalStorage<DecisionRecord>();
const utc = () =>
  Temporal.Now.instant().toString({ fractionalSecondDigits: 3 });
export type Observation = {
  utc: string;
  tgid: string | null;
  tid: string | null;
  starttime: string | null;
  state: string | null;
  wchan: string | null;
  read_status: string;
  input: "live" | "cached";
  sample_time: string | null;
  branch: string;
};
export class DecisionRecord {
  readonly decision_id = randomUUID();
  readonly started_at = utc();
  private readonly start = performance.now();
  stage: "precheck" | "scope-entry" | "command" | "cleanup" = "precheck";
  launched = false;
  reason_code = "admit";
  branch = "check-only";
  outcome: "admit" | "refuse" = "admit";
  observations: Observation[] = [];
  omitted_observations = 0;
  private bytes = 0;
  private readonly identities = new Map<
    string,
    { starttime: string | null; state: string | null }
  >();
  observe(row: Observation) {
    const bytes = Buffer.byteLength(JSON.stringify(row)) + 1;
    // Bound memory as well as disk; never silently imply this is complete evidence.
    if (this.bytes + bytes > MAX_RECORD_BYTES - 4096) {
      this.omitted_observations += 1;
      return;
    }
    this.bytes += bytes;
    this.observations.push(row);
  }
  read(path: string, value: string | undefined, status: string) {
    const task = /\/(\d+)(?:\/task\/(\d+))?\/(stat|wchan)$/u.exec(path);
    if (task === null) return;
    const tgid = task[1]!;
    const tid = task[2] ?? tgid;
    const key = `${tgid}/${tid}`;
    const field = task[3];
    let identity = this.identities.get(key);
    if (field === "stat") {
      const parsed =
        value === undefined
          ? undefined
          : /^\d+ \(.*\) ([A-Za-z]) (.*)/u.exec(value);
      identity = {
        state: parsed?.[1] ?? null,
        starttime: parsed?.[2]?.trim().split(/\s+/u)[18] ?? null,
      };
      this.identities.set(key, identity);
    }
    this.observe({
      utc: utc(),
      tgid,
      tid,
      starttime: identity?.starttime ?? null,
      state: identity?.state ?? null,
      wchan: field === "wchan" ? (value?.trim().slice(0, 128) ?? null) : null,
      read_status: status,
      input: "live",
      sample_time: null,
      branch: `proc.${field}`,
    });
  }
  snapshot(exit_code: number | null = null) {
    return {
      decision_id: this.decision_id,
      started_at: this.started_at,
      decided_at: utc(),
      monotonic_span_ms: performance.now() - this.start,
      stage: this.stage,
      launched: this.launched,
      outcome: this.outcome,
      reason_code: this.reason_code,
      branch: this.branch,
      exit_code,
      observations: this.observations,
      omitted_observations: this.omitted_observations,
    };
  }
}
export const currentDecision = () => context.getStore();
export const withDecision = <T>(record: DecisionRecord, action: () => T): T =>
  context.run(record, action);
export const decisionDirectory = () =>
  join(
    process.env.XDG_STATE_HOME ?? join(homedir(), ".local/state"),
    "agent-resource",
    "decisions",
  );
export const decisionPath = (id: string) =>
  join(decisionDirectory(), `${id}.jsonl`);

// Independent files avoid append/rotation races between concurrent admissions.
// Each invocation prunes by age and count; ENOENT from another pruner is harmless.
export async function saveDecision(
  record: ReturnType<DecisionRecord["snapshot"]>,
  id: string = record.decision_id,
) {
  const saved = await fromAsyncThrowable(async () => {
    const root = decisionDirectory();
    await mkdir(root, { recursive: true, mode: 0o700 });
    const path = decisionPath(id);
    const temporary = `${path}.${process.pid}.tmp`;
    const line = `${JSON.stringify(record)}\n`;
    if (Buffer.byteLength(line) > MAX_RECORD_BYTES) {
      process.stderr.write("ERROR decision record exceeds byte bound\n");
      return;
    }
    await writeFile(temporary, line, { mode: 0o600 });
    await rename(temporary, path);
    const files = await readdir(root);
    const rows = await Promise.all(
      files
        .filter((name) => /^[a-f0-9-]+\.jsonl$/u.test(name))
        .map(async (name) => {
          const info = await fromAsyncThrowable(() => stat(join(root, name)))();
          return info.isOk() ? { name, mtime: info.value.mtimeMs } : undefined;
        }),
    );
    const retained = rows
      .filter((row) => row !== undefined)
      .toSorted((a, b) => {
        const delta = b.mtime - a.mtime;
        return delta === 0 ? a.name.localeCompare(b.name) : delta;
      });
    await Promise.all(
      retained
        .filter(
          (row, index) =>
            index >= MAX_RECORDS ||
            Temporal.Now.instant().epochMilliseconds - row.mtime > RETENTION_MS,
        )
        .map((row) => fromAsyncThrowable(() => unlink(join(root, row.name)))()),
    );
  })();
  if (saved.isErr())
    process.stderr.write(
      `ERROR decision record unavailable: ${String(saved.error)}\n`,
    );
}
export const DecisionRecordSchema = z.object({
  decision_id: z.string(),
  started_at: z.string(),
  decided_at: z.string(),
  monotonic_span_ms: z.number(),
  exit_code: z.number().nullable(),
  stage: z.enum(["precheck", "scope-entry", "command", "cleanup"]),
  launched: z.boolean(),
  outcome: z.enum(["admit", "refuse"]),
  reason_code: z.string(),
  branch: z.string(),
  observations: z.array(
    z.object({
      utc: z.string(),
      tgid: z.string().nullable(),
      tid: z.string().nullable(),
      starttime: z.string().nullable(),
      state: z.string().nullable(),
      wchan: z.string().nullable(),
      read_status: z.string(),
      input: z.enum(["live", "cached"]),
      sample_time: z.string().nullable(),
      branch: z.string(),
    }),
  ),
  omitted_observations: z.number(),
});
export async function scopeEvidence(
  id: string,
): Promise<z.output<typeof DecisionRecordSchema> | undefined> {
  const read = await fromAsyncThrowable(() =>
    readFile(decisionPath(id), "utf8"),
  )();
  if (read.isErr()) return undefined;
  const parsed = jsonOf(DecisionRecordSchema).safeParse(read.value);
  return parsed.success ? parsed.data : undefined;
}
