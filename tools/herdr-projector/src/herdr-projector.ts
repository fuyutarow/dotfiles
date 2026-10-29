#!/usr/bin/env bun
import { cli as cleyeCli } from "cleye";
import { mkdir, rename } from "node:fs/promises";
import { release } from "node:os";
import { isAbsolute, join } from "node:path";
import { attempt } from "../../shared/src/attempt.ts";
import { standardCli } from "../../shared/src/cli.ts";
import cliPackage from "../package.json" with { type: "json" };
import {
  FleetSessionSchema,
  FleetSessionUnavailableSchema,
  readFleetSession,
  codexRolloutPath,
  readCodexNativeSession,
  writeFleetSessionIfChanged,
  type FleetSession,
  type FleetSessionRead,
} from "../../shared/src/fleet-session.ts";
import {
  readCodexNativeTitle,
  type CodexNativeTitleRead,
} from "../../shared/src/codex-native-title.ts";
import { jsonOf, z } from "../../shared/src/zod.ts";

const argv = process.argv.slice(2);
const cli = standardCli(cleyeCli, cliPackage, () => argv);
export const AgentSchema = z.object({
  agent: z.string().optional(),
  pane_id: z.string().optional(),
  tab_id: z.string().optional(),
  agent_session: z
    .object({
      value: z.string().optional(),
      source: z.string().optional(),
      kind: z.string().optional(),
      agent: z.string().optional(),
    })
    .nullish(),
  cwd: z.string().optional(),
  terminal_title_stripped: z.string().optional(),
  tokens: z.record(z.string(), z.string()).nullish(),
});
const ListSchema = z.object({
  result: z.object({ agents: z.array(AgentSchema) }),
});
const AgentCpuSchema = z.object({
  schema: z.literal(1),
  at: z.iso.datetime(),
  window_ms: z.number().int().positive(),
  host: z.object({ cpu_pct: z.number(), cores: z.number().int().positive() }),
  agx: z.enum(["ok", "unavailable"]),
  sessions: z.array(
    z.object({
      session_id: z.string(),
      vendor: z.enum(["claude", "codex"]),
      pid: z.number().int(),
      cpu_pct: z.number(),
      workers: z
        .object({ count: z.number().int().nonnegative(), cpu_pct: z.number() })
        .nullable(),
    }),
  ),
  unresolved_agents: z.array(
    z.object({
      pid: z.number().int(),
      vendor: z.enum(["claude", "codex"]),
      cpu_pct: z.number(),
    }),
  ),
  unowned: z.array(z.object({ label: z.string(), cpu_pct: z.number() })),
});
const HERDR_TIMEOUT_MS = 2500;
type AgentCpuSnapshot = z.output<typeof AgentCpuSchema>;
type Agent = z.output<typeof AgentSchema>;
type PaneTitleBinding = { sessionId: string; title: CodexNativeTitleRead };

/** Native session_index is an append log: a rename adds a newer exact-ID row. */
export async function readProjectorTitle(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CodexNativeTitleRead> {
  const strict = await readCodexNativeTitle(id, env);
  if (
    strict.kind === "known" ||
    strict.reason !== "session ID is duplicated in index"
  )
    return strict;
  const path = join(
    env.CODEX_HOME ?? join(env.HOME ?? "", ".codex"),
    "session_index.jsonl",
  );
  const file = Bun.file(path);
  if (file.size > 2 * 1024 * 1024) return strict;
  const text = await file.text().catch(() => "");
  const Row = z.object({
    id: z.string(),
    thread_name: z.string().min(1).max(512),
    updated_at: z.iso.datetime(),
  });
  const rows = [];
  for (const line of text.trimEnd().split("\n")) {
    const parsed = jsonOf(Row).safeParse(line);
    if (!parsed.success) return strict;
    if (parsed.data.id === id) rows.push(parsed.data);
  }
  rows.sort((a, b) => Temporal.Instant.compare(b.updated_at, a.updated_at));
  const latest = rows[0];
  if (latest === undefined || latest.thread_name.trim().length === 0)
    return strict;
  for (const character of latest.thread_name) {
    const point = character.codePointAt(0) ?? 0;
    if (
      point <= 31 ||
      (point >= 127 && point <= 159) ||
      point === 0x2028 ||
      point === 0x2029
    )
      return strict;
  }
  if (
    rows.some(
      (row) =>
        row.updated_at === latest.updated_at &&
        row.thread_name !== latest.thread_name,
    )
  )
    return strict;
  return {
    kind: "known",
    sessionId: id,
    displayTitle: latest.thread_name,
    sourceUpdatedAt: latest.updated_at,
    observedAt: Temporal.Now.instant().toString(),
  };
}
const RegisteredCodexSchema = z.object({
  source: z.literal("herdr:codex"),
  kind: z.literal("id"),
  agent: z.literal("codex"),
  value: z.string().regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u),
});

