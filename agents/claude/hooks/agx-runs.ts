// This session's agx runs as one line, from a bounded `agx status --json`. agx owns state
// discovery and freshness; this module consumes only its public CLI. Every failure is a
// readable `n/a (...)`, never a throw. Used by log-sys-snapshot.ts.
import { basename } from "node:path";
import { jsonOf, z } from "@dotfiles/hooks/zod.ts";

// Leave room for CLI startup, but cap a hung status command's impact on the session.
const STATUS_TIMEOUT_MS = 500;
const nonEmpty = (v: string | undefined): string | undefined =>
  v !== undefined && v !== "" ? v : undefined;
const oneLine = (text: string): string =>
  text.replaceAll(/[\r\n\u2028\u2029]/gu, " ");

const Run = z.looseObject({
  id: z.string().min(1),
  state: z.string(),
  dispatcher_session: z.string().nullable(),
  vendor_session: z.string().nullable().optional(),
  ticket: z.string().optional(),
  row: z.string().optional(),
  judgment: z.unknown().optional(),
});
const Status = jsonOf(
  z.object({
    schema: z.literal(1),
    runs: z.object({
      source: z.enum(["current", "stale", "unknown"]),
      reason: z.string().nullable(),
      rows: z.array(Run).nullable(),
    }),
  }),
);

export async function agxRuns(sid: string, cwd: string): Promise<string> {
  const agx = Bun.which("agx");
  if (agx === null) return "n/a (agx not found on PATH)";
  const signal = AbortSignal.timeout(STATUS_TIMEOUT_MS);
  const child = Bun.spawn([agx, "status", "--json", "--cwd", cwd], {
    stdout: "pipe",
    stderr: "pipe",
    signal,
    killSignal: "SIGKILL",
  });
  const read = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 1024 * 1024) {
        child.kill("SIGKILL");
        return null;
      }
      chunks.push(part.value);
    }
    return new TextDecoder().decode(Buffer.concat(chunks));
  };
  const [stdout, stderr, exitCode] = await Promise.all([
    read(child.stdout),
    read(child.stderr),
    child.exited,
  ]);
  if (signal.aborted)
    return `n/a (agx status timed out after ${STATUS_TIMEOUT_MS} ms)`;
  if (stdout === null || stderr === null)
    return "n/a (agx status output exceeded maxBuffer)";
  if (exitCode !== 0)
    return oneLine(
      `n/a (agx status exited ${child.signalCode ?? exitCode}: ${stderr.slice(0, 1024).trim()})`,
    );
  const status = Status.safeParse(stdout);
  if (!status.success) return "n/a (invalid agx status JSON)";
  const { source, reason, rows } = status.data.runs;
  if (source !== "current" || rows === null)
    return oneLine(`n/a (${reason ?? `agx status runs ${source}`})`);
  const mine = rows.filter((run) => run.dispatcher_session === sid);
  const running = mine.filter((run) => run.state === "running");
  const ended = mine.filter(
    (run) => run.state === "ended" && (run.judgment ?? null) === null,
  ).length;
  const orphaned = mine.filter((run) => run.state === "orphaned").length;
  const counts = [
    `${running.length} running`,
    ...(ended > 0 ? [`${ended} ended-unjudged`] : []),
    ...(orphaned > 0 ? [`orphaned ${orphaned}`] : []),
  ];
  const entries = running.map((run) => {
    const ticket = basename(run.ticket ?? run.id).replace(/\.md$/u, "");
    const vendor =
      nonEmpty(run.vendor_session ?? undefined) ?? "n/a (not recorded)";
    return `${run.id.slice(0, 8)} ${ticket}${run.row === undefined ? "" : ` ${run.row}`} vendor_session=${vendor}`;
  });
  return oneLine(
    `${counts.join(" · ")}${entries.length === 0 ? "" : ` | ${entries.join(" · ")}`}`,
  );
}
