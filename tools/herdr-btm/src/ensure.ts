import { mkdir, rm, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createConnection } from "node:net";
import { err, ok, ResultAsync, type Result } from "neverthrow";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";

const Agents = z.object({
  result: z.object({
    agents: z.array(z.object({ agent: z.string(), tab_id: z.string() })),
  }),
});
const Workspaces = z.object({
  result: z.object({
    workspaces: z.array(
      z.object({
        workspace_id: z.string(),
        tokens: z.record(z.string(), z.string()).optional(),
      }),
    ),
  }),
});
const Tabs = z.object({
  result: z.object({
    tabs: z.array(
      z.object({
        tab_id: z.string(),
        workspace_id: z.string(),
        label: z.string(),
        pane_count: z.number(),
      }),
    ),
  }),
});
const Panes = z.object({
  result: z.object({
    panes: z.array(
      z.object({
        pane_id: z.string(),
        tab_id: z.string(),
        label: z.string().optional(),
      }),
    ),
  }),
});
const ProcessInfo = z.object({
  result: z.object({
    process_info: z.object({
      shell_pid: z.number().optional(),
      foreground_processes: z.array(
        z.object({
          pid: z.number(),
          name: z.string(),
          argv: z.array(z.string()),
        }),
      ),
    }),
  }),
});
const Created = z.object({
  result: z.object({
    tab: z.object({ tab_id: z.string(), workspace_id: z.string() }),
  }),
});
const errorOf = (error: unknown) => new Error(String(error));

// https://herdr.dev/docs/socket-api/ documents layout.apply argv launches.
// Herdr returns the actual tab it creates; no user's shell is targeted.
async function launch(
  socketPath: string,
  tabId: string,
): Promise<Result<string, Error>> {
  return ResultAsync.fromPromise(
    new Promise<string>((resolveLaunch, reject) => {
      const socket = createConnection(socketPath);
      let pending = "";
      socket.setTimeout(1500, () => {
        socket.destroy(new Error("layout.apply timed out"));
      });
      socket.on("error", reject);
      socket.on("connect", () => {
        socket.write(
          `${JSON.stringify({
            id: "btm-layout",
            method: "layout.apply",
            params: {
              tab_id: tabId,
              tab_label: "btm",
              focus: false,
              root: {
                type: "pane",
                label: "btm",
                command: [
                  process.execPath,
                  resolve(import.meta.dir, "btmp.ts"),
                ],
              },
            },
          })}\n`,
        );
      });
      socket.on("data", (data) => {
        pending += data.toString();
        if (!pending.includes("\n")) return;
        const response = jsonOf(
          z.object({
            result: z.object({ layout: z.object({ tab_id: z.string() }) }),
            error: z.unknown().optional(),
          }),
        ).safeParse(pending.split("\n")[0]);
        socket.destroy();
        if (!response.success || response.data.error !== undefined)
          reject(new Error(`layout.apply: ${pending.slice(0, 1000)}`));
        else resolveLaunch(response.data.result.layout.tab_id);
      });
      socket.on("end", () => {
        reject(new Error("layout.apply disconnected"));
      });
    }),
    errorOf,
  );
}

async function request<S extends z.ZodType>(
  args: string[],
  schema: S,
): Promise<Result<z.output<S>, Error>> {
  const bin = Bun.which("herdr");
  if (bin === null) return err(new Error("herdr is not on PATH"));
  const child = Bun.spawn([bin, ...args], {
    env: process.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 1500,
    killSignal: "SIGKILL",
  });
  const [out, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0)
    return err(
      new Error(`herdr ${args.join(" ")}: ${error.trim().slice(0, 1000)}`),
    );
  const parsed = jsonOf(schema).safeParse(out);
  return parsed.success
    ? ok(parsed.data)
    : err(new Error(`invalid herdr ${args.join(" ")} response`));
}

async function hasBtm(tabId: string): Promise<Result<boolean, Error>> {
  return (await request(["agent", "list"], Agents)).map(({ result }) =>
    result.agents.some(
      (agent) => agent.agent === "btm" && agent.tab_id === tabId,
    ),
  );
}

async function createBtm(
  socket: string,
  workspaceId: string | undefined,
): Promise<Result<string, Error>> {
  const args =
    workspaceId === undefined
      ? ["workspace", "create", "--label", "btm", "--no-focus"]
      : [
          "tab",
          "create",
          "--workspace",
          workspaceId,
          "--label",
          "btm",
          "--no-focus",
        ];
  const created = await request(args, Created);
  if (created.isErr()) return err(created.error);
  const launched = await launchAndWait(
    socket,
    created.value.result.tab.tab_id,
    created.value.result.tab.workspace_id,
  );
  if (launched.isErr()) return err(launched.error);
  return ok(created.value.result.tab.workspace_id);
}

