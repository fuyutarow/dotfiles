#!/usr/bin/env bun
import { cli as cleyeCli } from "cleye";
import { standardCli } from "../../shared/src/cli.ts";
import cliPackage from "../package.json" with { type: "json" };
import {
  FleetSessionSchema,
  FleetSessionUnavailableSchema,
  readFleetSession,
  type FleetSessionRead,
} from "../../shared/src/fleet-session.ts";
import { readCodexSessionStatus } from "../../statusline/src/adapters/codex-rollout.ts";
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
    new Response(child.stdout).text().catch(() => ""),
    child.exited,
  ]);
  return code === 0 ? output : undefined;
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
  if (session === undefined) return "no id";
  const unavailable = FleetSessionUnavailableSchema.safeParse(session);
  if (unavailable.success) {
    if (unavailable.data.why.includes("missing")) return "missing";
    if (unavailable.data.why.includes("invalid")) return "invalid";
    return "unknown";
  }
  return "unknown";
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

type CodexSessionLookup = (cwd: string) => Promise<string | undefined>;

export async function projectAgents(
  agents: Agent[],
  sessions: ReadonlyMap<string, FleetSessionRead>,
  apply: (args: string[]) => Promise<boolean>,
  findCodexSessionId: CodexSessionLookup = async (cwd) =>
    (await readCodexSessionStatus(cwd))?.sessionId,
): Promise<number> {
  let updated = 0;
  for (const agent of agents) {
    if (agent.pane_id === undefined || agent.tab_id === undefined) continue;
    const vendor = agent.agent;
    const herdrSessionId = agent.agent_session?.value;
    let sessionId = herdrSessionId;
    if (
      sessionId === undefined &&
      vendor === "codex" &&
      agent.cwd !== undefined
    )
      sessionId = await findCodexSessionId(agent.cwd);
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
      (parsedCandidate.data.vendor !== vendor ||
        parsedCandidate.data.session_id !== sessionId)
        ? undefined
        : sessionId;
    const parsedSession = FleetSessionSchema.safeParse(session);
    const identity = parsedSession.success ? parsedSession.data : undefined;
    const knownName =
      identity !== undefined && typeof identity.name === "string"
        ? identity.name
        : undefined;
    const known = knownName !== undefined;
    const priorSessionId = agent.tokens?.fleet_session_id;
    const priorName = agent.tokens?.fullname ?? "";
    const priorKnown =
      priorSessionId === matchedSessionId &&
      priorName !== "" &&
      !priorName.includes("(unidentified:");
    if (!known && priorKnown) continue;

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
    const rc = agent.tokens?.rc ?? "rc:?";

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
  return projectAgents(agents, sessions, herdr);
}

if (import.meta.main) {
  if (argv.some((arg) => ["--help", "-h", "--version", "-V"].includes(arg))) {
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