async function run(
  command: string,
  args: string[],
  timeoutMs = HERDR_TIMEOUT_MS,
): Promise<string | undefined> {
  const bin = Bun.which(command);
  if (bin === null) return undefined;
  const child = Bun.spawn([bin, ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
    timeout: timeoutMs,
    killSignal: "SIGKILL",
  });
  const [output, code] = await Promise.all([
    boundedOutput(child.stdout),
    child.exited,
  ]);
  return code === 0 ? output : undefined;
}

async function boundedOutput(
  stream: ReadableStream<Uint8Array>,
): Promise<string | undefined> {
  const result = await attempt(async (): Promise<string | undefined> => {
    const reader = stream.getReader();
    using _release = {
      [Symbol.dispose]: () => {
        reader.releaseLock();
      },
    };
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) return Buffer.concat(chunks).toString("utf8");
      size += next.value.length;
      if (size > 1024 * 1024) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(next.value);
    }
  });
  return result.ok ? result.value : undefined;
}

export async function readAgentCpu(
  env: NodeJS.ProcessEnv = process.env,
  now = Temporal.Now.instant().epochMilliseconds,
): Promise<AgentCpuSnapshot | undefined> {
  const state =
    env.XDG_STATE_HOME === undefined || env.XDG_STATE_HOME === ""
      ? join(env.HOME ?? "", ".local", "state")
      : env.XDG_STATE_HOME;
  const text = await Bun.file(join(state, "dotfiles", "agent-cpu.json"))
    .text()
    .catch(() => "");
  const parsed = jsonOf(AgentCpuSchema).safeParse(text);
  if (
    !parsed.success ||
    now - Temporal.Instant.from(parsed.data.at).epochMilliseconds > 180_000
  )
    return undefined;
  return parsed.data;
}

/** Only the complete penultimate native status row, followed by native shortcuts.
 * The caller requests the visible viewport, never conversation history.
 */
export function nativeFooterObservation(text: string):
  | {
      id: string;
      model: string;
      effort: string;
      cwd: string;
      state: string;
    }
  | undefined {
  if (text.length > 8192 || text.includes("\u001B")) return undefined;
  const rows = text.trimEnd().split(/\r?\n/u);
  if (rows.length > 5 || rows.length < 2) return undefined;
  const controls = rows.at(-1)?.trim() ?? "";
  const shortcuts =
    /^(?:← for agents · \? for shortcuts(?:[ \t]+⚠ [1-9]\d* warnings? · f2 to view)?|⚠ [1-9]\d* warnings? · f2 to view)$/u;
  const selection =
    /^New activity · (?:Earlier messages available\.[ \t]+)?\^c copy · enter copy & follow · esc clear$/u;
  if (!shortcuts.test(controls) && !selection.test(controls)) return undefined;
  const shape =
    /^\s*([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}) · (GPT-[A-Za-z0-9.-]+) (minimal|low|medium|high|xhigh|max|ultra) · ((?:\/|~)[^·\r\n]*) · (Working|Ready|Idle|Done|Blocked)(?: · Main \[default\])?\s*$/u;
  const matches = rows.flatMap((row) => shape.exec(row)?.[1] ?? []);
  const match = shape.exec(rows.at(-2) ?? "");
  if (matches.length !== 1 || match === null) return undefined;
  const [, id, model, effort, cwd, state] = match;
  if (
    id === undefined ||
    model === undefined ||
    effort === undefined ||
    cwd === undefined ||
    state === undefined
  )
    return undefined;
  return { id, model, effort, cwd, state };
}

export function nativeFooterId(text: string): string | undefined {
  return nativeFooterObservation(text)?.id;
}

function nativeFooterCwd(
  cwd: string,
  env: NodeJS.ProcessEnv,
): string | undefined {
  if (isAbsolute(cwd)) return cwd;
  const home = env.HOME;
  if (cwd.trim() === "~" && home !== undefined && isAbsolute(home)) return home;
  if (!cwd.startsWith("~/") || home === undefined || !isAbsolute(home))
    return undefined;
  return join(home, cwd.slice(2));
}

