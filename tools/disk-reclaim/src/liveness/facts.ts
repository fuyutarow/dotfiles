import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, isAbsolute, sep } from "node:path";
import { homedir } from "node:os";
import { fromThrowable, jsonOf, z } from "../../../shared/src/zod.ts";
import {
  collectProcesses,
  type OpenPaths,
  type ProcessSnapshot,
  type ProcOptions,
} from "../lib/procs.ts";
import type { Config } from "../model.ts";

export type SessionEntry = {
  sessionId: string;
  procStart: string;
  pid: number;
};
export type Probe<T> = { ok: true; value: T } | { ok: false; error: string };
export type TranscriptFact =
  | { exists: true; mtimeMs: number }
  | { exists: false };
export type LivenessFacts = {
  sessions: Probe<SessionEntry[]>;
  procStarttime: (pid: number) => Probe<string>;
  environSessionIds: Probe<string[]>;
  openPaths: Probe<string[]>;
  transcript: Probe<TranscriptFact>;
  now: number;
  graceHours: number;
};

export type LivenessRef = {
  uid: number;
  slug: string;
  uuid: string;
  dir: string;
};
export type LivenessProbes = {
  readSessions: (registryDir: string) => Probe<SessionEntry[]>;
  procStarttime: (procRoot: string, pid: number) => Probe<string>;
  scanEnviron: (procRoot: string, uid: number) => Probe<string[]>;
  scanOpenPaths: (
    procRoot: string,
    uid: number,
    dir: string,
  ) => Probe<string[]>;
  statTranscript: (path: string) => Probe<TranscriptFact>;
};

const ok = <T>(value: T): Probe<T> => ({ ok: true, value });
const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
const fail = (error: unknown): Probe<never> => ({
  ok: false,
  error: errorText(error),
});
const capture = <T>(operation: () => T): Probe<T> => {
  const result = fromThrowable(operation, errorText)();
  return result.isOk() ? ok(result.value) : fail(result.error);
};
const captureProbe = <T>(operation: () => Probe<T>): Probe<T> => {
  const result = capture(operation);
  return result.ok ? result.value : result;
};
const sessionEntry = z.object({
  sessionId: z.string(),
  procStart: z.union([z.string(), z.number()]).transform(String),
  pid: z.number().int(),
});

export function readSessions(registryDir: string): Probe<SessionEntry[]> {
  const names = capture(() => readdirSync(registryDir));
  if (!names.ok) return names;
  const entries: SessionEntry[] = [];
  for (const name of names.value) {
    if (!name.endsWith(".json")) continue;
    const text = capture(() => readFileSync(join(registryDir, name), "utf8"));
    if (!text.ok) return text;
    const row = jsonOf(sessionEntry).safeParse(text.value);
    if (!row.success)
      return fail(
        `invalid session registry record: ${name}: ${row.error.message}`,
      );
    entries.push(row.data);
  }
  return ok(entries);
}

export function procStarttime(procRoot: string, pid: number): Probe<string> {
  const stat = capture(() =>
    readFileSync(join(procRoot, String(pid), "stat"), "utf8"),
  );
  if (!stat.ok) return stat;
  // comm is parenthesized and may itself contain spaces or parentheses.
  const close = stat.value.lastIndexOf(")");
  if (close < 0) return fail("malformed /proc stat");
  const fieldsAfterComm = stat.value
    .slice(close + 1)
    .trim()
    .split(/\s+/u);
  const start = fieldsAfterComm[19]; // field 22; field 3 is index 0 here.
  return typeof start === "string"
    ? ok(start)
    : fail("missing /proc starttime");
}

export function scanEnviron(procRoot: string, uid: number): Probe<string[]> {
  return collectProcesses({ procRoot, uid }).environSessionIds;
}

export function scanOpenPaths(
  procRoot: string,
  uid: number,
  dir: string,
): Probe<string[]> {
  return pathFacts(collectProcesses({ procRoot, uid }).openPaths(dir));
}
const pathFacts = (paths: OpenPaths): Probe<string[]> =>
  paths.unknown.length > 0
    ? fail(paths.unknown.join("; "))
    : ok(paths.open.map((p) => p.path));

export function statTranscript(path: string): Probe<TranscriptFact> {
  if (!existsSync(path)) return ok({ exists: false });
  const stat = capture(() => lstatSync(path));
  if (!stat.ok) return stat;
  if (!stat.value.isFile()) return fail("transcript is not a regular file");
  return ok({ exists: true, mtimeMs: stat.value.mtimeMs });
}

export const defaultLivenessProbes: LivenessProbes = {
  readSessions,
  procStarttime,
  scanEnviron,
  scanOpenPaths,
  statTranscript,
};

