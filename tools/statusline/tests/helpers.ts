import { jsonOf, z } from "../src/zod.ts";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dirs: string[] = [];
export function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}
export function tempHome(): string {
  const home = tempDir("statusline-home-");
  mkdirSync(join(home, ".claude"));
  return home;
}
export function isolatedStatuslineEnv(
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const home =
    env.HOME === undefined || env.HOME === ""
      ? tempDir("statusline-env-home-")
      : env.HOME;
  let state = join(home, ".local", "state", "agx-test");
  if (env.AGX_STATE_DIR !== undefined && env.AGX_STATE_DIR !== "") {
    state = env.AGX_STATE_DIR;
  } else if (env.XDG_STATE_HOME !== undefined && env.XDG_STATE_HOME !== "") {
    // Empty keeps migration tests on their temporary XDG root to exercise both reader paths.
    state = "";
  }
  return {
    ...env,
    HOME: home,
    AGX_STATE_DIR: state,
    AGX_DISPATCHER_SESSION: "",
    CLAUDE_CODE_SESSION_ID: "",
  };
}
export function cleanupTempDirs(): void {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
}

/** Fixture core responses for old marker-based tests; production must never derive these. */
export function coreSnapshot(output: string, capturedAt: number) {
  const decoded = jsonOf(z.array(z.unknown())).safeParse(output);
  const runs = decoded.success ? decoded.data : [];
  const schema = z.looseObject({
    state: z.string(),
    dispatcher_session: z.string().nullable(),
    health: z.string().nullable().optional(),
  });
  const rows = runs.flatMap((value) => {
    const parsed = schema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
  const live = rows.filter((row) => row.state === "running");
  const lost = rows.filter((row) => row.health === "orphaned").length;
  const sessions = [
    ...new Set(
      live.flatMap((row) =>
        row.dispatcher_session === null || row.dispatcher_session.trim() === ""
          ? []
          : [row.dispatcher_session],
      ),
    ),
  ];
  return {
    output: JSON.stringify({
      runs: runs.map((value) => {
        const row = schema.safeParse(value);
        return row.success && row.data.state === "running"
          ? Object.assign({}, row.data, { phase: row.data.phase ?? "working" })
          : value;
      }),
      summary: {
        running: live.length,
        unattributed: live.filter(
          (row) =>
            row.dispatcher_session === null ||
            row.dispatcher_session.trim() === "",
        ).length,
        sessions: Object.fromEntries(
          sessions.map((session) => {
            const here = live.filter(
              (row) => row.dispatcher_session === session,
            ).length;
            return [session, { here, other: live.length - here }];
          }),
        ),
        noSession: { here: 0, other: live.length },
      },
    }),
    capturedAt,
    exit: 0,
    findings: { kinds: lost === 0 ? {} : { orphaned: lost }, lost, capturedAt },
  };
}