/** Refresh every Codex pane before the projection cache can skip a cycle. */
export async function bindNativeCodexFooters(
  agents: Agent[],
  readTail: (pane: string) => Promise<string | undefined>,
  apply: (args: string[]) => Promise<boolean>,
  env: NodeJS.ProcessEnv = process.env,
  titles: Map<string, PaneTitleBinding> = new Map(),
  readTitle: typeof readCodexNativeTitle = readProjectorTitle,
  dryRun = false,
  reasons: Map<string, string> = new Map(),
): Promise<Map<string, FleetSessionRead>> {
  const sessions = new Map<string, FleetSessionRead>();
  for (const agent of agents) {
    if (agent.agent !== "codex") continue;
    const registered = RegisteredCodexSchema.safeParse(agent.agent_session);
    // Registration supplies only a provisional display ID. It cannot bind this
    // pane or refresh a fleet record without an independently observed footer.
    agent.agent_session = registered.success ? registered.data : undefined;
    if (registered.success)
      sessions.set(registered.data.value, {
        na: true,
        why: "native footer validation unavailable",
      });
    if (agent.pane_id === undefined) continue;
    const pane = agent.pane_id;
    const footer = nativeFooterObservation((await readTail(pane)) ?? "");
    if (footer === undefined) {
      reasons.set(pane, "footer not visible");
      await bindRegisteredCodex(
        agent,
        sessions,
        titles,
        reasons,
        env,
        readTitle,
      );
      continue;
    }
    const cwd = nativeFooterCwd(footer.cwd, env);
    if (cwd === undefined) continue;
    const id = footer.id;
    const path = await codexRolloutPath(id, env);
    if (path === undefined) {
      reasons.set(pane, "no exact rollout");
      process.stderr.write(
        `herdr-projector: ${pane}: exact rollout lookup ${id} under ${env.CODEX_HOME ?? join(env.HOME ?? "", ".codex")}/sessions: missing, ambiguous or read limit\n`,
      );
      continue;
    }
    const unknown = {
      na: true,
      why: "not observed by native footer projector",
    } satisfies FleetSessionRead;
    const existing = FleetSessionSchema.safeParse(
      await readFleetSession(id, env),
    );
    const preserved =
      existing.success && existing.data.vendor === "codex"
        ? existing.data
        : undefined;
    const seed: FleetSession = {
      schema: 1,
      session_id: id,
      vendor: "codex",
      cwd,
      pane_id: pane,
      name: preserved?.name ?? unknown,
      model: unknown,
      effort: unknown,
      ctx: preserved?.ctx ?? unknown,
      rate: preserved?.rate ?? unknown,
      updated_at: Temporal.Now.instant().toString(),
    };
    const refreshed = FleetSessionSchema.safeParse(
      await readCodexNativeSession(seed, env, path, "verified-native-footer"),
    );
    if (
      !refreshed.success ||
      JSON.stringify(nativeFooterObservation((await readTail(pane)) ?? "")) !==
        JSON.stringify(footer)
    )
      continue;
    const reported = await apply([
      "pane",
      "report-agent-session",
      pane,
      "--source",
      "herdr:codex",
      "--agent",
      "codex",
      "--agent-session-id",
      id,
    ]);
    if (!reported) continue;
    const title = await readTitle(id, env);
    if (
      JSON.stringify(nativeFooterObservation((await readTail(pane)) ?? "")) !==
      JSON.stringify(footer)
    )
      continue;
    const next = {
      ...refreshed.data,
      model: footer.model,
      effort: footer.effort,
    };
    const written = dryRun
      ? { ok: true, value: next }
      : await writeFleetSessionIfChanged(next, env);
    if (!written.ok) continue;
    agent.agent_session = { value: id };
    sessions.set(id, written.value);
    titles.set(pane, { sessionId: id, title });
  }
  // Omitted session fields explicitly report an unavailable native identity.
  // Do this after failed validation as well as after a missing/clipped footer.
  for (const agent of agents) {
    if (
      agent.agent !== "codex" ||
      agent.pane_id === undefined ||
      agent.agent_session?.value !== undefined
    )
      continue;
    await apply([
      "pane",
      "report-agent-session",
      agent.pane_id,
      "--source",
      "herdr:codex",
      "--agent",
      "codex",
    ]);
  }
  return sessions;
}

