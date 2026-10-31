import { fromThrowable, jsonOf, z } from "../src/zod.ts";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  agxStatusKey,
  type FleetFindings,
  type WorkspaceCounts,
} from "../src/agx-snapshot.ts";
import { ownerStatePath, OwnerStateSchema } from "../src/owner-state.ts";
import { decodedJson } from "./decode.ts";

/** Convert legacy listing fixtures into the sampler's CLI wire cache. */
export function seedAgxSnapshot(
  env: NodeJS.ProcessEnv,
  snapshot: {
    output: string;
    capturedAt: number;
    findings?: FleetFindings;
    workspaces?: WorkspaceCounts;
    judgments?: {
      bySession?: Record<string, number>;
      repository?: number;
      land?: number;
      why?: string | null;
    };
  },
  cwd = process.cwd(),
) {
  const listing = decodedJson(
    z.union([
      z.array(z.unknown()),
      z.object({ runs: z.array(z.unknown()), summary: z.unknown() }),
    ]),
    snapshot.output,
  );
  const findings = snapshot.findings;
  const workspaces = snapshot.workspaces;
  const judgments = snapshot.judgments;
  const value = {
    schema: 1,
    runs: {
      source: "current",
      captured_at: snapshot.capturedAt,
      age_s: 0,
      reason: null,
      rows: Array.isArray(listing) ? listing : listing.runs,
      summary: Array.isArray(listing) ? null : listing.summary,
    },
    workspaces:
      workspaces === undefined
        ? null
        : {
            ...workspaces,
            captured_at: workspaces.capturedAt,
            fleet_known: workspaces.fleetKnown,
          },
    findings:
      findings === undefined
        ? null
        : {
            ...findings,
            schema: 1,
            findings: [],
            complete: true,
            total: Object.values(findings.kinds).reduce(
              (sum, count) => sum + count,
              0,
            ),
            captured_at: findings.capturedAt,
          },
    judgments: {
      by_session: judgments?.bySession ?? {},
      repository: judgments?.repository ?? 0,
      land: judgments?.land ?? 0,
      why: judgments?.why ?? null,
    },
  };
  const path = ownerStatePath(env);
  const previous = fromThrowable(() => readFileSync(path, "utf8"))();
  const parsed = previous.isOk()
    ? jsonOf(OwnerStateSchema).safeParse(previous.value)
    : undefined;
  const owner =
    parsed?.success === true ? parsed.data : { schema: 1, fields: {} };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({
      ...owner,
      fields: {
        ...owner.fields,
        [agxStatusKey(cwd)]: { at: snapshot.capturedAt, value },
      },
    }),
  );
  return path;
}

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
    env["HOME"] === undefined || env["HOME"] === ""
      ? tempDir("statusline-env-home-")
      : env["HOME"];
  let state = join(home, ".local", "state", "agx-test");
  if (env["AGX_STATE_DIR"] !== undefined && env["AGX_STATE_DIR"] !== "") {
    state = env["AGX_STATE_DIR"];
  } else if (
    env["XDG_STATE_HOME"] !== undefined &&
    env["XDG_STATE_HOME"] !== ""
  ) {
    // Empty keeps migration tests on their temporary XDG root to exercise both reader paths.
    state = "";
  }
  return {
    ...env,
    HOME: home,
    AGX_STATE_DIR: state,
    AGX_DISPATCHER_SESSION: "",
    CLAUDE_CODE_SESSION_ID: "",
    CODEX_SESSION_ID: "",
    CODEX_THREAD_ID: "",
  };
}
export function cleanupTempDirs(): void {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
}

/** Fixture core responses for old marker-based tests; production must never derive these. */
export function coreSnapshot(
  output: string,
  capturedAt: number,
  late?: number,
) {
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
          ? Object.assign({}, row.data, {
              phase: row.data["phase"] ?? "working",
            })
          : value;
      }),
      summary: {
        late,
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
