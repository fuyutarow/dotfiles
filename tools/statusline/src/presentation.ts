// Sampler-owned display protocol: tab-separated records, base64 text fields. The read
// path needs no JSON/schema engine or collector modules. The formatter remains format.ts.
import { mkdir, readFile, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promptParts } from "./prompt-stamp.ts";
import { version } from "../package.json";
import { hasBareUnavailable } from "./ansi.ts";
import type { RunSnapshotSource } from "./agx-snapshot.ts";
import { runSourceLine } from "./fleet-line.ts";
import { sessionProcessMatches } from "./session-discovery.ts";

const PRESENTATION_PROTOCOL = "session-inventory-worker-scope-v4";

export const presentationPath = () =>
  `${process.env.STATUSLINE_OWNER_STATE ?? join(process.env.HOME ?? "", ".local/state/statusline/owner.json")}.view`;
export interface PresentationSession {
  id: string;
  pid: number;
  process_generation?: string;
  line: string;
}
export interface PresentationRow {
  cwd: string;
  location: string;
  sessions: PresentationSession[];
  shared: string;
  runSource: RunSnapshotSource;
}
export interface Presentation {
  schema: 1;
  version: string;
  at: number;
  rows: PresentationRow[];
}
const encode = (value: string) => Buffer.from(value).toString("base64");
function decode(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const text = Buffer.from(value, "base64").toString("utf8");
  return encode(text) === value ? text : undefined;
}
export function encodePresentation(view: Presentation): string {
  return [
    [
      "statusline-view",
      view.schema,
      view.version,
      view.at,
      PRESENTATION_PROTOCOL,
    ].join("\t"),
    ...view.rows.flatMap((row) => [
      [
        "row",
        encode(row.cwd),
        encode(row.location),
        encode(row.shared),
        row.runSource.kind,
        row.runSource.kind === "unknown"
          ? ""
          : String(row.runSource.capturedAt),
        row.runSource.kind === "unknown" ? encode(row.runSource.why) : "",
      ].join("\t"),
      ...row.sessions.map((session) =>
        [
          "session",
          encode(session.id),
          session.pid,
          encode(session.line),
          encode(session.process_generation ?? ""),
        ].join("\t"),
      ),
    ]),
  ].join("\n");
}
function decodeRunSource(
  kind: string | undefined,
  atText: string | undefined,
  whyText: string | undefined,
): RunSnapshotSource | undefined {
  if (kind === "current" || kind === "stale") {
    const capturedAt = Number(atText);
    if (whyText !== "" || !Number.isFinite(capturedAt) || capturedAt <= 0)
      return undefined;
    return { kind, capturedAt };
  }
  if (kind !== "unknown" || atText !== "") return undefined;
  const why = decode(whyText);
  return why === undefined || why === "" ? undefined : { kind, why };
}
function decodeRow(fields: string[]): PresentationRow | undefined {
  if (fields.length !== 7) return undefined;
  const [_, cwd, location, shared, sourceKind, sourceAt, sourceWhy] = fields;
  const decodedCwd = decode(cwd);
  const decodedLocation = decode(location);
  const decodedShared = decode(shared);
  if (
    decodedCwd === undefined ||
    decodedLocation === undefined ||
    decodedShared === undefined ||
    hasBareUnavailable(decodedShared)
  )
    return undefined;
  const runSource = decodeRunSource(sourceKind, sourceAt, sourceWhy);
  if (runSource === undefined) return undefined;
  return {
    cwd: decodedCwd,
    location: decodedLocation,
    shared: decodedShared,
    runSource,
    sessions: [],
  };
}
function decodeSession(fields: string[]): PresentationSession | undefined {
  if (fields.length !== 5) return undefined;
  const [_, id, pidText, line, generation] = fields;
  const decodedId = decode(id);
  const decodedLine = decode(line);
  const decodedGeneration = decode(generation);
  const pid = Number(pidText);
  if (
    decodedId === undefined ||
    decodedLine === undefined ||
    decodedGeneration === undefined ||
    hasBareUnavailable(decodedLine) ||
    !Number.isSafeInteger(pid) ||
    pid <= 0
  )
    return undefined;
  const session: PresentationSession = {
    id: decodedId,
    pid,
    line: decodedLine,
  };
  if (decodedGeneration !== "") session.process_generation = decodedGeneration;
  return session;
}
function decodePresentation(text: string): Presentation | undefined {
  const [header, ...records] = text.split("\n");
  const [magic, schema, release, stamp, actionScope] = (header ?? "").split(
    "\t",
  );
  const at = Number(stamp);
  if (
    magic !== "statusline-view" ||
    schema !== "1" ||
    release !== version ||
    actionScope !== PRESENTATION_PROTOCOL ||
    !Number.isFinite(at) ||
    at <= 0
  )
    return undefined;
  const rows: PresentationRow[] = [];
  let row: PresentationRow | undefined;
  for (const record of records) {
    const fields = record.split("\t");
    const kind = fields[0];
    const decodedRow = kind === "row" ? decodeRow(fields) : undefined;
    if (decodedRow !== undefined) {
      row = decodedRow;
      rows.push(decodedRow);
      continue;
    }
    if (kind === "row" || row === undefined) return undefined;
    if (kind !== "session") return undefined;
    const session = decodeSession(fields);
    if (session === undefined) return undefined;
    row.sessions.push(session);
  }
  return { schema: 1, version, at, rows };
}
/** Called by the sampler only; neither a reader nor the CLI invokes the writer. */
export async function writePresentation(view: Presentation): Promise<void> {
  for (const path of [`${presentationPath()}.last-good`, presentationPath()]) {
    const temp = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await using _cleanup = {
      [Symbol.asyncDispose]: async () => {
        await unlink(temp).catch(() => null);
      },
    };
    await mkdir(dirname(path), { recursive: true });
    await Bun.write(temp, encodePresentation(view)).then(() =>
      rename(temp, path),
    );
  }
}
async function liveSession(
  session: PresentationSession,
): Promise<PresentationSession | undefined> {
  return (await sessionProcessMatches(session)) ? session : undefined;
}
async function renderPresentation(
  view: Presentation,
  row: PresentationRow,
  backup: boolean,
  sessionId?: string,
): Promise<string | undefined> {
  const alive = await Promise.all(row.sessions.map(liveSession));
  if (alive.some((session) => session === undefined)) return undefined;
  const clock = promptParts(row.cwd);
  const location = row.location
    .replaceAll("@@STATUSLINE_TIME@@", clock.when)
    .replaceAll("@@STATUSLINE_ZONE@@", clock.zone);
  const age = Math.max(0, Temporal.Now.instant().epochMilliseconds - view.at);
  const stale =
    age > 30_000 || backup
      ? `\nsamples ${Math.max(1, Math.floor(age / 1000))}s old`
      : "";
  const lines = alive.flatMap((session) =>
    session !== undefined &&
    (sessionId === undefined || session.id === sessionId)
      ? [session.line]
      : [],
  );
  return [
    location,
    ...(lines.length === 0 ? [`no agent session in ${row.cwd}`] : lines),
    row.shared,
    runSourceLine(row.runSource),
    stale === "" ? "" : stale.slice(1),
  ]
    .filter((line) => line !== "")
    .join("\n");
}
export async function presentation(
  cwd: string,
  sessionId?: string,
): Promise<string | undefined> {
  // Prepared shared rows have repository scope. A selected session needs its own actions.
  if (sessionId !== undefined) return undefined;
  for (const path of [presentationPath(), `${presentationPath()}.last-good`]) {
    const text = await readFile(path, "utf8").catch(() => "");
    const view = decodePresentation(text);
    const row = view?.rows.find((candidate) => candidate.cwd === cwd);
    if (view !== undefined && row !== undefined)
      return renderPresentation(
        view,
        row,
        path.endsWith(".last-good"),
        sessionId,
      );
  }
  return undefined;
}