export function collectLivenessFacts(
  ref: LivenessRef,
  options: {
    home: string;
    procRoot?: string;
    now?: number;
    graceHours: number;
    probes?: Partial<LivenessProbes>;
    processes?: ProcessSnapshot;
    ignoreUnreadableProcs?: readonly string[];
  },
): LivenessFacts {
  const procRoot = options.procRoot ?? "/proc";
  const probes = { ...defaultLivenessProbes, ...options.probes };
  const processes =
    options.processes ??
    collectProcesses({
      procRoot,
      uid: ref.uid,
      ignoreUnreadableProcs: options.ignoreUnreadableProcs ?? [],
    });
  return {
    sessions: captureProbe(() =>
      probes.readSessions(join(options.home, ".claude/sessions")),
    ),
    procStarttime: (pid) =>
      captureProbe(() => probes.procStarttime(procRoot, pid)),
    environSessionIds:
      options.probes?.scanEnviron === undefined
        ? processes.environSessionIds
        : captureProbe(() => probes.scanEnviron(procRoot, ref.uid)),
    openPaths:
      options.probes?.scanOpenPaths === undefined
        ? pathFacts(processes.openPaths(ref.dir))
        : captureProbe(() => probes.scanOpenPaths(procRoot, ref.uid, ref.dir)),
    transcript: captureProbe(() =>
      probes.statTranscript(
        join(options.home, ".claude/projects", ref.slug, `${ref.uuid}.jsonl`),
      ),
    ),
    now: options.now ?? Temporal.Now.instant().epochMilliseconds,
    graceHours: options.graceHours,
  };
}

export type LivenessSnapshot = {
  facts: (ref: LivenessRef) => LivenessFacts;
  openPaths: (dir: string) => OpenPaths;
  refresh: () => LivenessSnapshot;
};

/** Lazy, bounded to one plan. Session and process evidence is reused by both targets. */
export function createLivenessSnapshot(
  config: Config,
  options: {
    home?: string;
    now?: number;
    procs?: ProcOptions;
    probes?: Partial<LivenessProbes>;
  } = {},
): LivenessSnapshot {
  const home = options.home ?? process.env.HOME ?? homedir();
  const capturedNow = options.now ?? Temporal.Now.instant().epochMilliseconds;
  const processes = new Map<number, ProcessSnapshot>();
  const facts = new Map<string, LivenessFacts>();
  const starts = new Map<number, Probe<string>>();
  let sessions: Probe<SessionEntry[]> | undefined;
  const getProcesses = (uid: number) => {
    let value = processes.get(uid);
    if (value === undefined) {
      value = collectProcesses({
        ...options.procs,
        uid,
        ignoreUnreadableProcs: config.ignore_unreadable_procs ?? [],
      });
      processes.set(uid, value);
    }
    return value;
  };
  const probes: Partial<LivenessProbes> = {
    ...options.probes,
    readSessions: (dir) =>
      (sessions ??= captureProbe(() =>
        (options.probes?.readSessions ?? readSessions)(dir),
      )),
    procStarttime: (root, pid) => {
      const value =
        starts.get(pid) ??
        captureProbe(() =>
          (options.probes?.procStarttime ?? procStarttime)(root, pid),
        );
      starts.set(pid, value);
      return value;
    },
  };
  return {
    refresh: () => createLivenessSnapshot(config, options),
    facts: (ref) => {
      const key = `${ref.uid}:${ref.dir}`;
      let value = facts.get(key);
      if (value === undefined) {
        value = collectLivenessFacts(ref, {
          home,
          now: capturedNow,
          graceHours: config.session_grace_hours,
          procRoot: options.procs?.procRoot ?? "/proc",
          processes: getProcesses(ref.uid),
          probes,
        });
        facts.set(key, value);
      }
      return value;
    },
    openPaths: (dir) => getProcesses(process.getuid?.() ?? 0).openPaths(dir),
  };
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
/** A nested workspace inherits the liveness of its containing <uuid>/scratchpad. */
export function scratchRef(
  path: string,
  roots: readonly string[],
): LivenessRef | null {
  for (const root of roots) {
    const rel = relative(resolve(root), resolve(path));
    if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) continue;
    const [slug, uuid, scratchpad] = rel.split(sep);
    if (
      slug === undefined ||
      uuid === undefined ||
      !uuidPattern.test(uuid) ||
      scratchpad !== "scratchpad"
    )
      continue;
    const uid = /^claude-(\d+)$/u.exec(root.split(sep).at(-1) ?? "")?.[1];
    return {
      uid: uid === undefined ? (process.getuid?.() ?? 0) : Number(uid),
      slug,
      uuid,
      dir: join(root, slug, uuid, scratchpad),
    };
  }
  return null;
}
