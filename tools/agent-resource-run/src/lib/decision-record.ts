// One compact outcome per invocation. The scope child writes launch state; the parent
// overwrites that same record with the final command or cleanup status.
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fromAsyncThrowable } from "neverthrow";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";

const context = new AsyncLocalStorage<DecisionRecord>();
const utc = () =>
  Temporal.Now.instant().toString({ fractionalSecondDigits: 3 });

export class DecisionRecord {
  readonly decision_id: string;
  systemd_unit: string | null = null;
  invocation_id: string | null = null;
  stage: "precheck" | "scope-entry" | "command" | "cleanup" = "precheck";
  launched = false;
  reason = "pending";
  timestamp = utc();
  final_status: number | null = null;

  constructor(decisionId: string = randomUUID()) {
    this.decision_id = decisionId;
  }

  snapshot(finalStatus = this.final_status) {
    this.timestamp = utc();
    this.final_status = finalStatus;
    return {
      decision_id: this.decision_id,
      systemd_unit: this.systemd_unit,
      invocation_id: this.invocation_id,
      stage: this.stage,
      launched: this.launched,
      reason: this.reason,
      timestamp: this.timestamp,
      final_status: this.final_status,
    };
  }
}

export const currentDecision = () => context.getStore();
export const withDecision = <T>(record: DecisionRecord, action: () => T): T =>
  context.run(record, action);
export const decisionDirectory = () =>
  join(
    process.env["XDG_STATE_HOME"] ?? join(homedir(), ".local/state"),
    "agent-resource",
    "decisions",
  );
export const decisionPath = (id: string) =>
  join(decisionDirectory(), `${id}.json`);

export async function saveDecision(
  record: ReturnType<DecisionRecord["snapshot"]>,
) {
  const saved = await fromAsyncThrowable(async () => {
    const root = decisionDirectory();
    await mkdir(root, { recursive: true, mode: 0o700 });
    const path = decisionPath(record.decision_id);
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    await rename(temporary, path);
  })();
  if (saved.isErr())
    process.stderr.write(
      `ERROR decision record unavailable: ${String(saved.error)}\n`,
    );
}

export const DecisionRecordSchema = z.strictObject({
  decision_id: z.string().regex(/^[a-f0-9-]{36}$/u),
  systemd_unit: z.string().nullable(),
  invocation_id: z
    .string()
    .regex(/^[a-f0-9]{32}$/u)
    .nullable(),
  stage: z.enum(["precheck", "scope-entry", "command", "cleanup"]),
  launched: z.boolean(),
  reason: z.string().min(1).max(80),
  timestamp: z.string(),
  final_status: z.number().int().nullable(),
});

export async function readDecision(
  id: string,
): Promise<z.output<typeof DecisionRecordSchema> | undefined> {
  const read = await fromAsyncThrowable(() =>
    readFile(decisionPath(id), "utf8"),
  )();
  if (read.isErr()) return undefined;
  const parsed = jsonOf(DecisionRecordSchema).safeParse(read.value);
  return parsed.success && parsed.data.decision_id === id
    ? parsed.data
    : undefined;
}
