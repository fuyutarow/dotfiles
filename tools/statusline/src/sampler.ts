// Timer-owned collectors. No render imports or invokes this entry point.
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cli } from "cleye";
import { buildDataframe } from "./build-dataframe.ts";
import { COLLECTOR_SOURCES } from "./collector-sources.ts";
import { discoverSessions, statusForSession } from "./session-discovery.ts";
import {
  ownerStatePath,
  readOwnerState,
  repositoryRoot,
  type OwnerState,
} from "./owner-state.ts";
import { refreshRecoverHealth } from "./recover-health.ts";
import { writeCacheAsync } from "./bounded.ts";
import { jsonText, z } from "./zod.ts";
import type { Dataframe } from "./dataframe.ts";
import type { SessionStatus } from "./session-status.ts";
import { ESC, RST } from "./ansi.ts";
import { readAgentNamesAsync } from "./identity.ts";
import { ok, err, Ok, Err } from "neverthrow";
import { writeUsageSnapshotAsync } from "./usage-snapshot.ts";
import {
  writePresentation,
  type Presentation,
  type PresentationRow,
} from "./presentation.ts";
import { render } from "./format.ts";
import { readCoreRuns } from "./core-runs.ts";
import { renderField } from "./field-state.ts";
import { version } from "../package.json";
import { readFleetSession } from "../../shared/src/fleet-session.ts";
import { snapshotWithFleetFacts } from "./snapshot-rate.ts";

const plain = (value: string) =>
  value.replaceAll(new RegExp(`${ESC}\\[[0-9;]*m`, "gu"), "");

/** The transcript hook consumes these owner-written presentation snapshots. */
export async function publishSnapshots(
  payloads: SessionStatus[] = [],
  sampledFrames?: Dataframe[],
): Promise<void> {
  const frames =
    sampledFrames ??
    (await Promise.all(
      (payloads.length === 0 ? [{ cwd: process.cwd() }] : payloads).map(
        (payload) => buildDataframe(payload),
      ),
    ));
  const frame = frames[0];
  if (frame === undefined) return;
  const sys = render(frame, { layout: "snapshot" }).split("\n")[2] ?? "";
  const at = Temporal.Now.instant().epochMilliseconds;
  const root =
    process.env.STATUSLINE_CACHE_ROOT ??
    join(process.env.HOME ?? "", ".cache/claude");
  await writeCacheAsync(join(root, "statusline-sys.json"), {
    at,
    line: plain(sys),
    ansi: sys,
  });
  for (const df of frames) {
    await writeUsageSnapshotAsync(df, Math.floor(at / 1000));
    if (df.sid === undefined) continue;
    const sid = df.sid.replaceAll(/[^A-Za-z0-9_-]/gu, "_");
    const fleet = await readFleetSession(df.sid);
    const snapshot = snapshotWithFleetFacts(df, fleet);
    const rows = render(snapshot, { layout: "snapshot" })
      .split("\n")
      .slice(0, 2);
    await writeCacheAsync(join(root, "statusline-session", `${sid}.json`), {
      at,
      rows: rows.map((ansi) => ({ line: plain(ansi), ansi })),
    });
  }
}

// Old presentation caches are retired. Cleanup is owned by this sampler, never a render.
export async function cleanRetiredCaches(
  root = join(
    process.env.STATUSLINE_CACHE_ROOT ??
      join(process.env.HOME ?? "", ".cache/claude"),
    "statusline",
  ),
): Promise<void> {
  await Promise.all(
    ["fields", "renders", "sources"].map((name) =>
      rm(join(root, name), { recursive: true, force: true }),
    ),
  );
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const cutoff = Temporal.Now.instant().epochMilliseconds - 60_000;
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".tmp"))
      .map(async (entry) => {
        const path = join(root, entry.name);
        const info = await stat(path).catch(() => null);
        if (info !== null && info.mtimeMs < cutoff)
          await rm(path, { force: true });
      }),
  );
}