// Starts btmp in an existing tab, records the workspace, waits for registration.
async function launchAndWait(
  socket: string,
  tabId: string,
  workspaceId: string,
): Promise<Result<void, Error>> {
  const launched = await launch(socket, tabId);
  if (launched.isErr()) return err(launched.error);
  const marked = await markWorkspace(workspaceId);
  if (marked.isErr()) return err(marked.error);
  const deadline = performance.now() + 8000;
  while (performance.now() < deadline) {
    const found = await hasBtm(launched.value);
    if (found.isErr()) return err(found.error);
    if (found.value) return ok(undefined);
    await Bun.sleep(100);
  }
  return err(new Error("btm did not register within 8s"));
}

async function markWorkspace(
  workspaceId: string,
): Promise<Result<void, Error>> {
  const bin = Bun.which("herdr");
  if (bin === null) return err(new Error("herdr is not on PATH"));
  const child = Bun.spawn(
    [
      bin,
      "workspace",
      "report-metadata",
      workspaceId,
      "--source",
      "btmp",
      "--token",
      "btmp_ensured=1",
    ],
    { stdin: "ignore", stdout: "ignore", stderr: "pipe", timeout: 1500 },
  );
  const [code, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);
  if (code !== 0)
    return err(new Error(`herdr workspace report-metadata: ${stderr.trim()}`));
  return ok(undefined);
}

async function markUnrecorded(
  workspaces: z.output<typeof Workspaces>["result"]["workspaces"],
): Promise<Result<void, Error>> {
  for (const workspace of workspaces) {
    if (workspace.tokens?.["btmp_ensured"] === "1") continue;
    const marked = await markWorkspace(workspace.workspace_id);
    if (marked.isErr()) return err(marked.error);
  }
  return ok(undefined);
}

// A btm tab as the server shows it. Herdr restores saved btm tabs at startup,
// before their btmp has registered an agent, so a tab counts as btm when its
// label, a pane label or an agent says so. `kind` tells what runs in it:
// live = btmp/btm runs or is registered; idle = a lone shell (restored but not
// resumed); other = user content (several panes, another program);
// unknown = the pane is not spawned yet, so a resume may still be coming.
type BtmTab = {
  tabId: string;
  workspaceId: string;
  label: string;
  agent: boolean;
  kind: "live" | "idle" | "other" | "unknown";
  // Only a single-pane tab that is live or idle is btm's own and may be closed.
  closable: boolean;
};

const isBtmProcess = (process: { name: string; argv: string[] }): boolean =>
  process.name === "btm" ||
  process.argv.some((arg) => ["btmp", "btmp.ts"].includes(basename(arg)));

async function kindOf(paneId: string): Promise<BtmTab["kind"]> {
  const info = await request(
    ["pane", "process-info", "--pane", paneId],
    ProcessInfo,
  );
  if (info.isErr()) return "unknown";
  const { shell_pid: shell, foreground_processes: running } =
    info.value.result.process_info;
  if (running.some((process) => isBtmProcess(process))) return "live";
  return running.every((process) => process.pid === shell) ? "idle" : "other";
}

// An agent report means live even while process-info is unavailable.
async function tabKind(
  agent: boolean,
  only: { pane_id: string } | undefined,
): Promise<BtmTab["kind"]> {
  if (only === undefined) return agent ? "live" : "other";
  const kind = await kindOf(only.pane_id);
  return agent && kind === "unknown" ? "live" : kind;
}

async function btmTabs(): Promise<Result<BtmTab[], Error>> {
  const agents = await request(["agent", "list"], Agents);
  if (agents.isErr()) return err(agents.error);
  const tabs = await request(["tab", "list"], Tabs);
  if (tabs.isErr()) return err(tabs.error);
  const panes = await request(["pane", "list"], Panes);
  if (panes.isErr()) return err(panes.error);
  const agentTabs = new Set(
    agents.value.result.agents
      .filter((agent) => agent.agent === "btm")
      .map((agent) => agent.tab_id),
  );
  const labelled = new Set(
    panes.value.result.panes
      .filter((pane) => pane.label === "btm")
      .map((pane) => pane.tab_id),
  );
  const found: BtmTab[] = [];
  for (const tab of tabs.value.result.tabs) {
    const agent = agentTabs.has(tab.tab_id);
    if (!agent && tab.label !== "btm" && !labelled.has(tab.tab_id)) continue;
    const only =
      tab.pane_count === 1
        ? panes.value.result.panes.find((pane) => pane.tab_id === tab.tab_id)
        : undefined;
    const kind = await tabKind(agent, only);
    found.push({
      tabId: tab.tab_id,
      workspaceId: tab.workspace_id,
      label: tab.label,
      agent,
      kind,
      closable: only !== undefined && (kind === "live" || kind === "idle"),
    });
  }
  return ok(found);
}

