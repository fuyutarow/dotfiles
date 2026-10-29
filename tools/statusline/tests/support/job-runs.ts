import { z } from "../../src/zod.ts";
import { readAgxSnapshotAsync } from "../../src/agx-snapshot.ts";
import type { JobRun } from "../../src/dispatch-runs.ts";
export async function agxJobRunsAsync(
  sessionId: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Promise<JobRun[]> {
  if (sessionId === undefined || sessionId === "") return [];
  const Row = z.object({
    id: z.string(),
    ticket: z.string(),
    state: z.enum(["running", "ended"]),
    dispatcher_session: z.string().nullable(),
  });
  return ((await readAgxSnapshotAsync(env)).rows ?? []).flatMap((value) => {
    const parsed = Row.safeParse(value);
    return parsed.success &&
      parsed.data.state === "running" &&
      parsed.data.dispatcher_session === sessionId
      ? [parsed.data]
      : [];
  });
}