async function bindRegisteredCodex(
  agent: Agent,
  sessions: Map<string, FleetSessionRead>,
  titles: Map<string, PaneTitleBinding>,
  reasons: Map<string, string>,
  env: NodeJS.ProcessEnv,
  readTitle: typeof readCodexNativeTitle,
): Promise<void> {
  const registered = RegisteredCodexSchema.safeParse(agent.agent_session);
  if (
    !registered.success ||
    agent.cwd === undefined ||
    agent.pane_id === undefined
  )
    return;
  const id = registered.data.value;
  const path = await codexRolloutPath(id, env);
  if (path === undefined) return;
  const title = await readTitle(id, env);
  const unknown = { na: true, why: "not in registered rollout" } as const;
  const fallback = FleetSessionSchema.safeParse(
    await readCodexNativeSession(
      {
        schema: 1,
        vendor: "codex",
        session_id: id,
        cwd: agent.cwd,
        pane_id: agent.pane_id,
        name: unknown,
        model: unknown,
        effort: unknown,
        ctx: unknown,
        rate: unknown,
        updated_at: Temporal.Now.instant().toString(),
      },
      env,
      path,
    ),
  );
  if (!fallback.success) return;
  sessions.set(id, fallback.data);
  titles.set(agent.pane_id, { sessionId: id, title });
  reasons.delete(agent.pane_id);
}

async function agentList(): Promise<Agent[] | undefined> {
  // Newer Herdr versions accept --json; the installed CLI emits the same JSON envelope by default.
  const output =
    (await run("herdr", ["agent", "list", "--json"])) ??
    (await run("herdr", ["agent", "list"]));
  if (output === undefined) return undefined;
  const parsed = jsonOf(ListSchema).safeParse(output.trim());
  return parsed.success ? parsed.data.result.agents : undefined;
}

async function herdr(args: string[]): Promise<boolean> {
  const output = await run("herdr", args);
  return output !== undefined;
}

function sessionWhy(session: FleetSessionRead | undefined): string {
  if (session === undefined) return "no session id";
  const unavailable = FleetSessionUnavailableSchema.safeParse(session);
  if (unavailable.success) {
    if (unavailable.data.why.includes("missing")) return "no session file";
    if (unavailable.data.why.includes("invalid")) return "invalid session file";
    return "session unavailable";
  }
  const parsed = FleetSessionSchema.safeParse(session);
  const name = parsed.success
    ? FleetSessionUnavailableSchema.safeParse(parsed.data.name)
    : undefined;
  return name?.success === true ? "name unavailable" : "session unavailable";
}

function unavailableLabel(agent: Agent, why: string): string {
  const shortWhy = why.slice(0, 20);
  const suffix = ` · n/a(${shortWhy})`;
  const name = agent.agent ?? "agent";
  return `${name.slice(0, Math.max(1, 40 - suffix.length))}${suffix}`.slice(
    0,
    40,
  );
}