async function markAll(): Promise<Result<void, Error>> {
  const workspaces = await request(["workspace", "list"], Workspaces);
  if (workspaces.isErr()) return err(workspaces.error);
  return markUnrecorded(workspaces.value.result.workspaces);
}

type Plan = { keeper: BtmTab; tabs: BtmTab[] };

// Picks the one btm tab of the server: the registered one, then a running one,
// else a restored idle shell, which is launched into unless a record says btm
// was closed on purpose. Undefined means: leave everything as it is for now.
async function planBtm(
  socket: string,
  tabs: BtmTab[],
  recorded: boolean,
): Promise<Result<Plan | undefined, Error>> {
  const live =
    tabs.find((tab) => tab.agent) ?? tabs.find((tab) => tab.kind === "live");
  if (live !== undefined) return ok({ keeper: live, tabs });
  // Restored btm tabs whose pane is not spawned yet may still resume btmp.
  if (tabs.some((tab) => tab.kind === "unknown")) return ok(undefined);
  const idle = tabs.find((tab) => tab.kind === "idle");
  // Only user content carries the btm label: nothing to start or close.
  if (idle === undefined) return ok(undefined);
  if (recorded) return ok({ keeper: idle, tabs });
  // The resume types btmp into a restored shell a moment after it spawns;
  // act only if the tabs are still idle after that window.
  await Bun.sleep(1500);
  const again = await btmTabs();
  if (again.isErr()) return err(again.error);
  if (again.value.some((tab) => tab.kind === "live" || tab.kind === "unknown"))
    return ok(undefined);
  const started = await launchAndWait(socket, idle.tabId, idle.workspaceId);
  if (started.isErr()) return err(started.error);
  return ok({ keeper: idle, tabs: again.value });
}

// Duplicates are closed only when btm's own: one pane, running btmp or idle.
async function converge({ keeper, tabs }: Plan): Promise<Result<void, Error>> {
  const done = z.object({ result: z.unknown() });
  for (const tab of tabs) {
    if (tab.tabId === keeper.tabId || !tab.closable) continue;
    const closed = await request(["tab", "close", tab.tabId], done);
    if (closed.isErr()) return err(closed.error);
  }
  if (keeper.label === "btm") return markAll();
  // Installed help: herdr tab rename <TAB_ID> <LABEL>...
  const renamed = await request(["tab", "rename", keeper.tabId, "btm"], done);
  if (renamed.isErr()) return err(renamed.error);
  return markAll();
}

async function ensureLocked(socket: string): Promise<Result<void, Error>> {
  const found = await btmTabs();
  if (found.isErr()) return err(found.error);
  const workspaces = await request(["workspace", "list"], Workspaces);
  if (workspaces.isErr()) return err(workspaces.error);
  const all = workspaces.value.result.workspaces;
  const recorded = all.some(
    (workspace) => workspace.tokens?.["btmp_ensured"] === "1",
  );
  if (found.value.length > 0) {
    const plan = await planBtm(socket, found.value, recorded);
    if (plan.isErr()) return err(plan.error);
    return plan.value === undefined ? ok(undefined) : converge(plan.value);
  }
  if (recorded) return markUnrecorded(all);
  const created = await createBtm(socket, all[0]?.workspace_id);
  if (created.isErr()) return err(created.error);
  return markUnrecorded(all.slice(1));
}

// One lock per explicit socket serializes scheduler/manual ensures. A killed
// ensure's lease expires after 30s; normal requests + registration finish in 15s.
export async function ensureBtm(): Promise<Result<void, Error>> {
  const socket = process.env["HERDR_SOCKET_PATH"];
  if (socket === undefined || socket === "")
    return err(new Error("ensure requires HERDR_SOCKET_PATH"));
  const lock = `${resolve(socket)}.btm-ensure.lock`;
  const acquired = await ResultAsync.fromPromise(
    mkdir(lock),
    (error: unknown) => error,
  );
  if (acquired.isErr()) {
    if (
      !z.object({ code: z.literal("EEXIST") }).safeParse(acquired.error).success
    )
      return err(errorOf(acquired.error));
    const age = await stat(lock).then(
      (info) => Temporal.Now.instant().epochMilliseconds - info.mtimeMs,
      () => 0,
    );
    if (age > 30000) await rm(lock, { recursive: true, force: true });
    return ok(undefined);
  }
  await using _release = {
    [Symbol.asyncDispose]: async () => {
      await rm(lock, { recursive: true, force: true });
    },
  };
  return await ensureLocked(socket);
}