export async function sample(payloads?: SessionStatus[]): Promise<void> {
  const path = ownerStatePath();
  await mkdir(dirname(path), { recursive: true });
  // systemd removes its RuntimeDirectory even after a killed collector.
  const lock = process.env.STATUSLINE_SAMPLER_LOCK_DIR ?? `${path}.lock`;
  await mkdir(dirname(lock), { recursive: true });
  const acquired = await mkdir(lock).then(
    () => true,
    () => false,
  );
  if (!acquired) return;
  await using _lockCleanup = {
    [Symbol.asyncDispose]: async () => {
      await rm(lock, { recursive: true, force: true });
    },
  };
  {
    const previous = await readOwnerState();
    const next: OwnerState = { schema: 1, fields: {} };
    const persist = (key: string, value: unknown) => {
      const prior = previous?.fields[key];
      const failed = z.object({ error: z.string() }).safeParse(value);
      const previousFailed = z
        .object({ error: z.string() })
        .safeParse(prior?.value);
      // A driver stall is a current observation, not a failed attempt to take a
      // reading. Keeping last-good VRAM here would conceal it behind GPU≈.
      const gpuStalled =
        key === "vram" &&
        failed.success &&
        failed.data.error.startsWith("⚠ GPU stalled since ");
      if (
        failed.success &&
        !gpuStalled &&
        prior !== undefined &&
        !previousFailed.success
      ) {
        next.fields[key] = { ...prior, error: failed.data.error };
        return;
      }
      next.fields[key] = {
        at: Temporal.Now.instant().epochMilliseconds,
        value,
      };
    };
    const save = async (key: string, source: () => Promise<unknown>) => {
      const loaded = await source().then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error: String(error) }),
      );
      const prior = previous?.fields[key];
      if (!loaded.ok) {
        if (prior !== undefined)
          next.fields[key] = { ...prior, error: loaded.error };
        return;
      }
      const parsed = jsonText.safeParse(
        JSON.stringify(loaded.value, (_key, value: unknown) => {
          if (value instanceof Ok) {
            const current: unknown = value.value;
            return { value: current ?? null };
          }
          if (value instanceof Err) {
            const error: unknown = value.error;
            return { error };
          }
          return value;
        }),
      );
      if (!parsed.success) return;
      persist(key, parsed.data);
      if (key !== "hostLoad") return;
      const metrics = z.record(z.string(), z.unknown()).safeParse(parsed.data);
      if (!metrics.success) return;
      for (const [metric, value] of Object.entries(metrics.data))
        persist(metric, value);
    };
    // Explicit payloads are scoped collector fixtures. Only the timer's no-argument
    // sample discovers the host; a fixture must not scan unrelated live rollouts.
    const sessions =
      payloads === undefined ? await discoverSessions(process.cwd(), true) : [];
    persist("sessions", sessions);
    const home = process.env.HOME ?? "";
    const roots = new Set<string>();
    const candidates = [
      process.cwd(),
      join(home, "dotfiles"),
      join(home, "Workspace/firedancer"),
      ...sessions.map((session) => session.cwd),
      ...(payloads ?? []).flatMap((payload) =>
        payload.cwd === undefined ? [] : [payload.cwd],
      ),
    ];
    for (const candidate of candidates) {
      const root = await repositoryRoot(candidate);
      if (root !== undefined) roots.add(root);
    }
    // Health refresh has one caller under this lock and the systemd service's singleton.
    await refreshRecoverHealth();
    const nameIds = new Set([
      ...sessions
        .filter((session) => session.vendor === "claude")
        .map((session) => session.session_id),
      ...(payloads ?? []).flatMap((payload) =>
        payload.sessionId === undefined ? [] : [payload.sessionId],
      ),
    ]);
    if (nameIds.size > 0) {
      const names = await readAgentNamesAsync();
      for (const sid of nameIds)
        await save(`name:${sid}`, () =>
          Promise.resolve(
            names.isErr()
              ? err(names.error)
              : ok(names.value.find((row) => row.sessionId === sid)?.name),
          ),
        );
    }
    await Promise.all([
      ...(
        [
          "identity",
          "rcState",
          "jobScan",
          "hostLoad",
          "storage",
          "codexRate",
          "jevUsage",
          "recoverHealth",
          "dispatchWarning",
        ] as const
      ).map((key) => save(key, COLLECTOR_SOURCES[key])),
      ...[...roots].map((root) =>
        save(`repo:${root}`, () => COLLECTOR_SOURCES.repoState(root)),
      ),
    ]);
    await Promise.all(
      sessions.map((session) =>
        save(`session:${session.session_id}`, () => statusForSession(session)),
      ),
    );
    await writeCacheAsync(`${path}.last-good`, next);
    await writeCacheAsync(path, next);
    const rows: PresentationRow[] = [];
    const snapshotFrames: Dataframe[] = [];
    for (const cwd of new Set([
      ...roots,
      ...sessions.map((session) => session.cwd),
    ])) {
      const selected = sessions.filter((session) => session.cwd === cwd);
      const frames = await Promise.all(
        selected.map(async (session) => ({
          session,
          frame: await buildDataframe(await statusForSession(session), {
            codex: session.vendor === "codex",
            ownerSnapshot: Promise.resolve(next),
          }),
        })),
      );
      const first =
        frames.find(({ session }) => session.vendor === "claude")?.frame ??
        frames[0]?.frame ??
        (await buildDataframe(
          { cwd },
          { ownerSnapshot: Promise.resolve(next) },
        ));
      snapshotFrames.push(...frames.map(({ frame }) => frame));
      rows.push({
        cwd,
        location: render(first, {
          layout: "location",
          collect: (key, label, state) => {
            if (key === "prompt-time")
              return `${ESC}[36m@@STATUSLINE_TIME@@${RST}`;
            if (key === "prompt-zone")
              return `${ESC}[38;5;240m@@STATUSLINE_ZONE@@${RST}`;
            return renderField(label, state);
          },
        }),
        sessions: frames.map(({ session, frame }) => ({
          id: session.session_id,
          pid: session.pid,
          line: render(frame, {
            layout: "session",
            codex: session.vendor === "codex",
            source: "transcript",
          }),
        })),
        shared: render(
          { ...first, routes: ok(await readCoreRuns(process.env, null, cwd)) },
          { layout: "shared" },
        ),
      });
    }
    const view: Presentation = {
      schema: 1,
      version,
      at: Temporal.Now.instant().epochMilliseconds,
      rows,
    };
    await writePresentation(view);
    // Reuse the exact session frames rendered above; do not reconstruct a poorer wire payload.
    await publishSnapshots(
      payloads,
      payloads === undefined && snapshotFrames.length > 0
        ? snapshotFrames
        : undefined,
    );
    await cleanRetiredCaches();
    await cleanSamplerLeftovers(dirname(path));
  }
}

/** Remove only this collector's abandoned atomic files, never another tool's state. */
export async function cleanSamplerLeftovers(root: string): Promise<void> {
  const entries = await readdir(root).catch(() => []);
  const cutoff = Temporal.Now.instant().epochMilliseconds - 60_000;
  await Promise.all(
    entries
      .filter((name) =>
        /^(?:owner\.json(?:\.view)?(?:\.last-good)?|disk-rate\.json)\..+\.tmp$/u.test(
          name,
        ),
      )
      .map(async (name) => {
        const path = join(root, name);
        const info = await stat(path).catch(() => null);
        if (info !== null && info.mtimeMs < cutoff)
          await rm(path, { force: true });
      }),
  );
}

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`Error: unknown option '--${flag}'\n`);
    process.exit(2);
  }
}
if (import.meta.main) {
  const args = cli({
    name: "statusline-sampler",
    parameters: [],
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
  });
  if (args._.length > 0) {
    process.stderr.write("FATAL: statusline-sampler accepts no arguments\n");
    process.exit(2);
  }
  await sample().catch((error: unknown) => {
    process.stderr.write(`FATAL: ${String(error)}\n`);
    process.exitCode = 2;
  });
}