/** Only the owned statusline in the visible native footer, never an agx row. */
export function claudeFooterObservation(
  text: string,
):
  | { id: string; name: string; model: string; effort: string; rc: string }
  | undefined {
  if (text.length > 32 * 1024 || text.includes("\u001B")) return undefined;
  const rows = text.trimEnd().split(/\r?\n/u);
  if (
    rows.length > 20 ||
    !/^\s*⏵⏵ auto mode on(?: \(shift\+tab to cycle\)| · \d+ shells)?\s*$/u.test(
      rows.at(-1) ?? "",
    )
  )
    return undefined;
  const matches = rows.flatMap((row, index) => {
    if (
      !/^\s*\S+@\S+:\d{2}-\d{2} \d{2}:\d{2}[+-]\d{2}\|/u.test(
        rows[index - 1] ?? "",
      )
    )
      return [];
    const match =
      /^\s*Claude \(stdin\) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| (🔗|rc:on|rc:off|rc:\?) \| Ctx: [^|]+ \| [^|]+ \| Session: ([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\s*$/u.exec(
        row,
      );
    if (match === null) return [];
    const [, name, model, effort, rc, id] = match;
    if (
      name === undefined ||
      model === undefined ||
      effort === undefined ||
      rc === undefined ||
      id === undefined
    )
      return [];
    return [
      {
        id,
        name: name.trim(),
        model: model.trim(),
        effort: effort.trim(),
        rc: rc === "🔗" ? "rc:on" : rc,
      },
    ];
  });
  return matches.length === 1 ? matches[0] : undefined;
}

export async function nativeClaudeRc(
  agent: Agent,
  env: NodeJS.ProcessEnv,
  readProcess = (pane: string) =>
    run("herdr", ["pane", "process-info", "--pane", pane]),
): Promise<string | undefined> {
  const registeredId = agent.agent_session?.value;
  if (
    registeredId === undefined ||
    agent.agent_session?.source !== "herdr:claude" ||
    agent.pane_id === undefined
  )
    return undefined;
  const ProcessInfo = jsonOf(
    z.object({
      result: z.object({
        process_info: z.object({
          foreground_processes: z.array(
            z.object({ pid: z.number().int().positive(), name: z.string() }),
          ),
        }),
      }),
    }),
  );
  const info = ProcessInfo.safeParse(await readProcess(agent.pane_id));
  for (const proc of info.data?.result.process_info.foreground_processes ??
    []) {
    if (proc.name !== "claude") continue;
    const path = join(
      env.CLAUDE_CONFIG_DIR ?? join(env.HOME ?? "", ".claude"),
      "sessions",
      `${proc.pid}.json`,
    );
    const native = jsonOf(
      z.object({
        pid: z.literal(proc.pid),
        sessionId: z.literal(registeredId),
        procStart: z.string(),
        bridgeSessionId: z.string().min(1),
      }),
    ).safeParse(
      await Bun.file(path)
        .slice(0, 64 * 1024)
        .text()
        .catch(() => ""),
    );
    // Herdr owns the host process namespace; /proc here may be a worker's namespace.
    const confirmed = ProcessInfo.safeParse(await readProcess(agent.pane_id));
    if (
      native.success &&
      confirmed.data?.result.process_info.foreground_processes.some(
        (current) => current.pid === proc.pid && current.name === "claude",
      ) === true
    )
      return "rc:on";
  }
  return undefined;
}

export async function bindClaudePanes(
  agents: Agent[],
  remoteControl: Map<string, string>,
  env: NodeJS.ProcessEnv = process.env,
  readTail = (pane: string) =>
    run("herdr", [
      "pane",
      "read",
      pane,
      "--source",
      "visible",
      "--format",
      "text",
      "--lines",
      "20",
    ]),
): Promise<Map<string, FleetSessionRead>> {
  const sessions = new Map<string, FleetSessionRead>();
  for (const agent of agents) {
    if (
      agent.agent !== "claude" ||
      agent.pane_id === undefined ||
      agent.cwd === undefined
    )
      continue;
    const nativeRc = await nativeClaudeRc(agent, env);
    if (nativeRc !== undefined) remoteControl.set(agent.pane_id, nativeRc);
    const observed = claudeFooterObservation(
      (await readTail(agent.pane_id)) ?? "",
    );
    if (observed === undefined) continue;
    const id = observed.id;
    const path = join(
      env.CLAUDE_CONFIG_DIR ?? join(env.HOME ?? "", ".claude"),
      "projects",
      agent.cwd.replaceAll(/[^a-zA-Z0-9]/gu, "-"),
      `${id}.jsonl`,
    );
    const read = await attempt(() =>
      Bun.file(path)
        .slice(0, 128 * 1024)
        .text(),
    );
    if (!read.ok) {
      process.stderr.write(
        `herdr-projector: ${agent.pane_id}: read ${path}: ${String(read.error)}\n`,
      );
      continue;
    }
    const Row = z.object({ sessionId: z.literal(id) });
    if (
      !read.value
        .split("\n")
        .slice(0, -1)
        .some((line) => jsonOf(Row).safeParse(line).success)
    )
      continue;
    if (
      JSON.stringify(
        claudeFooterObservation((await readTail(agent.pane_id)) ?? ""),
      ) !== JSON.stringify(observed)
    )
      continue;
    const existing = FleetSessionSchema.safeParse(
      await readFleetSession(id, env),
    );
    const unknown = {
      na: true,
      why: "not in native footer",
    } satisfies FleetSessionRead;
    const nativeName = /^[a-z0-9]+(?:-[a-z0-9]+)*-agt_[a-z0-9]+$/u.test(
      observed.name,
    )
      ? observed.name
      : agent.terminal_title_stripped;
    const parsed = FleetSessionSchema.safeParse({
      schema: 1,
      session_id: id,
      vendor: "claude",
      cwd: agent.cwd,
      pane_id: agent.pane_id,
      name: nativeName ?? (existing.success ? existing.data.name : unknown),
      model: observed.model,
      effort: observed.effort,
      ctx: unknown,
      rate: unknown,
      updated_at: Temporal.Now.instant().toString(),
    });
    if (!parsed.success) continue;
    agent.agent_session = { value: id };
    if (observed.rc !== "rc:?" || !remoteControl.has(agent.pane_id))
      remoteControl.set(agent.pane_id, observed.rc);
    sessions.set(id, parsed.data);
  }
  return sessions;
}

/** Same runtime surfaces as codex-remote doctor; never reads the declaration. */
export async function nativeCodexRc(
  env: NodeJS.ProcessEnv = process.env,
  readArgs = (pid: number) => run("ps", ["-o", "args=", "-p", String(pid)]),
  osRelease = release(),
): Promise<string> {
  // Equivalent public OS read to doctor's ctx.isWsl (scripts/doctor.ts).
  // Windows Desktop owns the native app-server on WSL, not this daemon.
  if (/microsoft/iu.test(osRelease))
    return "not applicable: Windows Desktop owns the native Codex app-server on WSL";
  const directory = join(
    env.CODEX_HOME ?? join(env.HOME ?? "", ".codex"),
    "app-server-daemon",
  );
  const pid = jsonOf(z.object({ pid: z.number().int().positive() })).safeParse(
    await Bun.file(join(directory, "app-server.pid"))
      .text()
      .catch(() => ""),
  );
  if (pid.success) {
    const args = await readArgs(pid.data.pid);
    if (args === undefined) return "daemon process unreadable";
    if (/(?:^|\s)(?:\S*\/)?codex\s+app-server(?:\s|$)/u.test(args))
      return args.split(/\s+/u).includes("--remote-control")
        ? "rc:on"
        : "rc:off";
    return "managed daemon process not observed";
  }
  const settings = jsonOf(
    z.object({ remoteControlEnabled: z.boolean() }),
  ).safeParse(
    await Bun.file(join(directory, "settings.json"))
      .text()
      .catch(() => ""),
  );
  if (!settings.success) return "daemon settings unreadable";
  return settings.data.remoteControlEnabled ? "rc:on" : "rc:off";
}

export async function projectAgents(
  agents: Agent[],
  sessions: ReadonlyMap<string, FleetSessionRead>,
  apply: (args: string[]) => Promise<boolean>,
  titles: ReadonlyMap<string, PaneTitleBinding> = new Map(),
  remoteControl: ReadonlyMap<string, string> = new Map(),
  reasons: ReadonlyMap<string, string> = new Map(),
  cpuSnapshot?: AgentCpuSnapshot,
): Promise<number> {
  let updated = 0;
  for (const agent of agents) {
    if (agent.pane_id === undefined || agent.tab_id === undefined) continue;
    const vendor = agent.agent;
    const herdrSessionId = agent.agent_session?.value;
    const sessionId = herdrSessionId;
    const candidate =
      sessionId === undefined ? undefined : sessions.get(sessionId);
    const parsedCandidate = FleetSessionSchema.safeParse(candidate);
    let session: FleetSessionRead | undefined;
    if (
      parsedCandidate.success &&
      parsedCandidate.data.vendor === vendor &&
      parsedCandidate.data.session_id === sessionId
    ) {
      session = parsedCandidate.data;
    } else if (
      candidate !== undefined &&
      FleetSessionUnavailableSchema.safeParse(candidate).success
    ) {
      session = candidate;
    }
    const matchedSessionId =
      parsedCandidate.success &&
      parsedCandidate.data.vendor === vendor &&
      parsedCandidate.data.session_id === sessionId
        ? sessionId
        : undefined;
    const parsedSession = FleetSessionSchema.safeParse(session);
    const identity = parsedSession.success ? parsedSession.data : undefined;
    const knownName =
      identity !== undefined && typeof identity.name === "string"
        ? identity.name
        : undefined;
    const titleBinding =
      agent.pane_id === undefined ? undefined : titles.get(agent.pane_id);
    const nativeTitle =
      vendor === "codex" &&
      sessionId !== undefined &&
      identity?.vendor === "codex" &&
      identity.session_id === sessionId &&
      titleBinding?.sessionId === sessionId &&
      titleBinding.title.sessionId === sessionId &&
      titleBinding.title.kind === "known"
        ? titleBinding.title.displayTitle
        : undefined;
    const why = reasons.get(agent.pane_id) ?? sessionWhy(session);
    const name = knownName ?? nativeTitle ?? unavailableLabel(agent, why);
    const model =
      identity !== undefined && typeof identity.model === "string"
        ? identity.model
        : "";
    const effort =
      identity !== undefined && typeof identity.effort === "string"
        ? identity.effort
        : "";
    // Read observations for this pane; never recycle projector-owned display tokens.
    const isAgent = vendor === "claude" || vendor === "codex";
    const rc = remoteControl.get(agent.pane_id);
    const marker = isAgent && rc === "rc:on" ? "🔗" : "";
    const notApplicable =
      isAgent && rc?.startsWith("not applicable: ") === true;
    const unknownRc =
      isAgent && !notApplicable && rc !== "rc:on" && rc !== "rc:off";
    const displayRc =
      unknownRc && (model !== "" || effort !== "") ? "rc?" : marker;
    const cpuSession =
      matchedSessionId === undefined
        ? undefined
        : cpuSnapshot?.sessions.find(
            (row) =>
              row.session_id === matchedSessionId && row.vendor === vendor,
          );
    const cpuToken =
      cpuSession === undefined ? "cpu:?" : `cpu:${cpuSession.cpu_pct}%`;
    let workerToken = "w:?";
    if (cpuSession?.workers !== undefined && cpuSession.workers !== null) {
      workerToken =
        cpuSession.workers.count === 0
          ? ""
          : `w:${cpuSession.workers.count}·${cpuSession.workers.cpu_pct}%`;
    }
    const unowned =
      cpuSnapshot?.unowned
        .map((row) => `${row.label} ${row.cpu_pct}%`)
        .join(" · ") ?? "";
    const cpuArgs: string[] = [];
    if (isAgent)
      cpuArgs.push(
        "--token",
        `cpu=${cpuToken}`,
        ...(workerToken === ""
          ? ["--clear-token", "workers"]
          : ["--token", `workers=${workerToken}`]),
      );
    if (vendor === "btm")
      cpuArgs.push(
        ...(unowned === ""
          ? ["--clear-token", "unowned"]
          : ["--token", `unowned=${unowned}`]),
      );
    const renamed = await apply(["tab", "rename", agent.tab_id, name]);
    const reported = await apply([
      "pane",
      "report-metadata",
      agent.pane_id,
      "--source",
      "dotfiles:herdr-projector",
      "--token",
      `fullname=${name}`,
      "--token",
      `model=${model}`,
      "--token",
      `effort=${effort}`,
      ...(displayRc !== ""
        ? ["--token", `rc=${displayRc}`]
        : ["--clear-token", "rc"]),
      "--token",
      `rc_reason=${unknownRc || notApplicable ? (rc ?? "remote-control observation unavailable") : ""}`,
      "--token",
      `fleet_session_id=${matchedSessionId ?? ""}`,
      ...cpuArgs,
    ]);
    if (renamed && reported) updated++;
  }
  process.stdout.write(`herdr-projector: projected ${updated} pane(s)\n`);
  return 0;
}

export function agentCpuCacheInput(
  snapshot: AgentCpuSnapshot | undefined,
): string {
  return JSON.stringify(snapshot ?? null);
}

export function nativeTitleCacheInputs(
  titles: ReadonlyMap<string, PaneTitleBinding>,
) {
  return [...titles.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([paneId, binding]) => ({
      paneId,
      boundId: binding.sessionId,
      title:
        binding.title.kind === "known"
          ? {
              kind: binding.title.kind,
              value: binding.title.displayTitle,
              sourceUpdatedAt: binding.title.sourceUpdatedAt,
            }
          : { kind: binding.title.kind, reason: binding.title.reason },
    }));
}

async function project(dryRun = false): Promise<number> {
  const cpuSnapshot = await readAgentCpu();
  const agents = await agentList();
  if (agents === undefined) {
    process.stderr.write(
      "herdr-projector: herdr agent list unavailable or invalid\n",
    );
    return 1;
  }
  const runtime = process.env.XDG_RUNTIME_DIR;
  let applied = true;
  const apply = async (args: string[]) => {
    if (dryRun) {
      process.stdout.write(`${JSON.stringify({ wouldApply: args })}\n`);
      return true;
    }
    const ok = await herdr(args);
    applied = applied && ok;
    return ok;
  };
  const titleBindings = new Map<string, PaneTitleBinding>();
  const reasons = new Map<string, string>();
  const nativeSessions = await bindNativeCodexFooters(
    agents,
    (pane) =>
      run("herdr", [
        "pane",
        "read",
        pane,
        "--source",
        "visible",
        "--format",
        "text",
        "--lines",
        "5",
      ]),
    apply,
    process.env,
    titleBindings,
    readProjectorTitle,
    dryRun,
    reasons,
  );
  const remoteControl = new Map<string, string>();
  const codexPanes = agents.filter((pane) => pane.agent === "codex");
  const codexRc = codexPanes.length === 0 ? "" : await nativeCodexRc();
  for (const agent of codexPanes) {
    if (agent.pane_id === undefined) continue;
    remoteControl.set(agent.pane_id, codexRc);
  }
  const claudeSessions = await bindClaudePanes(agents, remoteControl);
  const cacheDir =
    runtime === undefined || runtime === ""
      ? undefined
      : join(runtime, "herdr-projector");
  const cachePath =
    cacheDir === undefined
      ? undefined
      : join(cacheDir, `${Bun.hash(import.meta.path)}.json`);
  const Cache = jsonOf(z.object({ key: z.string() }));
  const cached = Cache.safeParse(
    cachePath === undefined
      ? ""
      : await Bun.file(cachePath)
          .slice(0, 4096)
          .text()
          .catch(() => ""),
  );
  const sessionIds = [
    ...new Set(
      agents.flatMap((agent) => {
        const id = agent.agent_session?.value;
        return id === undefined || id === "" ? [] : [id];
      }),
    ),
  ];
  const results = await Promise.all(
    sessionIds.map(async (id) => [id, await readFleetSession(id)] as const),
  );
  const sessions = new Map(results);
  for (const [id, session] of nativeSessions) sessions.set(id, session);
  for (const [id, session] of claudeSessions) sessions.set(id, session);
  const identities = () =>
    [...sessions.entries()]
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([id, session]) => {
        const parsed = FleetSessionSchema.safeParse(session);
        if (!parsed.success) return [id, session];
        const { vendor, session_id, name, model, effort } = parsed.data;
        return [id, { vendor, session_id, name, model, effort }];
      });
  const panes = agents.map((agent) => ({
    ...agent,
    tokens: {
      fullname: agent.tokens?.fullname,
      model: agent.tokens?.model,
      effort: agent.tokens?.effort,
      rc: agent.tokens?.rc,
      fleet_session_id: agent.tokens?.fleet_session_id,
    },
  }));
  const fingerprint = () =>
    new Bun.CryptoHasher("sha256")
      .update(
        JSON.stringify({
          version: cliPackage.version,
          panes,
          identities: identities(),
          titles: nativeTitleCacheInputs(titleBindings),
          remoteControl: [...remoteControl],
          reasons: [...reasons],
          cpuSnapshot: agentCpuCacheInput(cpuSnapshot),
        }),
      )
      .digest("hex");
  if (
    !dryRun &&
    applied &&
    cached.success &&
    cached.data.key === fingerprint()
  ) {
    process.stdout.write("herdr-projector: unchanged; projected 0 pane(s)\n");
    return 0;
  }
  const result = await projectAgents(
    agents,
    sessions,
    apply,
    titleBindings,
    remoteControl,
    reasons,
    cpuSnapshot,
  );
  // A failed mutation must be retried, and cache trouble must not block projection.
  if (!dryRun && applied && cacheDir !== undefined && cachePath !== undefined) {
    await (async () => {
      const currentIds = new Set(
        agents.flatMap((agent) => agent.agent_session?.value ?? []),
      );
      for (const id of sessions.keys())
        if (!currentIds.has(id)) sessions.delete(id);
      await mkdir(cacheDir, { recursive: true, mode: 0o700 });
      const temp = `${cachePath}.${process.pid}.tmp`;
      await Bun.write(temp, JSON.stringify({ key: fingerprint() }), {
        mode: 0o600,
      });
      await rename(temp, cachePath);
    })().catch(() => null);
  }
  return applied ? result : 1;
}

if (import.meta.main) {
  if (argv.length === 1 && argv[0] === "--dry-run") {
    process.exitCode = await project(true);
  } else if (
    argv.some(
      (arg) =>
        ["--help", "-h", "--version", "-V"].includes(arg) ||
        arg.startsWith("-"),
    )
  ) {
    cli({
      name: "herdr-projector",
      parameters: [],
      strictFlags: true,
      flags: {
        dryRun: {
          type: Boolean,
          description:
            "Read current panes and print proposed writes without applying them",
        },
      },
      help: {
        description: "Project fleet session identities onto Herdr panes.",
      },
    });
  } else if (argv.length > 0) {
    process.stderr.write("herdr-projector: unexpected arguments; use --help\n");
    process.exitCode = 2;
  } else {
    process.exitCode = await project();
  }
}
