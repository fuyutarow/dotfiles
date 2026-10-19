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
import { jsonOf, z } from "../../shared/src/zod.ts";

const argv = process.argv.slice(2);
const cli = standardCli(cleyeCli, cliPackage, () => argv);
const AgentSchema = z.object({
  agent: z.string().optional(),
  pane_id: z.string().optional(),
  tab_id: z.string().optional(),
  agent_session: z.object({ value: z.string().optional() }).nullish(),
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
  if (session === undefined) return "session id unavailable";
  const unavailable = FleetSessionUnavailableSchema.safeParse(session);
  if (unavailable.success) return unavailable.data.why;
  const parsed = FleetSessionSchema.safeParse(session);
  if (!parsed.success) return "identity unavailable";
  const unavailableName = FleetSessionUnavailableSchema.safeParse(
    parsed.data.name,
  );
  return unavailableName.success
    ? unavailableName.data.why
    : "identity unavailable";
}

export async function projectAgents(
  agents: Agent[],
  sessions: ReadonlyMap<string, FleetSessionRead>,
  apply: (args: string[]) => Promise<boolean>,
): Promise<number> {
  let updated = 0;
  for (const agent of agents) {
    if (agent.pane_id === undefined || agent.tab_id === undefined) continue;
    const sessionId = agent.agent_session?.value;
    const session =
      sessionId === undefined ? undefined : sessions.get(sessionId);
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
      priorSessionId === sessionId &&
      priorName !== "" &&
      !priorName.includes("(unidentified:");
    if (!known && priorKnown) continue;

    const why = sessionWhy(session);
    const name =
      knownName ??
      `${agent.agent ?? "agent"} ${agent.pane_id} (unidentified: ${why})`;
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
      `fleet_session_id=${sessionId ?? ""}`,
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
