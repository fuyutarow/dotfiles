// Sampler-owned display protocol: tab-separated records, base64 text fields. The read
// path needs no JSON/schema engine or collector modules. The formatter remains format.ts.
import { mkdir, readFile, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promptParts } from "./prompt-stamp.ts";
import { version } from "../package.json";
import { hasBareUnavailable } from "./ansi.ts";

export const presentationPath = () =>
  `${process.env.STATUSLINE_OWNER_STATE ?? join(process.env.HOME ?? "", ".local/state/statusline/owner.json")}.view`;
export interface PresentationSession {
  id: string;
  pid: number;
  line: string;
}
export interface PresentationRow {
  cwd: string;
  location: string;
  sessions: PresentationSession[];
  shared: string;
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
    ["statusline-view", view.schema, view.version, view.at].join("\t"),
    ...view.rows.flatMap((row) => [
      ["row", encode(row.cwd), encode(row.location), encode(row.shared)].join(
        "\t",
      ),
      ...row.sessions.map((session) =>
        ["session", encode(session.id), session.pid, encode(session.line)].join(
          "\t",
        ),
      ),
    ]),
  ].join("\n");
}
function decodePresentation(text: string): Presentation | undefined {
  const [header, ...records] = text.split("\n");
  const [magic, schema, release, stamp] = (header ?? "").split("\t");
  const at = Number(stamp);
  if (
    magic !== "statusline-view" ||
    schema !== "1" ||
    release !== version ||
    !Number.isFinite(at) ||
    at <= 0
  )
    return undefined;
  const rows: PresentationRow[] = [];
  let row: PresentationRow | undefined;
  for (const record of records) {
    const [kind, first, second, third, extra] = record.split("\t");
    if (extra !== undefined) return undefined;
    const a = decode(first),
      c = decode(third);
    if (a === undefined || c === undefined || hasBareUnavailable(c))
      return undefined;
    const location = kind === "row" ? decode(second) : undefined;
    if (kind === "row" && location === undefined) return undefined;
    if (kind === "row" && location !== undefined) {
      row = { cwd: a, location, shared: c, sessions: [] };
      rows.push(row);
      continue;
    }
    const pid = Number(second);
    if (
      kind !== "session" ||
      row === undefined ||
      !Number.isSafeInteger(pid) ||
      pid <= 0
    )
      return undefined;
    row.sessions.push({ id: a, pid, line: c });
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
  if (process.platform !== "linux") return session;
  const command = await readFile(
    join(
      process.env.STATUSLINE_PROC_ROOT ?? "/proc",
      String(session.pid),
      "cmdline",
    ),
    "utf8",
  ).catch(() => "");
  return command === "" ? undefined : session;
}
async function renderPresentation(
  view: Presentation,
  row: PresentationRow,
  backup: boolean,
  sessionId?: string,
): Promise<string> {
  const alive = await Promise.all(row.sessions.map(liveSession));
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
    session === undefined ||
    (sessionId !== undefined && session.id !== sessionId)
      ? []
      : [session.line],
  );
  return [
    location,
    ...(lines.length === 0 ? [`no agent session in ${row.cwd}`] : lines),
    row.shared + stale,
  ].join("\n");
}
export async function presentation(
  cwd: string,
  sessionId?: string,
): Promise<string | undefined> {
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
