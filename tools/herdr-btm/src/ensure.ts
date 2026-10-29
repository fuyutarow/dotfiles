import { mkdir, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
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
    workspaces: z.array(z.object({ workspace_id: z.string() })),
  }),
});
const Created = z.object({
  result: z.object({ tab: z.object({ tab_id: z.string() }) }),
});
const errorOf = (error: unknown) => new Error(String(error));

// https://herdr.dev/docs/socket-api/ documents layout.apply argv launches.
// Only the just-created placeholder tab is replaced; no user's shell is targeted.
async function launch(
  socketPath: string,
  tabId: string,
): Promise<Result<void, Error>> {
  return ResultAsync.fromPromise(
    new Promise<void>((resolveLaunch, reject) => {
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
          z.object({ result: z.unknown(), error: z.unknown().optional() }),
        ).safeParse(pending.split("\n")[0]);
        socket.destroy();
        if (!response.success || response.data.error !== undefined)
          reject(new Error(`layout.apply: ${pending.slice(0, 1000)}`));
        else resolveLaunch();
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

async function hasBtm(): Promise<Result<boolean, Error>> {
  return (await request(["agent", "list"], Agents)).map(({ result }) =>
    result.agents.some((agent) => agent.agent === "btm"),
  );
}

async function ensureLocked(socket: string): Promise<Result<void, Error>> {
  const agents = await request(["agent", "list"], Agents);
  if (agents.isErr()) return err(agents.error);
  const existingTabs = new Set(
    agents.value.result.agents
      .filter((agent) => agent.agent === "btm")
      .map((agent) => agent.tab_id),
  );
  for (const tabId of existingTabs) {
    const current = await request(
      ["tab", "get", tabId],
      z.object({
        result: z.object({ tab: z.object({ label: z.string() }) }),
      }),
    );
    if (current.isErr()) return err(current.error);
    if (current.value.result.tab.label === "btm") continue;
    // Installed help: herdr tab rename <TAB_ID> <LABEL>...
    const renamed = await request(
      ["tab", "rename", tabId, "btm"],
      z.object({ result: z.unknown() }),
    );
    if (renamed.isErr()) return err(renamed.error);
  }
  if (existingTabs.size > 0) return ok(undefined);
  const workspaces = await request(["workspace", "list"], Workspaces);
  if (workspaces.isErr()) return err(workspaces.error);
  const workspace = workspaces.value.result.workspaces[0];
  const args =
    workspace === undefined
      ? ["workspace", "create", "--label", "btm", "--no-focus"]
      : [
          "tab",
          "create",
          "--workspace",
          workspace.workspace_id,
          "--label",
          "btm",
          "--no-focus",
        ];
  const created = await request(args, Created);
  if (created.isErr()) return err(created.error);
  const launched = await launch(socket, created.value.result.tab.tab_id);
  if (launched.isErr()) return launched;
  const deadline = performance.now() + 8000;
  while (performance.now() < deadline) {
    const registered = await hasBtm();
    if (registered.isErr()) return err(registered.error);
    if (registered.value) return ok(undefined);
    await Bun.sleep(100);
  }
  return err(new Error("btm did not register within 8s"));
}

// One lock per explicit socket serializes scheduler/manual ensures. A killed
// ensure's lease expires after 30s; normal requests + registration finish in 15s.
export async function ensureBtm(): Promise<Result<void, Error>> {
  const socket = process.env.HERDR_SOCKET_PATH;
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
