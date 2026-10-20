#!/usr/bin/env bun
import { cli as cleyeCli } from "cleye";
import { mkdir, rename } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { attempt } from "../../shared/src/attempt.ts";
import { standardCli } from "../../shared/src/cli.ts";
import cliPackage from "../package.json" with { type: "json" };
import {
  FleetSessionSchema,
  FleetSessionUnavailableSchema,
  readFleetSession,
  fleetCwdMatches,
  codexRolloutPath,
  readCodexNativeSession,
  writeFleetSessionIfChanged,
  type FleetSession,
  type FleetSessionRead,
} from "../../shared/src/fleet-session.ts";
import { jsonOf, z } from "../../shared/src/zod.ts";

const argv = process.argv.slice(2);
const cli = standardCli(cleyeCli, cliPackage, () => argv);
const AgentSchema = z.object({
  agent: z.string().optional(),
  pane_id: z.string().optional(),
  tab_id: z.string().optional(),
  agent_session: z.object({ value: z.string().optional() }).nullish(),
  cwd: z.string().optional(),
  tokens: z.record(z.string(), z.string()).nullish(),
});
const ListSchema = z.object({
  result: z.object({ agents: z.array(AgentSchema) }),
});
type Agent = z.output<typeof AgentSchema>;

async function run(
  command: string,
  args: string[],
): Promise<string | undefined> {
  const bin = Bun.which(command);
  if (bin === null) return undefined;
  const child = Bun.spawn([bin, ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
    timeout: 2500,
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
    /^← for agents · \? for shortcuts(?:[ \t]+⚠ 1 warning · f2 to view)?$/u;
  const selection =
    /^New activity · Earlier messages available\.[ \t]+\^c copy · enter copy & follow · esc clear$/u;
  if (!shortcuts.test(controls) && !selection.test(controls)) return undefined;
  const shape =
    /^\s*([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}) · (GPT-[A-Za-z0-9.-]+) (minimal|low|medium|high|xhigh|max|ultra) · ((?:\/|~\/)[^·\r\n]+) · (Working|Ready|Idle|Done|Blocked)\s*$/u;
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
): Promise<Map<string, FleetSessionRead>> {
  const sessions = new Map<string, FleetSessionRead>();
  for (const agent of agents) {
    if (agent.agent !== "codex") continue;
    agent.agent_session = undefined; // A previous tick's native ID is never evidence now.
    if (agent.pane_id === undefined) continue;
    const pane = agent.pane_id;
    const footer = nativeFooterObservation((await readTail(pane)) ?? "");
    if (footer === undefined) continue;
    const cwd = nativeFooterCwd(footer.cwd, env);
    if (cwd === undefined) continue;
    const id = footer.id;
    const path = await codexRolloutPath(id, env);
    if (path === undefined) continue;
    const unknown = {
      na: true,
      why: "not observed by native footer projector",
    } satisfies FleetSessionRead;
    const existing = FleetSessionSchema.safeParse(
      await readFleetSession(id, env),
    );
    const preserved =
      existing.success &&
      existing.data.vendor === "codex" &&
      (await fleetCwdMatches(existing.data.cwd, cwd))
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
      await readCodexNativeSession(seed, env, path),
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
      "dotfiles:herdr-projector",
      "--agent",
      "codex",
      "--agent-session-id",
      id,
    ]);
    if (!reported) continue;
    if (
      JSON.stringify(nativeFooterObservation((await readTail(pane)) ?? "")) !==
      JSON.stringify(footer)
    )
      continue;
    const written = await writeFleetSessionIfChanged(
      { ...refreshed.data, model: footer.model, effort: footer.effort },
      env,
    );
    if (!written.ok) continue;
    agent.agent_session = { value: id };
    sessions.set(id, written.value);
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
      "dotfiles:herdr-projector",
      "--agent",
      "codex",
    ]);
  }
  return sessions;
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

export async function projectAgents(
  agents: Agent[],
  sessions: ReadonlyMap<string, FleetSessionRead>,
  apply: (args: string[]) => Promise<boolean>,
): Promise<number> {
  let updated = 0;
  for (const agent of agents) {
    if (agent.pane_id === undefined || agent.tab_id === undefined) continue;
    const vendor = agent.agent;
    const herdrSessionId = agent.agent_session?.value;
    const sessionId = herdrSessionId;
    let candidate =
      sessionId === undefined ? undefined : sessions.get(sessionId);
    if (
      candidate === undefined &&
      sessionId !== undefined &&
      herdrSessionId === undefined
    )
      candidate = await readFleetSession(sessionId);
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
    const why = sessionWhy(session);
    const name = knownName ?? unavailableLabel(agent, why);
    const model =
      identity !== undefined && typeof identity.model === "string"
        ? identity.model
        : "";
    const effort =
      identity !== undefined && typeof identity.effort === "string"
        ? identity.effort
        : "";
    // Fleet-session records do not carry RC state, so never inherit a pane token
    // that may have been written by an older projector or statusline.
    const rc = "rc:?";

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
      "--token",
      `rc=${rc}`,
      "--token",
      `fleet_session_id=${matchedSessionId ?? ""}`,
    ]);
    if (renamed && reported) updated++;
  }
  process.stdout.write(`herdr-projector: projected ${updated} pane(s)\n`);
  return 0;
}

async function project(): Promise<number> {
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
    const ok = await herdr(args);
    applied = applied && ok;
    return ok;
  };
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
  );
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
        }),
      )
      .digest("hex");
  if (applied && cached.success && cached.data.key === fingerprint()) {
    process.stdout.write("herdr-projector: unchanged; projected 0 pane(s)\n");
    return 0;
  }
  const result = await projectAgents(agents, sessions, apply);
  // A failed mutation must be retried, and cache trouble must not block projection.
  if (applied && cacheDir !== undefined && cachePath !== undefined) {
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
  if (
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
